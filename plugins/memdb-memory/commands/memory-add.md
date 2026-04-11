---
description: "Add a memory to MemDB manually"
argument-hint: "<text to remember>"
allowed-tools: ["Bash"]
---

# Memory Add

Manually add a memory to MemDB.

## Instructions

1. Take the user's text: `$ARGUMENTS`
2. Run the following curl command:

```bash
source ~/.config/claude-code-memdb/config.env 2>/dev/null || source ~/.config/claude-code-memos/config.env 2>/dev/null
curl -s -X POST "${MEMDB_API_URL:-http://127.0.0.1:8080}/product/add" \
  -H "Content-Type: application/json" \
  -H "X-Internal-Service: ${INTERNAL_SERVICE_SECRET}" \
  -d '{
    "user_id": "'"${MEMDB_PERSON_ID:-${MEMDB_USER_ID:-krolik}}"'",
    "writable_cube_ids": ["'"${MEMDB_CUBE_ID:-memos}"'"],
    "mode": "fast",
    "messages": [{"role": "user", "content": "'"$ARGUMENTS"'"}]
  }'
```

3. Parse the JSON response:
   - `code: 200` = success. Show the created memory IDs and content from `data[]`.
   - Other codes = error. Show the error message.
4. If no `$ARGUMENTS` provided, ask the user what they want to remember.
