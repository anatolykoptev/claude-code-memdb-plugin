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

**One command:**

- `/memory-search <query>` — Manually search MemDB memories with a specific query.

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
| `MEMDB_USER_ID` | `memos` | User identifier |
| `MEMDB_CUBE_ID` | `memos` | Memory cube identifier |
| `INTERNAL_SERVICE_SECRET` | (empty) | Optional auth secret for X-Internal-Service header |

Environment variables take precedence over the config file.

### Config file location

`~/.config/claude-code-memdb/config.env` — simple KEY=VALUE format, created by `setup.sh`. The file is chmod 600 (owner-only access).

## Prerequisites

- [MemDB](https://github.com/MemDBai/MemDB) running and accessible (default: `http://127.0.0.1:8080`)
- Node.js 18+ (for `fetch` API)

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
