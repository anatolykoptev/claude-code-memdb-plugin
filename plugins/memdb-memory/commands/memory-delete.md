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
3. Run the following curl command:

```bash
source ~/.config/claude-code-memdb/config.env 2>/dev/null || source ~/.config/claude-code-memos/config.env 2>/dev/null
curl -s -X POST "${MEMDB_API_URL:-http://127.0.0.1:8080}/product/delete_memory" \
  -H "Content-Type: application/json" \
  -H "X-Internal-Service: ${INTERNAL_SERVICE_SECRET}" \
  -d '{
    "user_id": "'"${MEMDB_USER_ID:-memos}"'",
    "memory_ids": ["'"$ARGUMENTS"'"]
  }'
```

4. Parse the JSON response:
   - `code: 200` with `deleted_count` > 0 = success. Confirm deletion.
   - `deleted_count: 0` = memory not found.
   - Other codes = error. Show the error message.
