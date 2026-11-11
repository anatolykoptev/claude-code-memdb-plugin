# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Security

- The `/memory-*` slash commands no longer put user text, or anything a MemDB response contains, on a shell command line. Each command has Claude save the text with the Write tool to `.memdb-memory-input.txt` in the project directory and run one fixed `node scripts/memdb-cmd.mjs <command> --file <path>` line; the script reads and deletes the file, builds the JSON with `JSON.stringify` and calls MemDB with `fetch`. No here-document is involved, so there is no marker line a text could use to end it and run the rest as shell. Each command now allows only that script invocation and edits of that one file (`allowed-tools`), and can be started only by the user (`disable-model-invocation`). `/memory-info` goes through the script too instead of an unrestricted `Bash` grant plus `source` of `config.env`.

### Changed

- `/memory-update` finds the memory's cube itself from the server and no longer asks the model to transcribe it. It adds the new content first and deletes the old memory only after the add succeeded (HTTP status, `code` and a non-empty `data` are checked); if the delete fails it says the old memory is now a duplicate and names its ID.
- Memory IDs must be exactly 8-4-4-4-12 hex UUIDs. The old pattern also accepted 32 dashes and unhyphenated strings.
- The commands need Node.js 18 or newer on `PATH`; they no longer need `curl` or `bash`.
- Removed operator-specific data from tracked files.
- Added the Apache-2.0 licence.

## [1.0.0]

### Added

- Context injection on every prompt with a relevance threshold, a rolling conversation buffer for context-aware queries, and a source tag on injected text.
- Conversation persistence (Stop hook) and memory extraction before compaction (PreCompact hook).
- SessionStart health check, shared config loader and the interactive `setup.sh`.
- Redaction of card data, credentials and API keys before capture.
- `/memory-search`, `/memory-add`, `/memory-delete`, `/memory-update` and `/memory-info` commands and the `memory-context` skill.
- `MEMDB_PERSON_ID`, separate from `MEMDB_CUBE_ID`.

### Changed

- Routed search through the MemDB Go gateway; renamed from MemOS to MemDB.
- `config.env` now always overrides `process.env`.

### Fixed

- The Stop hook awaits the add request before advancing its offset.
- Project detection ignores home directories and user names.
- Plugin stdin bug worked around by registering stdin hooks in user settings.
