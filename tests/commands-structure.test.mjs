// Structural guard for the slash commands: user text must never be able to reach a shell
// command line. Every file in commands/ is checked, so a new command cannot skip the rules.
//
//   node --test tests/        (COMMANDS_DIR overrides the commands under test)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const pluginRoot = resolve(here, '../plugins/memdb-memory');
const commandsDir = process.env.COMMANDS_DIR || join(pluginRoot, 'commands');
const files = readdirSync(commandsDir).filter((f) => f.endsWith('.md'));

const INPUT = '${CLAUDE_PROJECT_DIR}/.memdb-memory-input.txt';
const SCRIPT = '${CLAUDE_PLUGIN_ROOT}/scripts/memdb-cmd.mjs';
const TEXT_COMMANDS = new Set(['memory-add', 'memory-search', 'memory-delete', 'memory-update']);

function parse(file) {
  const src = readFileSync(join(commandsDir, file), 'utf8');
  const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(src);
  assert.ok(m, `${file}: no frontmatter`);
  const fm = {};
  let list = null;
  for (const line of m[1].split('\n')) {
    const item = /^\s+-\s+(.*)$/.exec(line);
    if (item && list) { list.push(item[1]); continue; }
    const kv = /^([\w-]+):\s*(.*)$/.exec(line);
    assert.ok(kv, `${file}: cannot parse frontmatter line ${JSON.stringify(line)}`);
    list = kv[2] === '' ? (fm[kv[1]] = []) : null;
    if (kv[2] !== '') fm[kv[1]] = kv[2];
  }
  const body = m[2];
  const fences = [...body.matchAll(/^```[^\n]*\n([\s\S]*?)^```/gm)].map((f) => f[1]);
  const prose = body.replace(/^```[^\n]*\n[\s\S]*?^```/gm, '');
  return { fm, body, fences, prose };
}

test('the command set is the known one (a new command must be added to these tests)', () => {
  assert.deepEqual(files.map((f) => f.replace(/\.md$/, '')).sort(),
    [...TEXT_COMMANDS, 'memory-info'].sort());
});

for (const file of files) {
  const name = file.replace(/\.md$/, '');
  const takesText = TEXT_COMMANDS.has(name);

  test(`${name}: $ARGUMENTS (and $1, $ARGUMENTS[n]) never appear inside a code block`, () => {
    const { fences } = parse(file);
    assert.ok(fences.length >= 1, 'expected the command to be shown in a code block');
    for (const block of fences) {
      assert.doesNotMatch(block, /\$ARGUMENTS|\$\{?\d|\$\{?ARGUMENTS/, `placeholder in code block:\n${block}`);
    }
  });

  test(`${name}: $ARGUMENTS appears only in prose, ${takesText ? 'exactly once' : 'not at all'}`, () => {
    const { fm, prose } = parse(file);
    const hits = prose.match(/\$ARGUMENTS/g) ?? [];
    assert.equal(hits.length, takesText ? 1 : 0);
    assert.doesNotMatch(JSON.stringify(fm), /\$ARGUMENTS/);
    if (takesText) {
      // the user's text is the last thing in the file, so nothing after it can be mistaken for instructions
      assert.match(prose.trimEnd(), /\$ARGUMENTS$/);
      // never inside an inline code span
      for (const span of prose.match(/`[^`\n]*`/g) ?? []) assert.doesNotMatch(span, /\$ARGUMENTS/);
    }
  });

  test(`${name}: model invocation is off and tool grants are exactly the script and the input file`, () => {
    const { fm, fences } = parse(file);
    assert.equal(fm['disable-model-invocation'], 'true');
    const grants = fm['allowed-tools'];
    assert.ok(Array.isArray(grants), 'allowed-tools must be a YAML list');
    const sub = name === 'memory-info' ? 'info' : name.replace('memory-', '');
    const command = `node "${SCRIPT}" ${sub}${takesText ? ` --file "${INPUT}"` : ''}`;
    const expected = takesText ? [`Edit(/${INPUT})`, `Bash(${command})`] : [`Bash(${command})`];
    assert.deepEqual(grants, expected);
    // the command the model is told to run is exactly the one the rule allows
    assert.ok(fences.some((b) => b.trim() === command), `no code block equals the allowed command:\n${command}`);
    assert.equal(fences.length, 1);
  });

  test(`${name}: no shell is involved beyond the one allowed command`, () => {
    const { body, fences } = parse(file);
    for (const block of fences) {
      assert.doesNotMatch(block, /<<|\|\||&&|;|\||`|\$\(|\bsource\b|\bcurl\b|\bbash\b|\bsh\b|\beval\b|\bnode -e\b/);
      assert.equal(block.trim().split('\n').length, 1, 'one command, one line');
    }
    assert.doesNotMatch(body, /!`/, 'no dynamic shell injection (!`cmd`)');
  });

  if (takesText) {
    test(`${name}: tells Claude to save the text to the input file the rule allows`, () => {
      const { prose } = parse(file);
      assert.ok(prose.includes('`' + INPUT + '`'), 'input path not mentioned');
      assert.match(prose, /Write tool/);
    });
  }
}

test('the script the commands run exists in the plugin', () => {
  assert.ok(existsSync(join(pluginRoot, 'scripts/memdb-cmd.mjs')));
  assert.ok(existsSync(join(pluginRoot, 'hooks/lib/config.mjs')));
});
