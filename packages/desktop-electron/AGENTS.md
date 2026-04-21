# Desktop package notes

- Renderer process should only call `window.api` from `src/preload`.
- Main process should register IPC handlers in `src/main/ipc.ts`.

## Architecture

Electron desktop client. Node.js main process (`src/main/`) + preload bridge (`src/preload/`) + SolidJS renderer (`src/renderer/`).

### Directory structure

```
src/main/
  index.ts           → App lifecycle, single-instance lock, deep links, sidecar init, auto-update
  ipc.ts             → All ipcMain.handle/on registrations
  server.ts          → Node sidecar spawn, health checks, env preparation
  windows.ts         → BrowserWindow creation, oc:// protocol, titlebar overlays
  menu.ts            → macOS app menu
  store.ts           → electron-store wrapper
  apps.ts            → App path resolution, WSL path conversion
  shell-env.ts       → Shell environment variable probing
  logging.ts         → Log init and cleanup
  markdown.ts        → Marked parsing with external link handling
  constants.ts       → Channel names and constants
src/preload/
  index.ts           → contextBridge.exposeInMainWorld("api", api)
  types.ts           → ElectronAPI TypeScript interfaces
src/renderer/
  index.tsx          → Platform adapter for @opencode-ai/app
  loading.tsx        → SQLite migration loading screen
  cli.ts             → CLI install interaction
  updater.ts         → Update check interaction
  webview-zoom.ts    → Keyboard zoom shortcuts
  i18n/              → 16 languages
  index.html         → Main window HTML
  loading.html       → Loading window HTML
```

### Sidecar

The main process starts `packages/opencode/dist/node/node.js` as a local HTTP server via `virtual:opencode-server`. Environment variables (shell env, password, XDG_STATE_HOME) are injected before spawn.

### Build

- `bun run predev` / `prebuild` → copies channel icons + builds `packages/opencode` sidecar
- `bun run dev` → electron-vite dev with HMR
- `bun run build` → electron-vite build for main/preload/renderer
- `bun run package` → electron-builder for current platform
- `bun run package:mac` / `:win` / `:linux` → platform-specific packaging

### electron-builder channels

- `dev` → `ai.opencode.desktop.dev` / `OpenCode Dev`
- `beta` → `ai.opencode.desktop.beta` / `OpenCode Beta` → `anomalyco/opencode-beta`
- `prod` → `ai.opencode.desktop` / `OpenCode` → `anomalyco/opencode`

Targets: macOS (`dmg` + `zip`), Windows (`nsis`), Linux (`AppImage` + `deb` + `rpm`)

### Tests

- `src/main/shell-env.test.ts` → `parseShellEnv`, `mergeShellEnv`, `isNushell`
- `src/renderer/html.test.ts` → relative path validation for `oc://` protocol compatibility
