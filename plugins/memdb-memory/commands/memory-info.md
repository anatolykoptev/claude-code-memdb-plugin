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

MEMDB_PERSON="${MEMDB_PERSON_ID:-${MEMDB_USER_ID:-krolik}}"

echo -e "\n=== User Info ==="
curl -s "${MEMDB_API_URL:-http://127.0.0.1:8080}/product/users/${MEMDB_PERSON}" \
  -H "X-Internal-Service: ${INTERNAL_SERVICE_SECRET}"

echo -e "\n=== User Config ==="
curl -s "${MEMDB_API_URL:-http://127.0.0.1:8080}/product/users/${MEMDB_PERSON}/config" \
  -H "X-Internal-Service: ${INTERNAL_SERVICE_SECRET}"

echo -e "\n=== Memories ==="
curl -s -X POST "${MEMDB_API_URL:-http://127.0.0.1:8080}/product/get_memory" \
  -H "Content-Type: application/json" \
  -H "X-Internal-Service: ${INTERNAL_SERVICE_SECRET}" \
  -d '{
    "readable_cube_ids": ["'"${MEMDB_CUBE_ID:-memos}"'"],
    "user_id": "'"${MEMDB_PERSON}"'",
    "page": 0,
    "page_size": 1
  }'
```

2. Present a clean summary:
   - Service status (healthy/unhealthy)
   - Person ID (`MEMDB_PERSON_ID`) and Cube ID (`MEMDB_CUBE_ID`)
   - Accessible cubes: parse `data.accessible_cubes[]` from the User Info response, print `cube_id` + `cube_name` per entry (Phase 2 shape). Fall back to `data.cube_ids[]` if `accessible_cubes` is absent (Phase 1 compat).
   - Total memory count (from `total_nodes` field in the Memories response)
   - Memory limits if configured
