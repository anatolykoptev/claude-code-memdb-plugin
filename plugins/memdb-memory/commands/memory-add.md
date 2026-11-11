---
description: "Add a memory to MemDB manually"
argument-hint: "<text to remember>"
allowed-tools: ["Bash"]
---

# Memory Add

Manually add a memory to MemDB.

## Instructions

1. Take the user's text: `$ARGUMENTS`
2. Run the following command:

```bash
source ~/.config/claude-code-memdb/config.env 2>/dev/null || source ~/.config/claude-code-memos/config.env 2>/dev/null
MEMDB_USER="${MEMDB_PERSON_ID:-${MEMDB_USER_ID:-krolik}}" MEMDB_CUBE="${MEMDB_CUBE_ID:-memos}" \
MEMDB_URL="${MEMDB_API_URL:-http://127.0.0.1:8080}" MEMDB_SECRET="$INTERNAL_SERVICE_SECRET" \
node -e '
const e = process.env;
const text = require("fs").readFileSync(0, "utf8").replace(/\n$/, "");
if (!text.trim()) { console.error("nothing to remember"); process.exit(2); }
fetch(e.MEMDB_URL + "/product/add", {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Internal-Service": e.MEMDB_SECRET || "" },
  body: JSON.stringify({
    user_id: e.MEMDB_USER,
    writable_cube_ids: [e.MEMDB_CUBE],
    mode: "fast",
    messages: [{ role: "user", content: text }],
  }),
}).then((r) => r.text()).then((t) => console.log(t)).catch((err) => { console.error(String(err)); process.exit(1); });
' <<'MEMDB_END_7f3a9c'
$ARGUMENTS
MEMDB_END_7f3a9c
```

The user's text goes only between the `MEMDB_END_7f3a9c` markers, exactly as typed. The quoted marker keeps the shell from interpreting it, and `node` builds the JSON, so do not copy it anywhere else in the command or into a quoted string.

3. Parse the JSON response:
   - `code: 200` = success. Show the created memory IDs and content from `data[]`.
   - Other codes = error. Show the error message.
4. If no `$ARGUMENTS` provided, ask the user what they want to remember.
