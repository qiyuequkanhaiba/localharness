# Generated official engine

This directory holds per-platform copies of official `@deepseek-ai/dsh` plus a matching Node runtime.

Create one for the machine you are on:

```sh
npm run prepare-engine
```

Output:

- `engine/mac-arm64` on Apple Silicon
- `engine/win-x64` on 64-bit Windows

These trees are gitignored. Native addons (`node-pty`, `koffi`) must be installed on the target OS — do not copy a macOS engine onto Windows.
