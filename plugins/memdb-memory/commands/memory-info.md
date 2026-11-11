---
description: "Show MemDB user info, cubes, and memory stats"
argument-hint: ""
disable-model-invocation: true
allowed-tools:
  - Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/memdb-cmd.mjs" info)
---

# Memory Info

Show MemDB user info, accessible cubes, and memory statistics.

## Instructions

1. Run exactly this command and nothing else:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/memdb-cmd.mjs" info
```

2. Present a clean summary from its output:
   - Service status (healthy/unhealthy)
   - Person ID and Cube ID (printed on the first lines)
   - Accessible cubes: parse `data.accessible_cubes[]` from the User Info section, print `cube_id` + `cube_name` per entry (Phase 2 shape). Fall back to `data.cube_ids[]` if `accessible_cubes` is absent (Phase 1 compat).
   - Total memory count (from `total_nodes` field in the Memories section)
   - Memory limits if configured
   - Any section that shows an error instead of JSON
