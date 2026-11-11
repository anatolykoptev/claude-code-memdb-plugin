# Contributing

Issues and pull requests are welcome.

## Build and test

There is no build step and the hooks have no dependencies; Node.js 18 or newer is required. There is no CI. The slash-command blocks have a test (`node --test tests/`, needs bash); check everything else by hand:

```sh
node --test tests/                                          # /memory-* commands: hostile text must execute nothing
node --check plugins/memdb-memory/hooks/memdb-inject.mjs   # syntax check, repeat per changed file
bash -n plugins/memdb-memory/setup.sh
```

To try a hook for real, run a MemDB instance, run `bash plugins/memdb-memory/setup.sh`, and register the hooks as described in the [README](README.md).

## Commits and pull requests

- Use Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`), scoped when useful (`fix(stop): ...`), as in the history.
- Keep one concern per pull request and say how you checked it.
- Keep hooks fail-soft and route everything sent to MemDB through `redact.mjs`.
- Do not commit credentials, host names, addresses or local paths.
