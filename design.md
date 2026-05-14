# Omni Studio Marketplace (CLI) — 设计文档

## 1. 架构概览

```
┌─────────────────────────────────────────┐
│         opencode omni-studio            │
│  (CLI command router & argument parser) │
└─────────────────────────────────────────┘
                   │
    ┌──────────────┼──────────────┐
    ▼              ▼              ▼
┌────────┐   ┌──────────┐   ┌──────────┐
│  Auth  │   │  Market  │   │  Local   │
│ Module │   │  Client  │   │  Store   │
└────────┘   └──────────┘   └──────────┘
    │              │              │
    ▼              ▼              ▼
~/.omni_studio/  HTTP API    ~/.omni_studio/
omni-studio.json             {skills,tools,...}/
```

## 2. 模块划分

| 模块 | 职责 | 文件 |
|---|---|---|
| `cli.ts` | 命令解析与路由 | `src/omni-studio/cli.ts` |
| `auth.ts` | 登录/登出/Token 管理 | `src/omni-studio/auth.ts` |
| `market.ts` | HTTP 市场 API 调用 | `src/omni-studio/market.ts` |
| `store.ts` | 本地扩展安装/卸载/状态，含 fs.watch 自动清理 | `src/omni-studio/store.ts` |
| `executor.ts` | 扩展生命周期脚本检测与执行（install/start/stop/uninstall/activate），脚本存放在扩展目录的 `lifecycle/` 子目录中 | `src/omni-studio/executor.ts` |
| `config.ts` | 配置文件读写 | `src/omni-studio/config.ts` |
| `types.ts` | 共享类型定义 | `src/omni-studio/types.ts` |
| `dialog-omni-studio.tsx` | TUI 对话框：展示 Omni Studio Extension 菜单（status/local/list/login/logout/setup）。安装/卸载/启用/禁用操作在 list 和 local 视图中以行内按钮提供 | `src/cli/cmd/tui/component/dialog-omni-studio.tsx` |

## 3. 数据模型

### 3.1 登录配置 (`~/.omni_studio/omni-studio.json`)

```ts
interface OmniStudioConfig {
  api_base: string
  access_token: string
  refresh_token: string
  user: {
    id: string
    username: string
  }
}
```

### 3.2 本地状态 (`~/.omni_studio/state.json`)

```ts
interface OmniStudioState {
  extensions: Array<{
    type: "skill" | "tool" | "plugin" | "agent"
    slug: string
    version: string
    enabled: boolean
    installed_at: string
  }>
}
```

### 3.3 扩展元数据

```ts
interface Extension {
  slug: string
  name: string
  description: string
  version: string
  type: "skill" | "tool" | "plugin" | "agent"
  author: string
  download_url: string
}

// 扩展目录中可能存在的生命周期脚本
interface ExtensionScripts {
  // 安装依赖
  install?: "install.sh" | "install.bat" | "install.ps1"
  // 启用时执行
  start?: "start.sh" | "start.bat" | "start.ps1"
  // 禁用时执行
  stop?: "stop.sh" | "stop.bat" | "stop.ps1"
  // 卸载时执行
  uninstall?: "uninstall.sh" | "uninstall.bat" | "uninstall.ps1"
  // 环境隔离激活（执行其他脚本前调用）
  activate?: "activate.sh" | "activate.bat" | "activate.ps1"
}
```

## 4. 接口设计

### 4.1 CLI 命令接口

```ts
type Command =
  | { cmd: "login" }                                 // 仅输入 username / password，api_base 由 setup 预先配置
  | { cmd: "logout" }
  | { cmd: "setup" }                                 // 设置 api_base
  | { cmd: "list"; type?: ExtensionType }          // 交互式：展示远程列表 + 本地安装状态，支持选中安装
  | { cmd: "install"; type: ExtensionType; slug: string; version?: string }
  | { cmd: "uninstall"; type: ExtensionType; slug: string }
  | { cmd: "enable"; type: ExtensionType; slug: string }
  | { cmd: "disable"; type: ExtensionType; slug: string }
  | { cmd: "status" }                               // 交互式：展示本地扩展，支持选中启用/禁用/卸载
```

### 4.1a TUI Slash 命令接口

TUI 中的 slash 命令（`/` 触发）通过 `app.tsx` 的 command registry 机制注入。

