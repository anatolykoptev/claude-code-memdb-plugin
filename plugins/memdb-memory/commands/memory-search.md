---
description: "Search MemDB memory for relevant information"
argument-hint: "<query>"
disable-model-invocation: true
allowed-tools:
  - Edit(/${CLAUDE_PROJECT_DIR}/.memdb-memory-input.txt)
  - Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/memdb-cmd.mjs" search --file "${CLAUDE_PROJECT_DIR}/.memdb-memory-input.txt")
---

# Memory Search

Search the MemDB memory system for relevant stored information.

## Instructions

1. If the user text below is empty, ask what to search for and stop.
2. Save the text under "User text" below to `${CLAUDE_PROJECT_DIR}/.memdb-memory-input.txt` with the Write tool, character for character: no added quotes, escaping, labels or trailing text. If Write refuses because the file already exists, Read it first and then Write again.
3. Run exactly this command and nothing else. The script reads the file and deletes it:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/memdb-cmd.mjs" search --file "${CLAUDE_PROJECT_DIR}/.memdb-memory-input.txt"
```
4. Parse the JSON response. Memories are at `data.text_mem[].memories[]`.
5. Display results as a formatted list showing:
   - The memory content (`.memory` or `.content` or `.memory_content` field)
   - Any tags or metadata if present
   - The relevance score if available
6. If no results found, tell the user.
7. If the script reports that MemDB is unreachable, tell the user MemDB may not be running on the expected port.

Never put the user's text, or anything from a MemDB response, into a shell command: the text reaches the script only through the file.

## User text

$ARGUMENTS
