# claude-code-memdb-plugin — notes for coding agents

A Claude Code plugin marketplace holding one plugin, `plugins/memdb-memory`: Node.js (ES modules, no build step, no dependencies) hooks that search MemDB on every prompt, inject the results as context and persist conversation facts. All documents: [docs/INDEX.md](docs/INDEX.md).

## Layout

- `.claude-plugin/marketplace.json` — marketplace manifest pointing at `./plugins/memdb-memory`.
- `plugins/memdb-memory/.claude-plugin/plugin.json`, `hooks/hooks.json` — plugin manifest and the one hook the plugin can register itself (SessionStart healthcheck).
- `hooks/memdb-{inject,stop,precompact,healthcheck}.mjs` — hook entry points; `hooks/lib/` holds config loading, the rolling context buffer, inject helpers and `redact.mjs` (strips credentials and card data before anything is sent to MemDB).
- `commands/*.md` — the `/memory-*` slash commands; `skills/memory-context/SKILL.md`; `setup.sh` — interactive config writer.

## Gate

No CI, no package.json. `node --test tests/` runs the `commands/*.md` bash blocks against a local HTTP stub and checks that hostile text is never executed. Check hook changes by running the hook against a real MemDB (`node plugins/memdb-memory/hooks/memdb-inject.mjs` reads the hook payload on stdin) and `bash -n plugins/memdb-memory/setup.sh`.

## Invariants

- Hooks that need stdin (`UserPromptSubmit`, `Stop`, `PreCompact`) are not registered in `hooks.json`: plugin-installed hooks receive empty stdin (a known Claude Code bug), so users register them in `~/.claude/settings.json`. Do not move them into `hooks.json` without confirming the bug is fixed.
- `config.env` values override `process.env` on purpose (`hooks/lib/config.mjs`).
- Everything bound for MemDB goes through `redact.mjs`; never bypass it.
- Hooks must fail soft: a down MemDB may warn but must never block a prompt or a session.
- No operator-specific data (host names, addresses, home paths, account names) in tracked files; this repository is public.