```ts
// app.tsx 中注册的 slash 命令示例（dev 分支新结构）
{
  name: "omni-studio",
  title: "Omni Studio",
  category: "System",
  slashName: "omni-studio",
  slashAliases: ["omni"],
  run: () => dialog.replace(() => <DialogOmniStudio />),
}
```

`DialogOmniStudio` 组件内部使用 `DialogSelect` 展示子菜单：
- **Status**：调用 `Store.getStatus()`，仅展示登录状态和 API 配置摘要
- **Local**：调用 `Store.getStatus()`，展示本地扩展列表，每行提供行内 `[启用]`/`[禁用]`/`[卸载]` 按钮（点击后切换为 `[确认启用] [取消]` 等确认模式）
- **List**：调用 `Market.listPaged()`，展示远程扩展列表，顶部支持 `[skill]`/`[tool]`/`[plugin]`/`[agent]` 类型切换，每行右侧提供 `[安装]` 按钮，点击后弹出确认并安装
- **Login**：输入 username / password，从配置读取 api_base 完成认证
- **Logout**：调用 `Auth.logout()`，清除本地 token
- **Setup**：输入 api_base，持久化到配置文件中

slash 命令的数据流与 CLI 命令共享同一套 Effect Service（`OmniStudioAuth`、`OmniStudioMarket`、`OmniStudioStore`），通过 `Effect.provide(defaultLayer)` 注入依赖。

### 4.2 Auth API

```ts
async function login(credentials: { username: string; password: string }): Promise<AuthResult>  // 从配置读取 api_base
async function logout(): Promise<void>
async function getAuthHeaders(): Promise<Record<string, string>>
async function setupEndpoints(apiBase: string): Promise<void>  // 设置服务地址
```

### 4.3 Market API

```ts
async function listExtensions(type?: ExtensionType): Promise<Extension[]>
async function downloadExtension(ext: Extension, targetDir: string): Promise<void>
```

### 4.4 Store API

```ts
async function install(ext: Extension): Promise<void>
async function uninstall(type: ExtensionType, slug: string): Promise<void>
async function setEnabled(type: ExtensionType, slug: string, enabled: boolean): Promise<void>
async function getStatus(): Promise<{ config: OmniStudioConfig | null; extensions: ExtensionEntry[] }>
```

### 4.5 Executor API

```ts
// 检测扩展目录中存在的生命周期脚本（按当前 OS 匹配后缀）
function detectScripts(extensionDir: string): ExtensionScripts

// 执行单个脚本；如存在 activate 脚本，先 source/调用 activate 再执行目标脚本
async function runScript(
  extensionDir: string,
  scriptName: "install" | "start" | "stop" | "uninstall",
  scripts: ExtensionScripts
): Promise<{ exitCode: number; stdout: string; stderr: string }>

// 根据 OS 返回可执行文件匹配模式
function getScriptSuffix(): ".sh" | ".bat" | ".ps1"
```

## 5. 关键流程

### 5.1 地址配置流程（setup）

```
1. 交互式输入 api_base（API 服务基础地址）
2. 校验地址格式（必须以 http:// 或 https:// 开头）
3. 保存 api_base 到 omni-studio.json（不覆盖已有 token）
4. 输出配置成功信息
```

### 5.2 登录流程

```
1. 检查是否已有登录配置
   - 有 → 提示已登录，询问是否重新登录
   - 无 → 继续
2. 读取配置中的 api_base；如未设置，提示先运行 setup
3. 交互式输入 username / password
4. POST ${apiBase}/auth/auth/login
5. 保存 token 和用户信息到 omni-studio.json（保留已有 api_base）
6. 设置文件权限 0o600
7. 输出登录成功信息
```

### 5.3 安装流程

