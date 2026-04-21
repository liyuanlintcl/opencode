# Desktop package notes

- Never call `invoke` manually in this package.
- Use the generated bindings in `packages/desktop/src/bindings.ts` for core commands/events.

## Architecture

Tauri v2 desktop client. Rust backend (`src-tauri/`) + SolidJS renderer (`src/`).

### Directory structure

```
src/
  entry.tsx          → Router entry: /loading vs /
  index.tsx          → Platform adapter for @opencode-ai/app (file dialogs, store, clipboard, updater, etc.)
  loading.tsx        → Init loading screen with progress bar
  cli.ts             → CLI install to ~/.opencode/bin
  updater.ts         → Auto-update flow
  menu.ts            → macOS native app menu
  webview-zoom.ts    → Cmd/Ctrl +/- zoom
  bindings.ts        → Tauri Specta generated IPC types (never edit by hand)
  i18n/              → 15 languages, merged with app i18n
src-tauri/src/
  main.rs            → Entry: Linux display backend env, then run lib
  lib.rs             → Command registration, init flow, single-instance plugin
  cli.rs             → Sidecar spawn/kill, shell env detection, WSL mode, CLI install
  server.rs          → Local server health checks, default server settings
  windows.rs         → MainWindow + LoadingWindow, platform titlebar styles
  linux_windowing.rs → Auto-detect Wayland/X11 and 20+ DEs for decorations
  linux_display.rs   → Linux Wayland/X11 preference storage
  markdown.rs        → comrak markdown → HTML with external link classes
  logging.rs         → tracing logs with 7-day auto-cleanup
  constants.rs       → Setting keys, updater flags
```

### Sidecar

`opencode-cli` is declared as `externalBin: ["sidecars/opencode-cli"]` and bundled into the app. The Rust backend spawns it on a random localhost port, runs health checks, and kills it on exit.

### Build

- `bun run predev` → builds `packages/opencode` and copies sidecar to `src-tauri/sidecars/`
- `bun run dev` → Vite dev server on port 1420
- `bun run build` → typecheck + vite build
- `bun run tauri` → Tauri CLI

### Tauri configs

- `tauri.conf.json` → dev (`OpenCode Dev`, `ai.opencode.desktop.dev`)
- `tauri.prod.conf.json` → prod (`OpenCode`, updater enabled)
- `tauri.beta.conf.json` → beta (`OpenCode Beta`, `opencode-beta` release)

Targets: `deb`, `rpm`, `dmg`, `nsis`, `app`

### Tests

Rust-only in this package:
- `cli.rs`: `parse_shell_env`, `merge_shell_env`, `is_nushell`
- `linux_windowing.rs`: ~25 tests for backend/decoration decisions
- `lib.rs`: `test_export_types` for Specta generation
