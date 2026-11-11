// Runs the bash blocks of the /memory-* slash commands the way the model would:
// `$ARGUMENTS` is replaced textually by the user's text, the block is executed,
// and a local HTTP server stands in for MemDB.
//
//   node --test tests/        (needs bash and Node 18+; COMMANDS_DIR overrides the commands under test)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const commandsDir = process.env.COMMANDS_DIR || resolve(here, '../plugins/memdb-memory/commands');
const UUID = '123e4567-e89b-12d3-a456-426614174000';

// Each payload tries to create ./PWNED if a shell ever interprets it.
const PAYLOADS = {
  'single quote break-out': `x'; touch PWNED; echo '`,
  'double quote break-out': `x"; touch PWNED; "`,
  'json break-out': `x"}]}; touch PWNED #`,
  'command substitution': `$(touch PWNED)`,
  'backticks': '`touch PWNED`',
  'semicolon': `a; touch PWNED #`,
  'newline': `line one\ntouch PWNED\nline three`,
  'backslashes': `a\\' ; touch PWNED ; '\\"`,
  'everything at once': `'"$(touch PWNED)\`touch PWNED\`;\n|&<>(){}\\`,
};

const bashBlocks = (file) =>
  [...readFileSync(join(commandsDir, file), 'utf8').matchAll(/```bash\n([\s\S]*?)```/g)].map((m) => m[1]);

let server, port, requests, home;

before(async () => {
  server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      requests.push({ method: req.method, url: req.url, headers: req.headers, body });
      res.setHeader('Content-Type', 'application/json');
      res.end('{"code":200,"data":[]}');
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  port = server.address().port;
  home = mkdtempSync(join(tmpdir(), 'memdb-cmd-'));
  mkdirSync(join(home, '.config/claude-code-memdb'), { recursive: true });
  // Plain assignments, not exported: the commands must read them after `source`.
  writeFileSync(join(home, '.config/claude-code-memdb/config.env'),
    `MEMDB_API_URL=http://127.0.0.1:${port}\nINTERNAL_SERVICE_SECRET=s3cret\nMEMDB_USER_ID=tester\nMEMDB_CUBE_ID=cube-1\n`);
});

after(() => {
  server.close();
  rmSync(join(home, 'PWNED'), { force: true });
});

async function run(block, { args, cube = 'cube-9' }) {
  requests = [];
  rmSync(join(home, 'PWNED'), { force: true });
  const script = block.split('$ARGUMENTS').join(args).split('CUBE_ID_HERE').join(cube);
  const child = spawn(process.env.TEST_BASH || 'bash', ['-c', script], {
    cwd: home,
    env: { PATH: process.env.PATH, HOME: home },
  });
  let stderr = '';
  child.stderr.on('data', (c) => { stderr += c; });
  child.stdout.resume();
  const code = await new Promise((r) => child.on('close', r));
  return { code, stderr, executed: existsSync(join(home, 'PWNED')), requests: [...requests] };
}

const bodyOf = (r) => JSON.parse(r.body);

for (const [name, payload] of Object.entries(PAYLOADS)) {
  test(`/memory-add (${name}): nothing executed, text stored verbatim`, async () => {
    const r = await run(bashBlocks('memory-add.md')[0], { args: payload });
    assert.equal(r.executed, false, 'payload was executed by a shell');
    assert.equal(r.requests.length, 1, r.stderr);
    assert.equal(r.requests[0].url, '/product/add');
    assert.equal(r.requests[0].headers['x-internal-service'], 's3cret');
    const body = bodyOf(r.requests[0]);
    assert.equal(body.messages[0].content, payload);
    assert.deepEqual(body.writable_cube_ids, ['cube-1']);
    assert.equal(body.user_id, 'tester');
  });

  test(`/memory-search (${name}): nothing executed, query sent verbatim`, async () => {
    const r = await run(bashBlocks('memory-search.md')[0], { args: payload });
    assert.equal(r.executed, false, 'payload was executed by a shell');
    assert.equal(r.requests.length, 1, r.stderr);
    assert.equal(bodyOf(r.requests[0]).query, payload);
  });

  test(`/memory-delete (${name}): not a UUID, so nothing runs and nothing is sent`, async () => {
    const r = await run(bashBlocks('memory-delete.md')[0], { args: payload });
    assert.equal(r.executed, false, 'payload was executed by a shell');
    assert.equal(r.requests.length, 0);
    assert.notEqual(r.code, 0);
  });

  test(`/memory-update (${name}): content and cube id arrive verbatim`, async () => {
    const [get, put] = bashBlocks('memory-update.md');
    const g = await run(get, { args: `${UUID} ${payload}` });
    assert.equal(g.executed, false, 'payload was executed by a shell (get)');
    assert.equal(g.requests.length, 1, g.stderr);
    assert.equal(g.requests[0].url, `/product/get_memory/${UUID}`);

    const p = await run(put, { args: `${UUID} ${payload}`, cube: payload });
    assert.equal(p.executed, false, 'payload was executed by a shell (update)');
    assert.equal(p.requests.length, 2, p.stderr);
    assert.deepEqual(bodyOf(p.requests[0]).memory_ids, [UUID]);
    const add = bodyOf(p.requests[1]);
    assert.equal(add.messages[0].content, payload);
    assert.deepEqual(add.writable_cube_ids, [payload]);
  });

  test(`/memory-update (${name}): hostile first word is rejected before anything runs`, async () => {
    for (const block of bashBlocks('memory-update.md')) {
      const r = await run(block, { args: `${payload} new text` });
      assert.equal(r.executed, false, 'payload was executed by a shell');
      assert.equal(r.requests.length, 0);
    }
  });
}

test('/memory-delete with a real UUID deletes it', async () => {
  const r = await run(bashBlocks('memory-delete.md')[0], { args: UUID });
  assert.equal(r.requests.length, 1, r.stderr);
  assert.deepEqual(bodyOf(r.requests[0]), { user_id: 'tester', memory_ids: [UUID] });
});
