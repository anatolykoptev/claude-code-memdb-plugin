---
description: "Add a memory to MemDB manually"
argument-hint: "<text to remember>"
disable-model-invocation: true
allowed-tools:
  - Edit(/${CLAUDE_PROJECT_DIR}/.memdb-memory-input.txt)
  - Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/memdb-cmd.mjs" add --file "${CLAUDE_PROJECT_DIR}/.memdb-memory-input.txt")
---

# Memory Add

Manually add a memory to MemDB.

## Instructions

1. If the user text below is empty, ask what they want to remember and stop.
2. Save the text under "User text" below to `${CLAUDE_PROJECT_DIR}/.memdb-memory-input.txt` with the Write tool, character for character: no added quotes, escaping, labels or trailing text. If Write refuses because the file already exists, Read it first and then Write again.
3. Run exactly this command and nothing else. The script reads the file and deletes it:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/memdb-cmd.mjs" add --file "${CLAUDE_PROJECT_DIR}/.memdb-memory-input.txt"
```
4. The script prints MemDB's JSON response:
   - `code: 200` = success. Show the created memory IDs and content from `data[]`.
   - Anything else (the script exits non-zero and prints the reason) = error. Show the message.

Never put the user's text, or anything from a MemDB response, into a shell command: the text reaches the script only through the file.

## User text

$ARGUMENTS
