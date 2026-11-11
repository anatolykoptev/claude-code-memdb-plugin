---
description: "Search MemDB memory for relevant information"
argument-hint: "<query>"
allowed-tools: ["Bash"]
---

# Memory Search

Search the MemDB memory system for relevant stored information.

## Instructions

1. Take the user's query: `$ARGUMENTS`
2. Run the following command to search MemDB:

```bash
source ~/.config/claude-code-memdb/config.env 2>/dev/null || source ~/.config/claude-code-memos/config.env 2>/dev/null
MEMDB_USER="${MEMDB_PERSON_ID:-${MEMDB_USER_ID:-krolik}}" MEMDB_CUBE="${MEMDB_CUBE_ID:-memos}" \
MEMDB_URL="${MEMDB_API_URL:-http://127.0.0.1:8080}" MEMDB_SECRET="$INTERNAL_SERVICE_SECRET" \
node -e '
const e = process.env;
const query = require("fs").readFileSync(0, "utf8").replace(/\n$/, "");
fetch(e.MEMDB_URL + "/product/search", {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Internal-Service": e.MEMDB_SECRET || "" },
  body: JSON.stringify({
    query,
    user_id: e.MEMDB_USER,
    readable_cube_ids: [e.MEMDB_CUBE],
    top_k: 10,
    relativity: 0.85,
  }),
}).then((r) => r.text()).then((t) => console.log(t)).catch((err) => { console.error(String(err)); process.exit(1); });
' <<'MEMDB_END_7f3a9c'
$ARGUMENTS
MEMDB_END_7f3a9c
```

The user's text goes only between the `MEMDB_END_7f3a9c` markers, exactly as typed. The quoted marker keeps the shell from interpreting it, and `node` builds the JSON, so do not copy it anywhere else in the command or into a quoted string.

3. Parse the JSON response. Memories are at `data.text_mem[].memories[]`.
4. Display results as a formatted list showing:
   - The memory content (`.memory` or `.content` or `.memory_content` field)
   - Any tags or metadata if present
   - The relevance score if available
5. If no results found, tell the user.
6. If the API is unreachable, inform the user that MemDB may not be running on the expected port.
