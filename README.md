# claude-code-memdb-plugin

Claude Code plugin for [MemDB](https://github.com/MemDBai/MemDB) memory integration — automatic context injection and conversation persistence.

## Features

- **Context injection** — searches MemDB on every prompt, injects relevant memories as context
- **Context-aware search** — uses rolling conversation buffer for smarter queries
- **Conversation persistence** — extracts and saves facts, decisions, preferences to MemDB
- **Compaction survival** — saves memories before context compaction
- **Commands** — `/memory-search`, `/memory-add`, `/memory-delete`, `/memory-update`, `/memory-info`

## Install

```bash
claude plugin install /path/to/claude-code-memdb-plugin
```

## Important: Plugin stdin workaround

Claude Code has a [known bug](https://github.com/anthropics/claude-code/issues/10412) where plugin-installed hooks receive empty stdin. Add these to `~/.claude/settings.json` manually:

```json
{
  "hooks": {
    "UserPromptSubmit": [{"hooks": [{"type": "command", "command": "node /path/to/plugins/memdb-memory/hooks/memdb-inject.mjs", "timeout": 35}]}],
    "Stop": [{"hooks": [{"type": "command", "command": "node /path/to/plugins/memdb-memory/hooks/memdb-stop.mjs", "timeout": 35}]}],
    "PreCompact": [{"hooks": [{"type": "command", "command": "node /path/to/plugins/memdb-memory/hooks/memdb-precompact.mjs", "timeout": 120}]}]
  }
}
```

Replace `/path/to/` with the actual plugin directory path.

## Configuration

Run `bash setup.sh` or set env vars:

| Variable | Default | Description |
|----------|---------|-------------|
| `MEMDB_API_URL` | `http://127.0.0.1:8080` | MemDB Go gateway endpoint |
| `MEMDB_USER_ID` | `memos` | User identifier |
| `MEMDB_CUBE_ID` | `memos` | Memory cube identifier |
| `INTERNAL_SERVICE_SECRET` | — | Auth secret for X-Internal-Service header |

Config file: `~/.config/claude-code-memdb/config.env`

## Prerequisites

- [MemDB](https://github.com/MemDBai/MemDB) running (default `http://127.0.0.1:8080`)
- Node.js 18+

## License

MIT