```
1. 检查是否已登录（读取 omni-studio.json）
2. 调用 Market API 获取扩展元数据
3. 查找本地是否已有同类型同 slug 的扩展，记录其 enabled 状态（更新场景需保留）
4. 检查缓存 ~/.omni_studio/cache/{type}/{slug}-{version}.zip 是否存在
   - 存在 → 直接使用缓存，跳过下载
   - 不存在 → 使用 fetch ReadableStream 流式下载扩展包，通过 onProgress 回调实时报告已下载字节数和 Content-Length 总字节数；TUI 列表行展示 `下载中 XX%`
5. 若目标目录 ~/.omni_studio/{type}s/{slug}/ 已存在（更新场景），先 rm -rf 删除旧目录，避免旧版本文件残留
6. 解压到 ~/.omni_studio/{type}s/{slug}/
7. 检测扩展目录 lifecycle/ 子目录中的生命周期脚本（detectScripts）
8. 如存在 install 脚本：
   - 先检测是否存在 activate 脚本，有则先 source/调用
   - 执行 lifecycle/install.sh（或 .bat/.ps1，根据 OS）
   - 如脚本返回非 0，输出错误；保留解压目录和缓存 zip 便于排查
9. 清理 cache 目录中同 slug 的旧版本 zip 文件（如 math-tool-v1.0.0.zip），仅保留当前版本，避免磁盘无限增长
10. 更新 state.json（新安装 enabled: false；更新保留原有 enabled 状态）
11. 输出安装成功信息
```

### 5.4 列表交互流程（list）

```
1. 调用 Market API 获取远程扩展列表
2. 调用 Store.getStatus() 获取本地已安装扩展及其版本号
3. 构建扩展列表，每行判断状态：
   - 未安装 → 右侧展示 [ 安装 ] 按钮
   - 已安装且版本一致 → 右侧展示 [已安装] 灰色文字
   - 已安装但版本不一致 → 右侧展示 [ 更新 ] 按钮（橙色，同安装按钮）
4. 用户选中扩展按 Enter：
   - 未安装 / 需要更新 → 进入确认模式（[确认安装]/[取消] 或 [确认更新]/[取消]）
   - 已安装 → 无操作
5. 确认后执行 install（更新场景会覆盖旧版本）
6. 安装结果通过行内状态展示（成功/失败），3 秒后自动清除
7. 使用 while 循环支持连续操作
```

### 5.5 状态交互流程（status）

```
1. 调用 Store.getStatus() 获取本地扩展列表
2. 如无扩展，log.warn("No extensions installed") → 结束
3. 构建 prompts.select 选项：
   - 每个选项显示：slug (v1.0.0) [enabled/disabled]
   - 末尾增加「退出」选项
4. 用户选择扩展后，再次 select 动作：
   - 启用 / 禁用 / 卸载 / 返回
5. 执行对应操作：
   - enable/disable → 调用 setEnabled → 成功提示 → 返回状态列表
   - uninstall → 调用 uninstall → 成功提示 → 返回状态列表
   - 返回 → 直接回到状态列表
   - 退出 → 结束交互
6. 使用 while 循环支持连续操作
```

### 5.6 卸载流程

```
1. 读取 state.json 确认扩展已安装
2. 检测扩展目录中的生命周期脚本（detectScripts）
3. 如存在 uninstall 脚本：
   - 先 source/调用 activate 脚本（如有）
   - 执行 uninstall 脚本
   - 脚本失败仍继续删除文件，但警告用户
4. 删除 ~/.omni_studio/{type}/{slug}/ 目录
5. 从 state.json 移除该扩展记录
6. 输出卸载成功信息
```

### 5.7 启用流程（enable）

```
1. 读取 state.json 确认扩展存在且当前为 disabled
2. 检测扩展目录中的生命周期脚本
3. 如存在 start 脚本：
   - 先 source/调用 activate 脚本（如有）
   - 执行 start 脚本
   - 脚本失败则保持 disabled 状态并输出错误
4. 更新 state.json（enabled: true）
5. 输出启用成功信息
```

### 5.8 禁用流程（disable）

```
1. 读取 state.json 确认扩展存在且当前为 enabled
2. 检测扩展目录中的生命周期脚本
3. 如存在 stop 脚本：
   - 先 source/调用 activate 脚本（如有）
   - 执行 stop 脚本
   - 脚本失败仍标记为 disabled，但警告用户
4. 更新 state.json（enabled: false）
5. 输出禁用成功信息
```

### 5.9 TUI Slash 命令流程

