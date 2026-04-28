# Omni Studio 市场管理功能设计文档

## 一、项目架构概述

OpenCode 项目由三个核心部分组成：

| 部分 | 职责 | 技术栈 |
|------|------|--------|
| **Web 页面** | 前端 UI，提供 Marketplace 浏览、安装、配置界面 | SolidJS + TypeScript |
| **桌面端引擎** | 承上启下，为前端提供系统能力（文件系统、下载、解压等） | Electron (Node.js) + Tauri (Rust) |
| **CLI 执行器** | 实际运行扩展（Skill/Tool/Plugin/Agent） | Bun + Effect-TS |

---

## 二、已实现的修改

### 2.1 Web 页面（Frontend）

#### 设置界面与登录流程
- **问题**：点击市场后只显示登录界面，没有设置入口，用户无法配置后端 API 地址。
- **修改**：
  - 在 `packages/app/src/omni-studio/components/login-page.tsx` 中添加设置按钮，支持展开/收起 `SettingsPanel`
  - 在 `packages/app/src/omni-studio/components/settings-panel.tsx` 中使用 `createSignal` 绑定输入值，修复 TextField 无法编辑的问题
  - 添加 `omniStudio.settings.show` / `omniStudio.settings.hide` 国际化键

#### API 格式适配
- **问题**：前端假设后端返回 `{ success: true, data: ... }`，但实际 VXAgent Platform 返回 `{ code: 200, message: "成功", data: ... }`
- **修改**：
  - `authFetch` / `apiFetch` 的错误检查从 `!result.success` 改为 `result.code !== 200`
  - `login()` 正确解析 `userId`, `username`, `nickname`, `openid`，并将 `nickname` 映射到 `UserInfo.fullName`
  - 默认 `API_BASE` 设为 `http://192.88.1.63:18000/api/v1`，默认 `AUTH_BASE` 设为 `http://192.88.1.63:18079`

#### 桌面端同步
- **修改**：`login()` / `logout()` / `installExtension()` / `uninstallExtension()` / `enableExtension()` / `disableExtension()` 操作成功后，调用桌面端 IPC 同步本地文件状态

### 2.2 桌面端引擎（Desktop）

#### Electron 端
新增 `packages/desktop-electron/src/main/omni-studio.ts`，提供以下 IPC Handler：

| 方法 | 功能 |
|------|------|
| `downloadExtension(type, slug, version, apiBase, token)` | HTTP 下载 ZIP → 解压到 `~/.omni_studio/{type}/{slug}/` → 更新 `state.json` |
| `removeExtensionDir(type, slug)` | 删除本地目录并从 `state.json` 移除 |
| `updateExtensionState(type, slug, enabled)` | 更新 `state.json` 中对应条目的 `enabled` |
| `syncOmniStudioConfig(apiBase, authBase, token)` | 写入 `~/.omni_studio/omni-studio.json`（权限 `0o600`） |
| `removeOmniStudioConfig()` | 删除配置文件 |

修改文件：
- `preload/types.ts` / `preload/index.ts`：暴露新的 IPC API
- `main/ipc.ts`：注册 handler

#### Tauri 端
新增 `packages/desktop/src-tauri/src/omni_studio.rs`，实现与 Electron 端完全对应的 Rust Command：

| Command | 功能 |
|---------|------|
| `download_extension` | 使用 `reqwest` 下载，使用 `zip` crate 解压 |
| `remove_extension_dir` | 删除目录并更新 `state.json` |
| `update_extension_state` | 更新 `state.json` |
| `sync_omni_studio_config` | 写入 `omni-studio.json` |
| `remove_omni_studio_config` | 删除 `omni-studio.json` |

修改文件：
- `Cargo.toml`：新增 `zip = "2.2"` 依赖
- `src/lib.rs`：注册命令到 `tauri_specta::collect_commands!`
- `src/bindings.ts`：手动添加命令绑定（运行 `tauri dev` 后会自动重新生成）
- `src/index.tsx`：Tauri 启动时将命令挂载到 `window.api`，与 Electron 保持同构接口

### 2.3 CLI 执行器（CLI）

#### 新增状态读取模块
`packages/opencode/src/omni-studio/state.ts`
- `readOmniStudioState()`：读取 `~/.omni_studio/state.json`
- `getEnabledSlugs(state, type)`：获取指定类型下 `enabled: true` 的扩展 ID 列表
- `OMNI_STUDIO_PATHS`：统一的路径常量

