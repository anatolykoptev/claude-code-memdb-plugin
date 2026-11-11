// node --test tests/    (Node 18+, no other dependencies)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, symlinkSync, existsSync, readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startStub, makeHome, run, HOSTILE, UUID, NEW_UUID } from './helpers.mjs';

let stub, home;
before(async () => { stub = await startStub(); home = makeHome(stub.port); });
after(() => stub.close());

const json = (r) => JSON.parse(r.body);
const ok = (data = []) => ({ body: { code: 200, message: 'ok', data } });

// ---- add / search: user text is data ---------------------------------------

for (const [name, text] of Object.entries(HOSTILE)) {
  test(`add (${name}): stored verbatim, nothing executed, file removed`, async () => {
    stub.reset(() => ok([{ memory_id: NEW_UUID }]));
    const r = await run(home, 'add', { text });
    assert.equal(r.code, 0, r.stderr);
    assert.equal(r.pwned, false);
    assert.equal(r.inputLeft, false);
    assert.equal(stub.requests.length, 1);
    const [req] = stub.requests;
    assert.equal(req.method, 'POST');
    assert.equal(req.url, '/product/add');
    assert.equal(req.headers['x-internal-service'], 's3cret');
    assert.deepEqual(json(req), {
      user_id: 'tester',
      writable_cube_ids: ['cube-1'],
      mode: 'fast',
      messages: [{ role: 'user', content: text.trim() }],
    });
  });

  test(`search (${name}): query sent verbatim`, async () => {
    stub.reset(() => ok({ text_mem: [] }));
    const r = await run(home, 'search', { text });
    assert.equal(r.code, 0, r.stderr);
    assert.equal(r.pwned, false);
    assert.deepEqual(json(stub.requests[0]), {
      query: text.trim(),
      user_id: 'tester',
      readable_cube_ids: ['cube-1'],
      top_k: 10,
      relativity: 0.85,
    });
  });
}

test('add: a very long text arrives intact', async () => {
  const text = ('lorem ipsum "quoted" $(x) \n' + 'é'.repeat(50)).repeat(3000); // ~ 330 KB
  stub.reset(() => ok([{ memory_id: NEW_UUID }]));
  const r = await run(home, 'add', { text });
  assert.equal(r.code, 0, r.stderr);
  assert.equal(json(stub.requests[0]).messages[0].content, text.trim());
});

test('add: input over 1 MiB is refused before any request, and the file is removed', async () => {
  stub.reset(() => ok());
  const r = await run(home, 'add', { text: 'x'.repeat(1024 * 1024 + 1) });
  assert.equal(r.code, 2);
  assert.equal(stub.requests.length, 0);
  assert.equal(r.inputLeft, false);
});

test('add: empty or blank input exits 2 with no request', async () => {
  for (const text of ['', ' \n\t \n']) {
    stub.reset(() => ok());
    const r = await run(home, 'add', { text });
    assert.equal(r.code, 2);
    assert.equal(stub.requests.length, 0);
    assert.equal(r.inputLeft, false);
  }
});

test('add: a server error is a failure, not a success', async () => {
  for (const reply of [{ status: 500, body: { message: 'boom' } }, { status: 200, body: { code: 500, message: 'boom' } }, { status: 200, body: 'not json' }]) {
    stub.reset(() => reply);
    const r = await run(home, 'add', { text: 'remember me' });
    assert.equal(r.code, 1, JSON.stringify(reply));
  }
});

test('add: MemDB unreachable gives a clear message', async () => {
  const dead = makeHome(1); // nothing listens on port 1
  const r = await run(dead, 'add', { text: 'x' });
  assert.equal(r.code, 1);
  assert.match(r.stderr, /cannot reach MemDB/);
});

test('add: success output is the server response', async () => {
  stub.reset(() => ok([{ memory_id: NEW_UUID, memory: 'hi' }]));
  const r = await run(home, 'add', { text: 'hi' });
  assert.equal(JSON.parse(r.stdout).data[0].memory_id, NEW_UUID);
});