```
1. 用户在 TUI 输入框中输入 "/" 触发 slash 命令补全
2. 输入 "omni-studio" 或 "omni" 后回车
3. TUI 打开 DialogOmniStudio 组件（DialogSelect 菜单）
4. 用户选择子操作：
   - Status → 调用 Store.getStatus() → 展示登录状态和 API 配置摘要
   - Local  → 调用 Store.getStatus() → 展示本地扩展列表，支持行内启用/禁用/卸载（行内确认模式，不弹出独立 dialog）
   - List   → 调用 Market.listPaged() → 展示远程扩展列表，支持类型切换和分页，每行提供 `[安装]` 按钮
   - Login  → 输入 username / password（从配置读取 api_base）
   - Logout → 调用 Auth.logout() → 展示登出结果
   - Setup  → 输入 api_base → 保存配置
5. 按 esc 返回菜单，再次按 esc 关闭对话框
6. 列表和本地扩展视图中的 scrollbox 高度根据实际内容量自适应（`min(内容高度, 窗口高度 × 0.4)`），避免空白过多
7. 列表项使用 `justifyContent="space-between"`，扩展名称居左，操作按钮居右，分界清晰
8. 键盘快捷键支持：
   - ↑/↓（或 j/k）：在列表中移动选中行，当前行高亮显示
   - Enter：执行当前行的操作（安装/确认安装/启用/禁用/卸载）
   - Tab：切换 skill/tool/plugin/agent 类型
   - ←/→（或 h/l）：上一页/下一页
   - Esc：返回上一级（子视图 → 主菜单，主菜单 → 关闭对话框）
9. 脚本执行失败时，通过 DialogAlert 展示完整错误信息（含 stdout/stderr），关闭 Alert 后重新打开当前子视图
```

**设计约束**：
- TUI 中不使用 `@clack/prompts`（会与 TUI 终端渲染器冲突）
- Login / Setup 使用 TUI 原生 DialogPrompt / DialogSelect 完成交互
- 信息展示使用纯文本框（`<text>` 组件），不引入复杂交互
- List / Local 视图中的操作按钮采用**行内确认模式**（点击 `[卸载]` 后该行变为 `[确认卸载] [取消]`），避免调用 `DialogConfirm.show` 触发 `dialog.replace` 导致的 `onClose` 回到主菜单问题
- scrollbox 高度根据内容条数动态计算，最大不超过窗口高度的 40%，避免内容少时占据过多空间
- 长扩展名称设置 `wrapMode="none" overflow="hidden"` 防止换行，按钮始终可见

### 5.10 脚本执行规则

```
- 生命周期脚本存放在扩展目录的 lifecycle/ 子目录中，如 lifecycle/install.sh
- Shell 脚本（.sh）：在 Unix 系统通过 /bin/sh 执行
- Batch 脚本（.bat）：在 Windows 通过 cmd.exe /c 执行
- PowerShell 脚本（.ps1）：在 Windows 优先通过 pwsh/powershell 执行
- activate 脚本的特殊性：
  - 如为 .sh，使用 "source lifecycle/activate.sh && <command>" 方式合并执行
  - 如为 .bat/.ps1，先执行 activate 脚本，再执行目标脚本（同进程环境继承）
  - activate 脚本本身不计入错误回滚条件，仅用于环境准备
- 所有脚本执行工作目录设为扩展目录本身（cwd = ~/.omni_studio/{type}/{slug}/），脚本路径为相对路径 lifecycle/{name}.{suffix}
```

### 5.11 实时同步机制

```
背景：
- store.ts 在启用/禁用扩展时会写入 state.json
- skill/index.ts、config/config.ts、tool/registry.ts 需要感知 state.json 变化并刷新缓存
- 最初使用 GlobalBus 发射事件，但 Bun Web Worker 的模块缓存隔离导致 worker.ts
  和 skill/config/tool 三处的 GlobalBus 不是同一实例，listener 永远无法收到事件

最终方案：
- 完全基于文件系统事件，不依赖进程内消息传递
- skill/index.ts：fs.watch 监听 ~/.omni_studio/，state.json 变化时触发 skill 刷新
- config/config.ts：fs.watch 监听 ~/.omni_studio/，state.json 变化时触发 config 刷新
- tool/registry.ts：fs.watch 监听 ~/.omni_studio/，state.json 变化时触发 tool registry 刷新
- 回调通过 InstanceState.bind() 包装，自动恢复 InstanceContext
- Effect.runPromise(refresh().pipe(Effect.provideService(InstanceRef, ctx))) 显式注入上下文

store.ts 额外监听：
- store.ts 也启动 fs.watch 监听 ~/.omni_studio/ 目录
- 当 skills/agents/plugins/tools 下的扩展目录被删除时
- 自动从 state.json 中移除对应扩展记录，防止加载不存在的扩展
- 幂等设计：即使多次触发或 uninstall API 已清理过，都不会重复写入
```

