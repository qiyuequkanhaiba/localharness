# Official engine compatibility

LocalHarness is a window around official `@deepseek-ai/dsh`. It does not fork Harness UI or host code.

| Official engine | LocalHarness shell | Status |
|---|---|---|
| `0.1.0-rc.6` | `0.1.1` | Verified — shipped / pinned |

Unlisted npm versions can still be installed from **Check for Harness Updates…**. They are marked unverified. Use **Rollback Harness Engine** if a new official release fails to start.

The shell only depends on this public contract:

- `dsh web --host 127.0.0.1 --port 0`
- stdout line `dsh web: http://127.0.0.1:<port>`
- SIGTERM / process-tree teardown
- default user data at `~/.dsh`
- Node `^22.19.0 || >=24`