// ---- delete: strict id -----------------------------------------------------

test('delete: a real UUID is deleted', async () => {
  stub.reset(() => ok({ deleted_count: 1 }));
  const r = await run(home, 'delete', { text: `${UUID}\n` });
  assert.equal(r.code, 0, r.stderr);
  assert.equal(stub.requests[0].url, '/product/delete_memory');
  assert.deepEqual(json(stub.requests[0]), { user_id: 'tester', memory_ids: [UUID] });
});

test('delete: anything that is not exactly one UUID is refused before any request', async () => {
  const bad = [
    ...Object.values(HOSTILE),
    UUID.replaceAll('-', ''),                 // 32 hex, no dashes (the old regex let this through)
    '--------------------------------',       // 32 dashes (the old regex let this through)
    'abcdef01-2345-6789-abcd-ef012345678',    // one char short
    `${UUID}x`,
    `${UUID} extra words`,
    `${UUID}\n${UUID}`,
    `../${UUID}`,
    `${UUID}/../../x`,
    'zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz',
    '',
  ];
  for (const text of bad) {
    stub.reset(() => ok({ deleted_count: 1 }));
    const r = await run(home, 'delete', { text });
    assert.equal(r.code, 2, JSON.stringify(text));
    assert.equal(stub.requests.length, 0, JSON.stringify(text));
    assert.equal(r.pwned, false);
    assert.equal(r.inputLeft, false);
  }
});

// ---- update: resolve cube, add first, delete last --------------------------

const memoryRecord = (cube = 'cube-OTHER') => ({
  code: 200,
  data: { memory_id: UUID, properties: JSON.stringify({ user_name: cube, memory: 'old words' }) },
});

function updateStub(overrides = {}) {
  stub.reset((req) => {
    const key = `${req.method} ${req.url.replace(UUID, ':id')}`;
    if (overrides[key]) return overrides[key];
    switch (key) {
      case 'GET /product/get_memory/:id': return { body: memoryRecord() };
      case 'POST /product/add': return ok([{ memory_id: NEW_UUID, memory: 'new' }]);
      case 'POST /product/delete_memory': return ok({ deleted_count: 1 });
      default: return { status: 404, body: { code: 404, message: 'unexpected ' + key } };
    }
  });
}
const sequence = () => stub.requests.map((q) => `${q.method} ${q.url.replace(UUID, ':id')}`);

test('update: looks the cube up itself, adds first, deletes last', async () => {
  updateStub();
  const r = await run(home, 'update', { text: `${UUID} brand new words` });
  assert.equal(r.code, 0, r.stderr);
  assert.deepEqual(sequence(), ['GET /product/get_memory/:id', 'POST /product/add', 'POST /product/delete_memory']);
  const [, add, del] = stub.requests;
  assert.deepEqual(json(add), {
    user_id: 'tester',
    writable_cube_ids: ['cube-OTHER'],   // the memory's own cube, not the configured one
    mode: 'fast',
    messages: [{ role: 'user', content: 'brand new words' }],
  });
  assert.deepEqual(json(del), { user_id: 'tester', writable_cube_ids: ['cube-OTHER'], memory_ids: [UUID] });
  const out = JSON.parse(r.stdout);
  assert.equal(out.status, 'updated');
  assert.equal(out.old_memory, 'old words');
  assert.deepEqual(out.new_ids, [NEW_UUID]);
});

test('update: hostile new content is data', async () => {
  for (const [name, text] of Object.entries(HOSTILE)) {
    updateStub();
    const r = await run(home, 'update', { text: `${UUID} ${text}` });
    assert.equal(r.code, 0, `${name}: ${r.stderr}`);
    assert.equal(r.pwned, false, name);
    assert.equal(stub.requests[0].url, `/product/get_memory/${UUID}`);
    assert.equal(json(stub.requests[1]).messages[0].content, text.trim(), name);
  }
});