#### 加载器修改
| 加载器 | 修改内容 |
|--------|----------|
| **Skill** (`src/skill/index.ts`) | `discoverSkills()` 中额外扫描 `~/.omni_studio/skills/*/` 下的 `SKILL.md`，按 `state.json` 过滤 |
| **Tool** (`src/tool/registry.ts`) | `loadCustomTools()` 中额外扫描 `~/.omni_studio/tools/*/` 下的 `*.{js,ts}`，按 `state.json` 过滤 |
| **Plugin** (`src/plugin/index.ts`) | 将 `~/.omni_studio/plugins/{slug}/` 作为本地路径加入加载列表，按 `state.json` 过滤 |
| **Agent** (`src/agent/agent.ts`) | 在硬编码 agents 之后，额外扫描 `~/.omni_studio/agents/*/` 下的 `*.md`，解析 frontmatter 后按 `state.json` 过滤 |

---

## 三、市场管理功能实现

### 3.1 数据流

```
┌──────────────┐     HTTP (VXAgent Platform)      ┌──────────────┐
│   Web 页面   │ ◄────────────────────────────────► │   后端 API   │
│  (SolidJS)   │                                    │  (18000/18079)│
└──────┬───────┘                                    └──────────────┘
       │
       │ IPC / Command
       ▼
┌──────────────┐     文件操作                         ┌──────────────┐
│  桌面端引擎   │ ──────────────────────────────────► │ ~/.omni_studio/│
│(Electron/Tauri)│   下载/解压/删除/读写 state.json   │              │
└──────────────┘                                    └──────────────┘
                                                          │
                                                          │ 本地扫描
                                                          ▼
                                                   ┌──────────────┐
                                                   │  CLI 执行器   │
                                                   │ (Skill/Tool/  │
                                                   │  Plugin/Agent)│
                                                   └──────────────┘
```

### 3.2 本地目录结构

```
~/.omni_studio/
  skills/
    my-skill/
      SKILL.md
  tools/
    my-tool/
      index.ts
  plugins/
    my-plugin/
      package.json
      index.ts
  agents/
    my-agent/
      agent.md
  state.json              # 启用状态
  omni-studio.json        # 后端配置（apiBase, authBase, token）
```

`state.json` 格式：
```json
{
  "skills": { "my-skill": { "enabled": true, "version": "1.0.0" } },
  "tools": { "my-tool": { "enabled": false, "version": "1.0.0" } },
  "plugins": {},
  "agents": {}
}
```

### 3.3 关键交互时序

1. **用户登录**
   - 前端调用 `POST {authBase}/auth/auth/login`
   - 成功后保存 token 到 localStorage
   - 调用桌面端 IPC 同步 `omni-studio.json`

2. **安装扩展**
   - 前端调用 `POST {apiBase}/packages/{type}/my`（后端登记）
   - 成功后调用桌面端 IPC `downloadExtension()`
   - 桌面端下载 ZIP → 解压 → 更新 `state.json`

3. **启用/禁用扩展**
   - 前端调用 `PATCH {apiBase}/packages/{type}/my/{id}`（后端状态）
   - 成功后调用桌面端 IPC `updateExtensionState()`

4. **CLI 运行**
   - CLI 启动时读取 `~/.omni_studio/state.json`
   - 只加载 `enabled: true` 的扩展

---

## 四、未实现功能：Harness 管理

### 4.1 背景

后端已将 **Harness** 实现为一种特殊的 Package。它本质上是一个**捆绑包**，包含：
- 多个 **Skill**
- 多个 **Agent**
- 多个 **Plugin**
- 一份说明文档 **HARNESS.md**

### 4.2 目标行为

1. **存储位置**：Harness 下载到 `~/.omni_studio/harness/{slug}/`
2. **一键启用**：当用户启用一个 Harness 时，其中包含的所有 Skill、Agent、Plugin 同时被启用
3. **文档加载**：`HARNESS.md` 需要被加载到系统提示词中（与 `AGENTS.md` 同级）

### 4.3 设计草案

#### 4.3.1 目录结构

```
~/.omni_studio/
  harness/
    my-harness/
      HARNESS.md           # 捆绑包说明文档
      skills/
        skill-a/
          SKILL.md
      agents/
        agent-b/
          agent.md
      plugins/
        plugin-c/
          package.json
          index.ts
  state.json               # 新增 harness 字段
```

`state.json` 扩展格式：
```json
{
  "skills": { ... },
  "tools": { ... },
  "plugins": { ... },
  "agents": { ... },
  "harness": {
    "my-harness": { "enabled": true, "version": "1.0.0" }
  }
}
```

#### 4.3.2 前端修改

1. **类型定义** (`types.ts`)
   ```ts
   export type ExtensionType = "skill" | "agent" | "tool" | "plugin" | "harness"
   ```

