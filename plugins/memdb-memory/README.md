# claude-code-memdb-plugin

Claude Code plugin for MemDB memory integration — automatic context injection and conversation persistence.

## Quick Start

```bash
# Install the plugin
claude plugins install /path/to/claude-code-memdb-plugin

# Run interactive setup
bash "$(claude plugins dir)/memdb-memory/setup.sh"
```

The setup script will prompt for your MemDB connection details, test connectivity, and save the config.

## What it does

**Four hooks** that make Claude Code sessions memory-aware:

1. **`memdb-healthcheck`** (SessionStart) — On session start, checks if MemDB is reachable and shows connection status. Warns if MemDB is down so you know memory features are disabled.

2. **`memdb-inject`** (UserPromptSubmit) — Before each prompt, searches MemDB for relevant memories and injects the top results as context. Claude sees relevant past decisions, preferences, and project knowledge automatically.

3. **`memdb-precompact`** (PreCompact) — Before Claude Code compacts context, reads the conversation transcript and sends messages to MemDB for extraction and structuring. Important context survives across sessions.

4. **`memdb-stop`** (Stop) — After meaningful turns, sends transcript delta to MemDB for incremental memory extraction.

**Five commands** (see [Slash commands](#slash-commands)):

- `/memory-search <query>` — search MemDB memories.
- `/memory-add <text>` — store a memory.
- `/memory-delete <memory_id>` — delete a memory by its UUID.
- `/memory-update <memory_id> <new content>` — replace a memory's content.
- `/memory-info` — show the person, cubes and memory count.

**One skill:**

- `memory-context` — Guides Claude on how to use injected memory context and handle memory-related questions.

## Configuration

### Option 1: setup.sh (recommended)

Run the interactive setup script:

```bash
bash setup.sh
```

This creates `~/.config/claude-code-memdb/config.env` with your settings.

### Option 2: Environment variables

Set these before starting Claude Code:

| Variable | Default | Description |
|----------|---------|-------------|
| `MEMDB_API_URL` | `http://127.0.0.1:8080` | MemDB API endpoint |
| `MEMDB_PERSON_ID` | `krolik` | Person identity (legacy fallback: `MEMDB_USER_ID`) |
| `MEMDB_CUBE_ID` | `memos` | Memory cube identifier |
| `INTERNAL_SERVICE_SECRET` | (empty) | Optional auth secret for X-Internal-Service header |

A value in the config file overrides the same variable in the process environment, so a config change reaches already-running sessions on the next hook.

### Config file location

`~/.config/claude-code-memdb/config.env` — simple KEY=VALUE format, created by `setup.sh`. The file is chmod 600 (owner-only access).

## Prerequisites

- [MemDB](https://github.com/MemDBai/MemDB) running and accessible (default: `http://127.0.0.1:8080`)
- Node.js 18+ on `PATH` (the `fetch` API for the hooks, and the whole `/memory-*` command backend)

## Slash commands

Text you type after a command is never part of a shell command line. Claude Code substitutes it into the command's prompt, and the prompt tells Claude to:

1. save it, character for character, with the Write tool to `.memdb-memory-input.txt` in the project directory;
2. run exactly one fixed line, `node "${CLAUDE_PLUGIN_ROOT}/scripts/memdb-cmd.mjs" <command> --file "${CLAUDE_PROJECT_DIR}/.memdb-memory-input.txt"`.

`scripts/memdb-cmd.mjs` reads the file and deletes it, reads the connection settings from the same `config.env` as the hooks, builds the request with `JSON.stringify` and sends it with `fetch`. Quotes, `$(...)`, backticks, newlines and marker lines in the text, or in anything MemDB returns, are plain data.

Each command's `allowed-tools` grants only that one `node` line and `Edit` of that one file, and `disable-model-invocation: true` means Claude cannot start the commands on its own. Some choices follow from how Claude Code works:

- The file lives in the project directory, not in `${CLAUDE_PLUGIN_DATA}`: that directory is under `~/.claude/`, a protected path, so writing to it always prompts and no allow rule can pre-approve it.
- The grant is an `Edit(...)` rule because Claude Code applies `Edit` rules to the Write tool as well.
- If a run is interrupted before the script reads the file, delete `.memdb-memory-input.txt`; Claude Code refuses to overwrite a file it has not read.
- `/memory-update` looks the memory's cube up itself, adds the new content to that cube first and deletes the old memory only if the add succeeded. If the delete fails you keep both; the message names the old ID so you can run `/memory-delete`.

## How the hooks work

### Health Check (SessionStart)

```
Session start → Load config → GET /health → Inject status message
```

- Tests MemDB connectivity with a 3-second timeout
- On success: shows "MemDB memory connected (url, user, cube)"
- On failure: warns that memory features are disabled this session

### Context Injection (UserPromptSubmit)

```
User prompt → Search MemDB (top 5) → Inject as context
```

- Skips short/casual prompts (hi, ok, yes, etc.)
- Fetches 5 memories with MMR dedup and 0.85 relativity threshold
- Injected as `<user_memory_context>` block in additionalContext
- 30-second timeout, fails silently on error

### Compaction Flush (PreCompact)

```
Transcript → Extract last 50 messages → Send to MemDB for extraction
```

- Reads conversation transcript (JSONL format)
- Server-side extraction of facts, decisions, preferences
- 30-second timeout, never blocks compaction

### Stop Save (Stop)

```
Transcript delta → Heuristic gate → Send to MemDB
```

- Only saves when transcript contains signal words (decisions, fixes, etc.)
- Fire-and-forget, never blocks the session

## License

MIT
