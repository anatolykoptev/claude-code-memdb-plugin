---
description: "Update an existing memory in MemDB"
argument-hint: "<memory_id> <new content>"
disable-model-invocation: true
allowed-tools:
  - Edit(/${CLAUDE_PROJECT_DIR}/.memdb-memory-input.txt)
  - Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/memdb-cmd.mjs" update --file "${CLAUDE_PROJECT_DIR}/.memdb-memory-input.txt")
---

# Memory Update

Replace the content of an existing memory in MemDB. The script finds the memory's cube itself, adds the new content first and deletes the old memory only after that succeeded.

## Instructions

1. The user text below is `<memory_id> <new content>`. If it is empty or lacks either part, ask for the memory ID and the new content (IDs come from `/memory-search`) and stop. Do not split, edit or re-type it.
2. Save the text under "User text" below to `${CLAUDE_PROJECT_DIR}/.memdb-memory-input.txt` with the Write tool, character for character: no added quotes, escaping, labels or trailing text. If Write refuses because the file already exists, Read it first and then Write again.
3. Run exactly this command and nothing else. The script reads the file and deletes it:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/memdb-cmd.mjs" update --file "${CLAUDE_PROJECT_DIR}/.memdb-memory-input.txt"
```
4. The script prints one JSON object: `old_id`, `old_memory`, `new_ids`, `added`, `deleted`. Confirm the update with a short old vs new content summary.
5. A non-zero exit means nothing was lost: if the message says the old memory was NOT deleted, the new memory exists and the old one is a duplicate; tell the user the exact ID to remove with `/memory-delete`.

Never put the user's text, or anything from a MemDB response, into a shell command: the text reaches the script only through the file.

## User text

$ARGUMENTS