2. **API 层** (`api.ts`)
   - `installExtension` / `uninstallExtension` / `enableExtension` / `disableExtension` 需要支持 `harness` 类型
   - 安装 Harness 时，桌面端 IPC 需要下载整个捆绑包

3. **UI 层**
   - Sidebar 分类列表新增 "Harness" 选项
   - `toPlural` 映射新增 `harness: "harnesses"`

#### 4.3.3 桌面端修改

**Electron** (`omni-studio.ts`) 和 **Tauri** (`omni_studio.rs`)：
- `downloadExtension()` 支持 `harness` 类型，下载后解压到 `harness/{slug}/`
- `removeExtensionDir()` 支持删除 harness 目录
- `updateExtensionState()` 支持更新 harness 的启用状态

#### 4.3.4 CLI 修改

**状态读取** (`state.ts`)
- `OmniStudioState` 新增 `harness` 字段
- `getEnabledSlugs()` 支持 `"harness"` 类型

**Harness 加载器**（新增）
建议新增 `packages/opencode/src/harness/index.ts`：

```ts
// 1. 读取 ~/.omni_studio/state.json 中 enabled 的 harness
// 2. 对每个 harness 目录：
//    - 读取 HARNESS.md 内容（作为系统提示词的一部分）
//    - 遍历 harness/{slug}/skills/* → 交给 Skill 加载器
//    - 遍历 harness/{slug}/agents/* → 交给 Agent 加载器
//    - 遍历 harness/{slug}/plugins/* → 交给 Plugin 加载器
```

**各加载器修改**
- **Skill** (`skill/index.ts`)：`discoverSkills()` 中，在 omni-studio skills 之后，额外扫描 `~/.omni_studio/harness/*/skills/*/` 下的 `SKILL.md`
- **Agent** (`agent/agent.ts`)：在 omni-studio agents 之后，额外扫描 `~/.omni_studio/harness/*/agents/*/` 下的 `*.md`
- **Plugin** (`plugin/index.ts`)：将 `~/.omni_studio/harness/*/plugins/*/` 作为本地路径加入加载列表

**HARNESS.md 加载**（与 AGENTS.md 同级）
- AGENTS.md 的加载在 `packages/opencode/src/config/managed.ts` 或项目根目录扫描中
- HARNESS.md 的加载可以在同一位置新增：
  - 扫描 `~/.omni_studio/harness/*/` 下的 `HARNESS.md`
  - 将内容合并到系统提示词中（与 AGENTS.md 内容拼接）

#### 4.3.5 启用/禁用逻辑

当用户启用一个 Harness 时：
1. 后端 API 调用：`PATCH /packages/harnesses/my/{slug}` → `enabled: true`
2. 前端调用桌面端 IPC：`updateExtensionState("harness", slug, true)`
3. CLI 读取 `state.json` 时：
   - 看到 `harness.my-harness.enabled: true`
   - 自动加载该 harness 下的所有 skill、agent、plugin

当用户禁用一个 Harness 时：
1. 后端 API 调用：`PATCH /packages/harnesses/my/{slug}` → `enabled: false`
2. 前端调用桌面端 IPC：`updateExtensionState("harness", slug, false)`
3. CLI 不再加载该 harness 下的任何扩展

#### 4.3.6 待确认问题

1. **后端 API**：
   - Harness 的下载接口是否为 `GET /packages/harnesses/{slug}/revisions/{version}/download`？
   - Harness 列表接口是否为 `GET /packages/harnesses` 和 `GET /packages/harnesses/my`？

2. **HARNESS.md 格式**：
   - 是否和 SKILL.md / AGENTS.md 一样使用 YAML frontmatter + Markdown？
   - 还是需要额外的元数据字段（如包含哪些 skill/agent/plugin）？

3. **版本管理**：
   - Harness 内的子扩展是否有独立版本？还是跟随 Harness 版本统一更新？

---

## 五、总结

| 模块 | 已完成 | 待实现 |
|------|--------|--------|
| 前端设置界面 | ✅ 登录页设置按钮、修复编辑、API 格式适配 | ⬜ Harness 类型支持 |
| 桌面端 IPC | ✅ Electron + Tauri 下载/删除/状态同步 | ⬜ Harness 下载与解压 |
| CLI 加载器 | ✅ Skill/Tool/Plugin/Agent 扫描 ~/.omni_studio | ⬜ Harness 加载器、HARNESS.md 加载 |
| 状态管理 | ✅ `state.json` / `omni-studio.json` | ⬜ `state.json` 新增 harness 字段 |