test('update: a hostile or malformed first word is refused before any request', async () => {
  const bad = [
    ...Object.values(HOSTILE).map((t) => `${t} new text`),
    UUID, `${UUID}   `, '', `${UUID.slice(1)} new text`, `${UUID}x new text`,
  ];
  for (const text of bad) {
    updateStub();
    const r = await run(home, 'update', { text });
    assert.equal(r.code, 2, JSON.stringify(text));
    assert.equal(stub.requests.length, 0, JSON.stringify(text));
    assert.equal(r.pwned, false);
  }
});

test('update: a hostile cube id from the server stays in JSON and is never executed', async () => {
  const cube = `x"; touch PWNED; $(touch PWNED) \`touch PWNED\`\nMEMDB_CUBE_END_c41e`;
  updateStub({ 'GET /product/get_memory/:id': { body: memoryRecord(cube) } });
  const r = await run(home, 'update', { text: `${UUID} new` });
  assert.equal(r.code, 0, r.stderr);
  assert.equal(r.pwned, false);
  assert.deepEqual(json(stub.requests[1]).writable_cube_ids, [cube]);
});

test('update: properties may arrive as an object', async () => {
  updateStub({ 'GET /product/get_memory/:id': { body: { code: 200, data: { properties: { user_name: 'c2' } } } } });
  const r = await run(home, 'update', { text: `${UUID} new` });
  assert.equal(r.code, 0, r.stderr);
  assert.deepEqual(json(stub.requests[1]).writable_cube_ids, ['c2']);
});

test('update: lookup failures change nothing', async () => {
  const cases = {
    'memory not found': { status: 404, body: { code: 404, message: 'memory not found' } },
    'server error': { status: 503, body: { code: 503, message: 'degraded' } },
    'no cube in properties': { body: { code: 200, data: { properties: '{"memory":"x"}' } } },
    'properties not JSON': { body: { code: 200, data: { properties: 'garbage' } } },
    'empty cube': { body: { code: 200, data: { properties: { user_name: '' } } } },
    'non-string cube': { body: { code: 200, data: { properties: { user_name: { a: 1 } } } } },
  };
  for (const [name, reply] of Object.entries(cases)) {
    updateStub({ 'GET /product/get_memory/:id': reply });
    const r = await run(home, 'update', { text: `${UUID} new` });
    assert.equal(r.code, 1, name);
    assert.deepEqual(sequence(), ['GET /product/get_memory/:id'], name);
  }
});

test('update: when the add fails the old memory is NOT deleted', async () => {
  const failures = {
    'HTTP 500': { status: 500, body: { code: 500, message: 'boom' } },
    'code 500 in a 200': { status: 200, body: { code: 500, message: 'boom' } },
    'HTTP 500 that still carries data': { status: 500, body: { code: 200, data: [{ memory_id: NEW_UUID }] } },
    'code 500 that still carries data': { status: 200, body: { code: 500, data: [{ memory_id: NEW_UUID }] } },
    'unparseable body': { status: 200, body: 'oops' },
    'nothing stored (empty data)': ok([]),
    'no data field': { body: { code: 200 } },
    'server returned the old id': ok([{ memory_id: UUID }]),
  };
  for (const [name, reply] of Object.entries(failures)) {
    updateStub({ 'POST /product/add': reply });
    const r = await run(home, 'update', { text: `${UUID} new` });
    assert.equal(r.code, 1, name);
    assert.deepEqual(sequence(), ['GET /product/get_memory/:id', 'POST /product/add'], name);
  }
});

