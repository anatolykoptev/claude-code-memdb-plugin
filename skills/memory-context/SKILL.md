---
name: memory-context
description: "Use when the user asks about their memories, past decisions, stored context, or when conversation context seems incomplete and MemDB memory could help fill gaps"
version: 1.1.0
---

# Memory Context

## Overview

This skill helps you work with MemDB memory that is automatically injected into conversations via the `UserPromptSubmit` hook.

## How Memory Injection Works

Before each user prompt is processed, the `memdb-inject` hook:
1. Searches MemDB for memories relevant to the user's prompt
2. Injects relevant memories as `additionalContext` in a `<user_memory_context>` block

You may see blocks like:
```
<user_memory_context>
Relevant memories from MemDB:
- Memory content here...
- Another memory...
</user_memory_context>
```

## How to Use Injected Memories

- **Reference naturally**: When memory context is present and relevant, incorporate it into your responses without explicitly calling out "according to your memories"
- **Fill gaps**: If a user references something from a previous session, check if memory context provides the missing information
- **Acknowledge when relevant**: If the user asks "do you remember X?", check the memory context for related information

## When Memory is Missing

If the user asks about something that should be in memory but isn't in the injected context:
1. Suggest using `/memory-search <specific query>` to search with different terms
2. The automatic injection uses the full prompt as the search query — a targeted search may find different results

## Conversation Persistence

Before context compaction, the `memdb-precompact` hook automatically:
1. Reads the conversation transcript
2. Sends messages to MemDB for extraction and structuring
3. Saves entries to MemDB for future retrieval

This means important information from conversations is preserved across sessions without manual action.

## Environment Requirements

The hooks require MemDB running and accessible. Configuration via `~/.config/claude-code-memdb/config.env`:
- `MEMDB_API_URL` — MemDB API endpoint (default: `http://127.0.0.1:8080`)
- `MEMDB_USER_ID` — User identifier (default: `memos`)
- `MEMDB_CUBE_ID` — Memory cube identifier (default: `memos`)
- `INTERNAL_SERVICE_SECRET` — Optional auth secret