## 6. 技术选型

| 层面 | 选型 | 理由 |
|---|---|---|
| HTTP 客户端 | `fetch` (Bun 内置) | 项目已使用 Bun，无需额外依赖 |
| 配置存储 | JSON 文件 + `Bun.file()` | 符合项目风格，简单可靠 |
| 压缩解压 | `Bun.write()` + `unzip` 或 `fflate` | 扩展包通常为 zip 格式 |
| 脚本执行 | `Bun.spawn()` 或 `$` | Bun 内置进程管理，支持流式输出和退出码捕获 |
| 类型校验 | Effect Schema（dev 分支已迁移） | 项目全面迁移到 Effect-TS，Zod 已逐步移除 |
| 后端框架 | Bun.serve + Effect HttpApi（dev 分支已迁移） | 从 Hono 迁移到原生 Bun HTTP 服务 |
| 实时同步 | `fs.watch` | 绕过 Bun Web Worker 模块缓存隔离问题，跨进程可靠 |
| Effect Service | `Effect.gen` + `Layer.effect` | 项目标准模式，支持依赖注入和上下文管理 |

## 6. CLI 构建与分发设计

### 6.1 ripgrep 嵌入方案

**问题**：编译后的 CLI 单文件二进制在运行时可能找不到 `rg`（ripgrep）二进制，导致自动从网络下载失败（用户环境可能无法访问 GitHub releases）。

**方案**：构建时将对应平台的 `rg` 二进制通过 `with { type: "file" }` 导入嵌入到编译产物中，运行时从 bunfs 解压到用户 cache 目录。

```
构建流程：
1. build.ts 下载对应平台 rg → dist/{name}/bin/rg
2. 生成 src/file/ripgrep-embedded.gen.ts
   import embeddedRg from "../../dist/{name}/bin/rg" with { type: "file" };
3. Bun.build() 编译时自动将 rg 嵌入到 opencode 二进制内部的 bunfs
4. 构建完成后恢复默认 ripgrep-embedded.gen.ts（export undefined）

运行流程：
1. ripgrep.ts 导入 embeddedRg
2. 如果 embeddedRg 存在（编译后的二进制）：
   a. 检查 ~/.cache/opencode/bin/rg 是否存在
   b. 不存在 → 从 bunfs 读取嵌入的 rg 内容 → 写入 cache → chmod 755
   c. 返回 cache 路径
3. 如果 embeddedRg 不存在（开发模式 bun run）：
   a. 回退到原有查找逻辑：CLI 同目录 → node_modules/.bin → PATH → 网络下载
```

**文件变更**：
- `script/build.ts`：rg 下载移到 Bun.build 之前，生成/恢复嵌入导入文件
- `src/file/ripgrep.ts`：优先从 embeddedRg 解压，增加详细诊断日志
- `src/file/ripgrep-embedded.gen.ts`：默认 export undefined，构建时被覆盖

**GitHub Action 变更**：
- workflow 直接上传单文件 `opencode`（rg 已内嵌，不再需要压缩包分发）

## 7. 风险与假设

- **假设**：Omni Studio API 返回的扩展包为 zip 格式。如为其他格式需调整解压逻辑。
- **假设**：Bun compile 的 `with { type: "file" }` 导入在目标平台（linux-x64 / darwin-arm64 / win32-x64 等）上均正常工作。
- **风险**：Token 明文存储于本地。缓减措施：设置严格的文件权限（0o600）。
- **风险**：网络不稳定导致下载中断。缓减措施：支持断点续传或重新下载。
- **风险**：扩展与本地现有扩展冲突。缓减措施：安装前检查 slug 和 type 是否已存在。
- **风险**：生命周期脚本执行失败导致扩展处于半安装/半启用状态。缓减措施：
  - install/start 失败时回滚状态变更
  - stop/uninstall 失败时继续操作但输出警告
  - 所有脚本超时时间为 5 分钟，超时时强制终止
- **风险**：activate 脚本未正确设置环境变量导致后续脚本失败。缓减措施：在合并命令中导出环境变量，或在同一会话中顺序执行。
