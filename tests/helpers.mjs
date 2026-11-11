// Shared harness: a local HTTP server standing in for MemDB, and a runner that
// executes plugins/memdb-memory/scripts/memdb-cmd.mjs exactly as a slash command would.
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
export const SCRIPT = process.env.MEMDB_CMD || resolve(here, '../plugins/memdb-memory/scripts/memdb-cmd.mjs');
export const UUID = '123e4567-e89b-12d3-a456-426614174000';
export const NEW_UUID = '223e4567-e89b-12d3-a456-426614174999';

/** Starts a stub MemDB. `handler(req)` returns {status, body}; every request is recorded. */
export async function startStub() {
  const stub = { requests: [], handler: null };
  const server = createServer((req, res) => {
    let body = '';
    req.setEncoding('utf8'); // multi-byte characters can straddle chunks
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const rec = { method: req.method, url: req.url, headers: req.headers, body };
      stub.requests.push(rec);
      const { status = 200, body: out = { code: 200, data: [] } } = stub.handler(rec) ?? {};
      res.statusCode = status;
      res.setHeader('Content-Type', 'application/json');
      res.end(typeof out === 'string' ? out : JSON.stringify(out));
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  stub.port = server.address().port;
  stub.close = () => server.close();
  stub.reset = (handler) => { stub.requests.length = 0; stub.handler = handler; };
  return stub;
}

/** A throwaway HOME with a config.env pointing at the stub. */
export function makeHome(port, extra = '') {
  const home = mkdtempSync(join(tmpdir(), 'memdb-cmd-'));
  mkdirSync(join(home, '.config/claude-code-memdb'), { recursive: true });
  writeFileSync(join(home, '.config/claude-code-memdb/config.env'),
    `MEMDB_API_URL=http://127.0.0.1:${port}\nINTERNAL_SERVICE_SECRET=s3cret\nMEMDB_PERSON_ID=tester\nMEMDB_CUBE_ID=cube-1\n${extra}`);
  return home;
}

/** Writes `text` to the input file (when given), runs the script, reports what happened. */
export async function run(home, sub, { text, args } = {}) {
  const input = join(home, '.memdb-memory-input.txt');
  rmSync(input, { force: true });
  rmSync(join(home, 'PWNED'), { force: true });
  if (text !== undefined) writeFileSync(input, text);
  const argv = args ?? (sub === 'info' ? ['info'] : [sub, '--file', input]);
  const child = spawn(process.execPath, [SCRIPT, ...argv], {
    cwd: home,
    env: { PATH: process.env.PATH, HOME: home },
  });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (c) => { stdout += c; });
  child.stderr.on('data', (c) => { stderr += c; });
  const code = await new Promise((r) => child.on('close', r));
  return {
    code, stdout, stderr,
    inputLeft: existsSync(input),
    pwned: existsSync(join(home, 'PWNED')),
  };
}

// Text that would do damage if any shell, JSON template or marker handling ever saw it.
export const HOSTILE = {
  'single quote break-out': `x'; touch PWNED; echo '`,
  'double quote break-out': `x"; touch PWNED; "`,
  'json break-out': `x"}]}; touch PWNED #`,
  'command substitution': `$(touch PWNED)`,
  'backticks': '`touch PWNED`',
  'newlines': `line one\ntouch PWNED\nline three`,
  'the old here-doc marker': `before\nMEMDB_END_7f3a9c\ntouch PWNED\nMEMDB_CUBE_END_c41e\nafter`,
  'backslashes': `a\\' ; touch PWNED ; '\\"`,
  'unicode and control chars': `héllo 😀 \u0007 \t tab   sep`,
  'everything at once': `'"$(touch PWNED)\`touch PWNED\`;\n|&<>(){}\\`,
};
