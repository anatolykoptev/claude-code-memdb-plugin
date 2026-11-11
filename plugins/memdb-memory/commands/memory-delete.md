---
description: "Delete a memory from MemDB by ID"
argument-hint: "<memory_id>"
disable-model-invocation: true
allowed-tools:
  - Edit(/${CLAUDE_PROJECT_DIR}/.memdb-memory-input.txt)
  - Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/memdb-cmd.mjs" delete --file "${CLAUDE_PROJECT_DIR}/.memdb-memory-input.txt")
---

# Memory Delete

Delete a specific memory from MemDB by its UUID.

## Instructions

1. If the user text below is empty, tell the user to provide a memory UUID. They can find IDs using `/memory-search`. Stop.
2. Save the text under "User text" below to `${CLAUDE_PROJECT_DIR}/.memdb-memory-input.txt` with the Write tool, character for character: no added quotes, escaping, labels or trailing text. If Write refuses because the file already exists, Read it first and then Write again.
3. Run exactly this command and nothing else. The script reads the file and deletes it:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/memdb-cmd.mjs" delete --file "${CLAUDE_PROJECT_DIR}/.memdb-memory-input.txt"
```
4. Parse the JSON response:
   - `code: 200` with `deleted_count` > 0 = success. Confirm deletion.
   - `deleted_count: 0` = memory not found.
   - A non-zero exit (for example "memory id must be a UUID") = error. Show the message.

Never put the user's text, or anything from a MemDB response, into a shell command: the text reaches the script only through the file.

## User text

$ARGUMENTS
