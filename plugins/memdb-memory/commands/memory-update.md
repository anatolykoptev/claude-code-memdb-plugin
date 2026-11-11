---
description: "Update an existing memory in MemDB"
argument-hint: "<memory_id> <new content>"
allowed-tools: ["Bash"]
---

# Memory Update

Update the content of an existing memory in MemDB.

## Instructions

1. `$ARGUMENTS` is `<memory_id> <new content>`: the first word is the memory ID (UUID format), everything after the first whitespace is the new content. The commands below split it themselves; do not split or re-type it.
2. If `$ARGUMENTS` is empty or doesn't contain both parts, ask the user for the memory ID and new content. They can find IDs using `/memory-search`.
3. First, get the memory to find its cube_id:

```bash
source ~/.config/claude-code-memdb/config.env 2>/dev/null || source ~/.config/claude-code-memos/config.env 2>/dev/null
MEMDB_URL="${MEMDB_API_URL:-http://127.0.0.1:8080}" MEMDB_SECRET="$INTERNAL_SERVICE_SECRET" \
node -e '
const e = process.env;
const id = require("fs").readFileSync(0, "utf8").trim().split(/\s+/)[0];
if (!/^[0-9a-fA-F-]{32,36}$/.test(id)) { console.error("memory id must be a UUID"); process.exit(2); }
fetch(e.MEMDB_URL + "/product/get_memory/" + id, { headers: { "X-Internal-Service": e.MEMDB_SECRET || "" } })
.then((r) => r.text()).then((t) => console.log(t)).catch((err) => { console.error(String(err)); process.exit(1); });
' <<'MEMDB_END_7f3a9c'
$ARGUMENTS
MEMDB_END_7f3a9c
```

4. Then delete the old memory and add the updated content. Put the cube_id from step 3 between the `MEMDB_CUBE_END_c41e` markers:

```bash
source ~/.config/claude-code-memdb/config.env 2>/dev/null || source ~/.config/claude-code-memos/config.env 2>/dev/null
MEMDB_USER="${MEMDB_PERSON_ID:-${MEMDB_USER_ID:-krolik}}" \
MEMDB_URL="${MEMDB_API_URL:-http://127.0.0.1:8080}" MEMDB_SECRET="$INTERNAL_SERVICE_SECRET" \
node -e '
const fs = require("fs");
const e = process.env;
const args = fs.readFileSync(0, "utf8").replace(/\n$/, "");
const cube = fs.readFileSync(3, "utf8").trim();
const m = /^\s*(\S+)\s+([\s\S]*\S)\s*$/.exec(args);
if (!m || !/^[0-9a-fA-F-]{32,36}$/.test(m[1]) || !cube) { console.error("need <memory_id> <new content> and a cube id"); process.exit(2); }
const post = (path, body) => fetch(e.MEMDB_URL + path, {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Internal-Service": e.MEMDB_SECRET || "" },
  body: JSON.stringify(body),
}).then((r) => r.text());
post("/product/delete_memory", { user_id: e.MEMDB_USER, memory_ids: [m[1]] })
  .then((t) => { console.log(t); return post("/product/add", {
    user_id: e.MEMDB_USER,
    writable_cube_ids: [cube],
    mode: "fast",
    messages: [{ role: "user", content: m[2] }],
  }); })
  .then((t) => console.log(t))
  .catch((err) => { console.error(String(err)); process.exit(1); });
' <<'MEMDB_END_7f3a9c' 3<<'MEMDB_CUBE_END_c41e'
$ARGUMENTS
MEMDB_END_7f3a9c
CUBE_ID_HERE
MEMDB_CUBE_END_c41e
```

The user's text goes only between the `MEMDB_END_7f3a9c` markers, exactly as typed. The quoted markers keep the shell from interpreting it, and `node` builds the JSON, so do not copy it anywhere else in the command or into a quoted string.

5. Confirm the update with old vs new content summary.
