- To regenerate the JavaScript SDK, run `./packages/sdk/js/script/build.ts`.
- ALWAYS USE PARALLEL TOOLS WHEN APPLICABLE.
- The default branch in this repo is `dev`.
- Local `main` ref may not exist; use `dev` or `origin/dev` for diffs.
- Prefer automation: execute requested actions without confirmation unless blocked by missing info or safety/irreversibility.

## Style Guide

### General Principles

- Keep things in one function unless composable or reusable
- Avoid `try`/`catch` where possible
- Avoid using the `any` type
- Use Bun APIs when possible, like `Bun.file()`
- Rely on type inference when possible; avoid explicit type annotations or interfaces unless necessary for exports or clarity
- Prefer functional array methods (flatMap, filter, map) over for loops; use type guards on filter to maintain type inference downstream
- In `src/config`, follow the existing self-export pattern at the top of the file (for example `export * as ConfigAgent from "./agent"`) when adding a new config module.

Reduce total variable count by inlining when a value is only used once.

```ts
// Good
const journal = await Bun.file(path.join(dir, "journal.json")).json()

// Bad
const journalPath = path.join(dir, "journal.json")
const journal = await Bun.file(journalPath).json()
```

### Destructuring

Avoid unnecessary destructuring. Use dot notation to preserve context.

```ts
// Good
obj.a
obj.b

// Bad
const { a, b } = obj
```

### Variables

Prefer `const` over `let`. Use ternaries or early returns instead of reassignment.

```ts
// Good
const foo = condition ? 1 : 2

// Bad
let foo
if (condition) foo = 1
else foo = 2
```

### Control Flow

Avoid `else` statements. Prefer early returns.

```ts
// Good
function foo() {
  if (condition) return 1
  return 2
}

// Bad
function foo() {
  if (condition) return 1
  else return 2
}
```

### Schema Definitions (Drizzle)

Use snake_case for field names so column names don't need to be redefined as strings.

```ts
// Good
const table = sqliteTable("session", {
  id: text().primaryKey(),
  project_id: text().notNull(),
  created_at: integer().notNull(),
})

// Bad
const table = sqliteTable("session", {
  id: text("id").primaryKey(),
  projectID: text("project_id").notNull(),
  createdAt: integer("created_at").notNull(),
})
```

## Testing

- Avoid mocks as much as possible
- Test actual implementation, do not duplicate logic into tests
- Tests cannot run from repo root (guard: `do-not-run-tests-from-root`); run from package dirs like `packages/opencode`.

## Type Checking

- Always run `bun typecheck` from package directories (e.g., `packages/opencode`), never `tsc` directly.

## Desktop Packages

The project maintains two parallel desktop clients:

| | `packages/desktop/` | `packages/desktop-electron/` |
|---|---|---|
| **Stack** | Tauri v2 (Rust backend + system WebView) | Electron (Node.js backend + Chromium) |
| **Version** | `1.14.19` | `1.14.19` (kept in sync) |
| **Backend** | Rust in `src-tauri/src/` | TypeScript in `src/main/` |
| **Renderer** | SolidJS in `src/` | SolidJS in `src/renderer/` |
| **Bridge** | Tauri Specta generated `bindings.ts` | `contextBridge` + `ipcMain` in `src/preload/` |
| **Storage** | `@tauri-apps/plugin-store` | `electron-store` |
| **Updater** | `tauri-plugin-updater` | `electron-updater` |
| **Build** | Vite + `tauri` CLI | `electron-vite` + `electron-builder` |
| **Linux depth** | Deep DE detection (GNOME/KDE/Hyprland/Sway/i3/etc) | Standard Chromium abstraction |

### Shared architecture

Both renderers implement the same `Platform` interface for `@opencode-ai/app` and share:
- Business logic/UI from `@opencode-ai/app` and `@opencode-ai/ui`
- `publicDir` pointing to `../app/public`
- Sidecar lifecycle: spawn `packages/opencode` → health check → SQLite migration → show main window
- WSL path conversion, deep links (`opencode://`), file dialogs, clipboard image, notifications, webview zoom
- Dev/Beta/Prod channels via `OPENCODE_CHANNEL`

### Development entrypoints

- Electron (default): `bun dev:desktop` from repo root
- Tauri: `bun run --cwd packages/desktop tauri dev`

### Tests

- `packages/desktop`: Rust unit tests only (`cli.rs`, `linux_windowing.rs`, `lib.rs`). No frontend tests in this package.
- `packages/desktop-electron`: `bun:test` in `shell-env.test.ts` and `html.test.ts`. No frontend tests in this package.
- Frontend tests live upstream in `packages/app`.
