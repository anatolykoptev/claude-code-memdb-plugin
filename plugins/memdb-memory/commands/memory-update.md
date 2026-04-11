---
description: "Update an existing memory in MemDB"
argument-hint: "<memory_id> <new content>"
allowed-tools: ["Bash"]
---

# Memory Update

Update the content of an existing memory in MemDB.

## Instructions

1. Parse `$ARGUMENTS` to extract:
   - `memory_id` — the first word (UUID format)
   - `new_content` — everything after the first space
2. If `$ARGUMENTS` is empty or doesn't contain both parts, ask the user for the memory ID and new content. They can find IDs using `/memory-search`.
3. First, get the memory to find its cube_id:

```bash
source ~/.config/claude-code-memdb/config.env 2>/dev/null || source ~/.config/claude-code-memos/config.env 2>/dev/null
curl -s "${MEMDB_API_URL:-http://127.0.0.1:8080}/product/get_memory/MEMORY_ID_HERE" \
  -H "X-Internal-Service: ${INTERNAL_SERVICE_SECRET}"
```

4. Then delete the old memory and add the updated content:

```bash
# Delete old
curl -s -X POST "${MEMDB_API_URL:-http://127.0.0.1:8080}/product/delete_memory" \
  -H "Content-Type: application/json" \
  -H "X-Internal-Service: ${INTERNAL_SERVICE_SECRET}" \
  -d '{
    "user_id": "'"${MEMDB_PERSON_ID:-${MEMDB_USER_ID:-krolik}}"'",
    "memory_ids": ["MEMORY_ID_HERE"]
  }'

# Add updated
curl -s -X POST "${MEMDB_API_URL:-http://127.0.0.1:8080}/product/add" \
  -H "Content-Type: application/json" \
  -H "X-Internal-Service: ${INTERNAL_SERVICE_SECRET}" \
  -d '{
    "user_id": "'"${MEMDB_PERSON_ID:-${MEMDB_USER_ID:-krolik}}"'",
    "writable_cube_ids": ["CUBE_ID_HERE"],
    "mode": "fast",
    "messages": [{"role": "user", "content": "NEW_CONTENT_HERE"}]
  }'
```

5. Confirm the update with old vs new content summary.