test('update: when the delete fails, the new memory exists and the message names the old id', async () => {
  for (const reply of [
    { status: 500, body: { code: 500, message: 'boom' } },
    ok({ deleted_count: 0 }),
  ]) {
    updateStub({ 'POST /product/delete_memory': reply });
    const r = await run(home, 'update', { text: `${UUID} new` });
    assert.equal(r.code, 1);
    assert.deepEqual(sequence(), ['GET /product/get_memory/:id', 'POST /product/add', 'POST /product/delete_memory']);
    assert.match(r.stderr, new RegExp(`${NEW_UUID}.*old memory ${UUID} was NOT deleted`));
    assert.match(r.stderr, /memory-delete/);
  }
});

// ---- info ------------------------------------------------------------------

test('info: queries health, user, config and memories for the configured person', async () => {
  stub.reset((req) => ({ body: { code: 200, path: req.url } }));
  const r = await run(home, 'info');
  assert.equal(r.code, 0, r.stderr);
  assert.deepEqual(sequence(), [
    'GET /health', 'GET /product/users/tester', 'GET /product/users/tester/config', 'POST /product/get_memory',
  ]);
  assert.deepEqual(json(stub.requests[3]), { readable_cube_ids: ['cube-1'], user_id: 'tester', page: 0, page_size: 1 });
  assert.match(r.stdout, /=== Health ===/);
  assert.match(r.stdout, /person_id: tester/);
});

test('info: a failing section is reported and the exit code is non-zero', async () => {
  stub.reset((req) => (req.url === '/health' ? { status: 503, body: { message: 'down' } } : { body: { code: 200 } }));
  const r = await run(home, 'info');
  assert.equal(r.code, 1);
  assert.match(r.stdout, /Health failed \(HTTP 503\)/);
  assert.equal(stub.requests.length, 4);
});

// ---- argument and file handling ---------------------------------------------

test('only fixed flags are accepted on the command line', async () => {
  const input = join(home, '.memdb-memory-input.txt');
  const bad = [
    [], ['nope'], ['add'], ['add', '--file'], ['add', 'extra text'], ['add', '--file', input, 'extra'],
    ['add', '--text', 'hello'], ['info', 'extra'], ['__proto__', '--file', input], ['constructor', '--file', input],
    ['add', '--file', ''],
  ];
  for (const args of bad) {
    stub.reset(() => ok());
    const r = await run(home, 'add', { text: 'x', args });
    assert.equal(r.code, 2, JSON.stringify(args));
    assert.equal(stub.requests.length, 0, JSON.stringify(args));
  }
});

test('a missing input file exits 2', async () => {
  stub.reset(() => ok());
  const r = await run(home, 'add');
  assert.equal(r.code, 2);
  assert.match(r.stderr, /not found/);
  assert.equal(stub.requests.length, 0);
});

test('a symlink or a directory is refused and its target is left alone', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'memdb-link-'));
  const target = join(dir, 'target.txt');
  writeFileSync(target, 'secret target');
  const link = join(dir, 'link.txt');
  symlinkSync(target, link);
  for (const path of [link, dir]) {
    stub.reset(() => ok());
    const r = await run(home, 'add', { args: ['add', '--file', path] });
    assert.equal(r.code, 2, path);
    assert.equal(stub.requests.length, 0);
  }
  assert.equal(readFileSync(target, 'utf8'), 'secret target');
  assert.ok(existsSync(link));
});

// ---- config ------------------------------------------------------------------

test('person id falls back to MEMDB_USER_ID; cube and secret fall back to defaults', async () => {
  const legacy = makeHome(stub.port);
  writeFileSync(join(legacy, '.config/claude-code-memdb/config.env'),
    `MEMDB_API_URL=http://127.0.0.1:${stub.port}\nMEMDB_USER_ID=legacy-user\n`);
  stub.reset(() => ok([{ memory_id: NEW_UUID }]));
  const r = await run(legacy, 'add', { text: 'hello' });
  assert.equal(r.code, 0, r.stderr);
  assert.equal(json(stub.requests[0]).user_id, 'legacy-user');
  assert.equal(json(stub.requests[0]).writable_cube_ids[0], 'memos');
  assert.equal(stub.requests[0].headers['x-internal-service'], '');
});
