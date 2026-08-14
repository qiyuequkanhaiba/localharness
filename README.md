# LocalHarness

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![GitHub release](https://img.shields.io/github/v/release/qiyuequkanhaiba/localharness)](https://github.com/qiyuequkanhaiba/localharness/releases)

Independent Electron window for official [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`@deepseek-ai/dsh`).

**Not a fork and not an official DeepSeek product.** The shell starts official `dsh web` on loopback, loads that UI in its own window, and leaves `~/.dsh` as the Harness home.

[Download](https://github.com/qiyuequkanhaiba/localharness/releases/latest) · 中文说明见下方。

## What you get

- Double-click app; no browser, no terminal, no `npx`
- Official UI and agent behavior unchanged
- Shared user data with `npx @deepseek-ai/dsh web` (`~/.dsh`)
- Shipped / pinned official engine (`0.1.0-rc.6`)
- Menu bar **LocalHarness**: 检查 Harness 更新… / 回滚 Harness 引擎 / 重启引擎 (also `Ctrl/Cmd+Shift+U`)

## Requirements

- Build: Node 22.19+
- Runtime (packaged): nothing else; Node and `@deepseek-ai/dsh` are bundled
- macOS 14+ Apple Silicon, or 64-bit Windows

## Develop

```sh
npm install
npm run prepare-engine
npm start
```

`prepare-engine` must run on the target OS/arch. It downloads Node `22.23.2` and installs official `@deepseek-ai/dsh@0.1.0-rc.6` into `engine/mac-arm64` or `engine/win-x64`.

Optional:

```sh
export LOCALHARNESS_ENGINE_DIR=/path/to/prepared/engine
```

## Package

```sh
npm run pack        # unpacked .app / dir (fast check)
npm run dist:mac    # Apple Silicon .dmg / .zip
npm run dist:win    # Windows NSIS + portable — run this on Windows
```

Windows x64 can also be built in the local Parallels `Windows 11` VM: `scripts/win-vm-build.cmd` stages the tree to `C:\lh`, installs the official engine, then runs `electron-builder --win`. Local builds are unsigned until you set a signing identity.

If `npx electron` says the binary failed to install, allow Electron's install script (`npm install-scripts approve electron`) or delete `node_modules/electron` and reinstall so `Electron Framework` is extracted.

## Updates

The installer pins a verified official version. LocalHarness never auto-updates the engine.

These commands live in the **desktop menu bar** (`LocalHarness`), not in the official web page:

- **检查 Harness 更新…** (`Ctrl/Cmd+Shift+U`) asks npm for newer `@deepseek-ai/dsh`, installs it, smoke-tests `dsh web`, then restarts
- **回滚 Harness 引擎** returns to the previous or shipped engine
- Unverified official versions can still be installed; roll back if they fail to start

See [docs/compat.md](docs/compat.md).

## Layout

```
src/main/       Electron shell (window, menu, updater)
src/engine/     Locate / install / parse official dsh
src/renderer/   Splash and error pages only
engine/         Generated official runtime (gitignored)
```

The official UI is not in this repository. The window loads `http://127.0.0.1:<port>` from the official process.

---

## 中文

LocalHarness 是官方 DeepSeek Harness 的独立桌面窗口，不是官方产品，也不修改官方界面。

- 双击启动，不打开系统浏览器，不需要自己跑 `npx @deepseek-ai/dsh web`
- 数据仍在 `~/.dsh`，可与官方命令行共用
- 安装包钉死已验证的官方引擎版本；升级用菜单栏 **LocalHarness → 检查 Harness 更新…**
- 安装包：[Releases](https://github.com/qiyuequkanhaiba/localharness/releases/latest)
- 开发：`npm install && npm run prepare-engine && npm start`
- 打包：macOS arm64 用 `npm run dist:mac`；Windows x64 在 Windows 上跑 `npm run dist:win`

## License

[MIT](LICENSE)
