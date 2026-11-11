---
description: "Delete a memory from MemDB by ID"
argument-hint: "<memory_id>"
allowed-tools: ["Bash"]
---

# Memory Delete

Delete a specific memory from MemDB by its UUID.

## Instructions

1. Take the memory ID: `$ARGUMENTS`
2. If no `$ARGUMENTS` provided, tell the user to provide a memory UUID. They can find IDs using `/memory-search`.
3. Run the following command:

```bash
source ~/.config/claude-code-memdb/config.env 2>/dev/null || source ~/.config/claude-code-memos/config.env 2>/dev/null
MEMDB_USER="${MEMDB_PERSON_ID:-${MEMDB_USER_ID:-krolik}}" MEMDB_CUBE="${MEMDB_CUBE_ID:-memos}" \
MEMDB_URL="${MEMDB_API_URL:-http://127.0.0.1:8080}" MEMDB_SECRET="$INTERNAL_SERVICE_SECRET" \
node -e '
const e = process.env;
const id = require("fs").readFileSync(0, "utf8").trim();
if (!/^[0-9a-fA-F-]{32,36}$/.test(id)) { console.error("memory id must be a UUID"); process.exit(2); }
fetch(e.MEMDB_URL + "/product/delete_memory", {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Internal-Service": e.MEMDB_SECRET || "" },
  body: JSON.stringify({ user_id: e.MEMDB_USER, memory_ids: [id] }),
}).then((r) => r.text()).then((t) => console.log(t)).catch((err) => { console.error(String(err)); process.exit(1); });
' <<'MEMDB_END_7f3a9c'
$ARGUMENTS
MEMDB_END_7f3a9c
```

The user's text goes only between the `MEMDB_END_7f3a9c` markers, exactly as typed. The quoted marker keeps the shell from interpreting it, and `node` builds the JSON, so do not copy it anywhere else in the command or into a quoted string.

4. Parse the JSON response:
   - `code: 200` with `deleted_count` > 0 = success. Confirm deletion.
   - `deleted_count: 0` = memory not found.
   - Other codes = error. Show the error message.
