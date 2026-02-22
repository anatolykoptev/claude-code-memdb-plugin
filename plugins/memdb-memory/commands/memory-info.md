---
description: "Show MemDB user info, cubes, and memory stats"
argument-hint: ""
allowed-tools: ["Bash"]
---

# Memory Info

Show MemDB user info, accessible cubes, and memory statistics.

## Instructions

1. Run these commands to gather info:

```bash
source ~/.config/claude-code-memdb/config.env 2>/dev/null || source ~/.config/claude-code-memos/config.env 2>/dev/null

echo "=== Health ==="
curl -s "${MEMDB_API_URL:-http://127.0.0.1:8080}/health"

echo -e "\n=== User Info ==="
curl -s "${MEMDB_API_URL:-http://127.0.0.1:8080}/product/users/${MEMDB_USER_ID:-memos}" \
  -H "X-Internal-Service: ${INTERNAL_SERVICE_SECRET}"

echo -e "\n=== User Config ==="
curl -s "${MEMDB_API_URL:-http://127.0.0.1:8080}/product/users/${MEMDB_USER_ID:-memos}/config" \
  -H "X-Internal-Service: ${INTERNAL_SERVICE_SECRET}"

echo -e "\n=== Memories ==="
curl -s -X POST "${MEMDB_API_URL:-http://127.0.0.1:8080}/product/get_memory" \
  -H "Content-Type: application/json" \
  -H "X-Internal-Service: ${INTERNAL_SERVICE_SECRET}" \
  -d '{
    "mem_cube_id": "'"${MEMDB_CUBE_ID:-memos}"'",
    "user_id": "'"${MEMDB_USER_ID:-memos}"'",
    "page": 0,
    "page_size": 1
  }'
```

2. Present a clean summary:
   - Service status (healthy/unhealthy)
   - User ID and config
   - Cube ID
   - Total memory count (from `total_nodes` field)
   - Memory limits if configured
