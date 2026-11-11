# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Changed

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
