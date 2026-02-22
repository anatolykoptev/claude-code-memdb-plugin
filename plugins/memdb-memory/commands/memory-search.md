---
description: "Search MemDB memory for relevant information"
argument-hint: "<query>"
allowed-tools: ["Bash"]
---

# Memory Search

Search the MemDB memory system for relevant stored information.

## Instructions

1. Take the user's query: `$ARGUMENTS`
2. Run the following curl command to search MemDB:

```bash
source ~/.config/claude-code-memdb/config.env 2>/dev/null || source ~/.config/claude-code-memos/config.env 2>/dev/null
curl -s -X POST "${MEMDB_API_URL:-http://127.0.0.1:8080}/product/search" \
  -H "Content-Type: application/json" \
  -H "X-Internal-Service: ${INTERNAL_SERVICE_SECRET}" \
  -d '{
    "query": "'"$ARGUMENTS"'",
    "user_id": "'"${MEMDB_USER_ID:-memos}"'",
    "readable_cube_ids": ["'"${MEMDB_CUBE_ID:-memos}"'"],
    "top_k": 10,
    "relativity": 0.85
  }'
```

3. Parse the JSON response. Memories are at `data.text_mem[].memories[]`.
4. Display results as a formatted list showing:
   - The memory content (`.memory` or `.content` or `.memory_content` field)
   - Any tags or metadata if present
   - The relevance score if available
5. If no results found, tell the user.
6. If the API is unreachable, inform the user that MemDB may not be running on the expected port.
