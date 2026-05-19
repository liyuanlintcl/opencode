# Omni Studio Extension — 设计文档

## 1. 架构概览

```
┌─────────────────────────────────────────┐
│      omni extension 命令                │
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
| `cli.ts` | 命令解析与路由：注册 `omni extension <subcmd>` 子命令 | `src/omni-studio/cli.ts` |
| `auth.ts` | 登录/登出/Token 管理 | `src/omni-studio/auth.ts` |
| `market.ts` | HTTP 市场 API 调用 | `src/omni-studio/market.ts` |
| `store.ts` | 本地扩展安装/卸载/状态，含 fs.watch 自动清理 | `src/omni-studio/store.ts` |
| `executor.ts` | 扩展生命周期脚本检测与执行（install/start/stop/uninstall/activate），脚本存放在扩展目录的 `lifecycle/` 子目录中 | `src/omni-studio/executor.ts` |
| `config.ts` | 配置文件读写 | `src/omni-studio/config.ts` |
| `types.ts` | 共享类型定义 | `src/omni-studio/types.ts` |
| `spec-discovery.ts` | Spec 扩展发现机制：扫描 `~/.omni_studio/specs/` 下已启用 spec 的 `SPEC.md`，解析 YAML frontmatter（依赖声明），**只返回正文**（去掉 frontmatter）拼接到 instructions；扫描内嵌扩展（skills/tools/agents/plugins）的说明文件拼接到正文；提供依赖检查和级联管理辅助函数 | `src/omni-studio/spec-discovery.ts` |
| `dialog-omni-studio.tsx` | TUI 对话框：展示 Omni Studio Extension 菜单（status/local/list/spec/login/logout/setup）。安装/卸载/启用/禁用操作在 list 和 local 视图中以行内按钮提供；spec 视图支持手动触发 | `src/cli/cmd/tui/component/dialog-omni-studio.tsx` |

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
    type: "skill" | "tool" | "plugin" | "agent" | "spec"
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

通过 `omni extension <subcmd>` 调用：

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
- **List**：调用 `Market.listPaged()`，展示远程扩展列表，顶部支持 `[skill]`/`[tool]`/`[plugin]`/`[agent]`/`[spec]` 类型切换；每行左侧显示扩展名称（不含 version），右侧根据本地安装状态显示 `[安装]`/`[更新]`/`[已安装]` 按钮
- **Spec**：展示已安装的 spec 列表，每行提供 `[触发]` 按钮，手动执行 spec 定义的组合流水线
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
async function getRevisions(type: ExtensionType, slug: string): Promise<Revision[]>  // 新增：查询扩展可选版本列表
async function downloadExtension(ext: Extension, targetDir: string, version?: string): Promise<void>  // version 参数支持指定版本

interface Revision {
  version: string
  created_at: string
  // 可能包含其他元数据（changelog、作者等）
}
```

**版本列表接口**：
- Endpoint: `GET /api/v1/packages/{entity_type}/{slug}/revisions`
- Response: `{ revisions: Array<{ version: string, created_at: string }> }`
- 按版本号降序排列，最新版在首条
- 无认证要求（或携带认证头，视后端策略）

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
2. 调用 Market API 获取扩展元数据（listExtensions 或 getExtensionMeta）
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
11. 自动启用扩展（TUI 场景）：安装成功后立即调用 setEnabled(type, slug, true)
    - 启用成功 → 行内展示 "安装并启用成功"
    - 启用失败（如 start 脚本返回非 0）→ 行内展示红色 "安装成功，但启用失败: xxx"，扩展仍视为已安装
12. 输出安装成功信息
```

**指定版本安装补充说明**：
- CLI 命令 `install <type> <slug> [version]` 的 `version` 参数为可选，缺省时默认安装最新版
- TUI 中用户可通过版本下拉框选择特定版本，下拉框数据由 `getRevisions(type, slug)` 提供
- 指定版本时，下载 URL 需携带版本参数（由后端 `revisions` 接口返回的下载信息或 `downloadExtension` 内部拼接）
- 安装指定版本后仍覆盖本地旧版本（不保留多版本共存），旧版本文件被 rm -rf 删除

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
6. 安装成功后自动调用 setEnabled 启用扩展
   - 启用成功 → 行内状态展示 "安装并启用成功"（绿色）
   - 启用失败 → 行内状态展示 "安装成功，但启用失败: xxx"（红色），扩展仍视为已安装
7. 安装失败 → 行内状态展示 "安装失败: xxx"（红色），不弹出 DialogAlert
8. 使用 while 循环支持连续操作
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

### 5.8a Spec 发现流程

```
背景：
- spec 扩展是一个组合规格，通过 SPEC.md 声明意图和依赖
- 发现机制借鉴 opencode.jsonc 的 instructions 字段：系统读取文件内容并注入 system prompt
- 不同于 skill/tool/plugin/agent，spec 不需要注册到 state.json 作为独立可加载扩展
- spec 的内容（SPEC.md 正文）直接作为指令被消费，内嵌的 skill/tool/plugin/agent 通过扩展类型自身的扫描机制自动发现

发现时机：
1. 会话初始化时（`Instruction.system()` 内部调用 `discoverSpecs()`）

发现流程：
1. 读取 state.json，过滤出 type === "spec" 且 enabled === true 的扩展
2. 遍历每个已启用 spec 的目录 ~/.omni_studio/specs/{slug}/
3. 读取 SPEC.md 文件内容
4. 使用正则提取 YAML frontmatter（`---\n...\n---\n`）和正文
5. **只将正文部分**作为 instruction 注入，frontmatter 中的元数据（name/version/依赖声明）不注入
   格式：Instructions from: spec:{slug}:{path}\n{content.trim()}
6. 扫描内嵌扩展的说明文件并拼接到正文：
   - skills/ → 扫描 SKILL.md 文件，按 `\n\n--- Skills ---\n\n{content}` 格式拼接
   - tools/ → 扫描 TOOL.md 或 README.md，按 `\n\n--- Tools ---\n\n{content}` 格式拼接
   - agents/ → 扫描 AGENT.md，按 `\n\n--- Agents ---\n\n{content}` 格式拼接
   - plugins/ → 扫描 PLUGIN.md，按 `\n\n--- Plugins ---\n\n{content}` 格式拼接
7. 内嵌 skill/tool/agent/plugin **不单独注册到 state.json**，而是修改各扩展类型的扫描路径实现自动发现：
   - skill/index.ts: 增加扫描 `~/.omni_studio/specs/{slug}/skills/**/SKILL.md`
   - tool/registry.ts: 增加扫描 `~/.omni_studio/specs/{slug}/tools/*.{js,ts}`
   - config/config.ts: 增加扫描 `~/.omni_studio/specs/{slug}/agents/` → ConfigAgent.load()
   - config/config.ts: 增加扫描 `~/.omni_studio/specs/{slug}/plugins/` → ConfigPlugin.load()

与 instructions 字段的对比：
- opencode.jsonc instructions：用户手动指定文件路径，系统读取并注入
- spec 发现：系统自动扫描 ~/.omni_studio/specs/ 下已启用的 spec，读取 SPEC.md 正文注入
- 两者最终都汇入 Instruction.system() 的输出，作为 system prompt 的一部分

依赖管理：
- `checkMissingDependencies(specSlug)`：检查 spec 声明的外部依赖中未安装的扩展
- `checkDisabledDependencies(specSlug)`：检查 spec 声明的外部依赖中已安装但未启用的扩展
- `findDependentSpecs(depType, depSlug)`：查找依赖指定扩展的已启用 spec（级联禁用用）

幂等设计：
- 每次会话初始化重新扫描，无持久化状态依赖
- spec 禁用后其 SPEC.md 内容不再注入
- spec 卸载后目录不存在，自然跳过
```

### 5.8b Spec 触发流程（TUI）—— 未实现

```
【状态：未实现（F14）】

设计草案：
1. 用户在 Omni Studio 主菜单选择 "Spec"
2. 调用 Store.getStatus() 过滤出 type === "spec" 的已安装扩展
3. 构建 spec 列表，每行展示名称和版本
4. 用户选中 spec 按 Enter：
   a. 读取 spec 目录下的 SPEC.md
   b. 解析依赖列表（外部 + 内部）
   c. 检查所有依赖扩展是否已启用
   d. 有未启用的依赖 → 提示用户先启用（提供一键启用选项）
   e. 所有依赖就绪 → 执行 spec 定义的组合流水线
5. 执行结果通过 DialogAlert 展示
6. 按 esc 返回 spec 列表
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
8. 搜索框常驻显示：
   - `InlineSearch` 使用 `<textarea height={1}>` 单行输入，始终显示在列表顶部，默认不获取焦点
   - 焦点默认在列表上，方向键（↑↓/j/k）可直接导航扩展列表
   - 按 `/` 键 focus 搜索框（阻止 `/` 字符误输入），右侧提示 `/ 搜索`；focus 时提示自动隐藏
   - 按 Enter 确认搜索，搜索框自动 blur，焦点回到列表，方向键可继续导航
   - 显示 `[清除]` 按钮清空搜索词；焦点在列表时按 Backspace 一键清空搜索词
   - 清空搜索时通过 `queueMicrotask` 短暂隐藏再显示组件强制重新创建，清空输入框
9. 键盘快捷键支持：
   - ↑/↓（或 j/k）：在列表中移动选中行，当前行高亮显示
   - Enter：执行当前行的操作（安装/确认安装/启用/禁用/卸载）
   - Tab：切换 skill/tool/plugin/agent 类型
   - ←/→（或 h/l）：上一页/下一页
   - Backspace：焦点在列表时一键清空搜索词
   - Esc：返回上一级（子视图 → 主菜单，主菜单 → 关闭对话框）
10. 脚本执行失败时，通过 DialogAlert 展示完整错误信息（含 stdout/stderr），关闭 Alert 后重新打开当前子视图
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

### 5.10a Spec 依赖管理流程

```
背景：
- spec 通过 SPEC.md 的 YAML frontmatter 声明外部依赖（skills.external / tools.external / plugins.external / agents.external）
- 依赖管理逻辑集中在 TUI 层（dialog-omni-studio.tsx），避免 store.ts ↔ spec-discovery.ts 循环依赖

安装 spec 时：
1. 安装完成后，调用 checkMissingDependencies(specSlug)
2. 如有未安装的依赖：
   - 自动调用 Store.install() 逐个安装缺失的外部依赖
   - 行内提示 "已安装，已自动安装 X 个依赖"
3. 不自动启用（遵循 T23 安装后默认禁用原则）

启用 spec 时：
1. 调用 checkMissingDependencies(specSlug) 检查未安装依赖
   - 如有缺失 → 自动安装
2. 调用 checkDisabledDependencies(specSlug) 检查已安装但未启用的依赖
   - 如有未启用 → 自动调用 setEnabled(..., true) 启用
3. 所有依赖就绪后，启用 spec 本身

禁用/卸载其他扩展时：
1. 调用 findDependentSpecs(depType, depSlug) 查找依赖当前扩展的已启用 spec
2. 如有依赖者：
   - 先自动禁用这些已启用 spec（级联禁用）
   - 再执行用户请求的操作（禁用/卸载当前扩展）
   - 行内提示 "已禁用 X 个依赖此扩展的 spec"
3. 移除 DialogConfirm 弹窗确认（避免 dialog.replace() 触发 onClose 导致焦点回到聊天界面）
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

### 5.12 Plugin 热重载机制

```
背景：
- Omni Studio 扩展更新后，plugin 代码需要重新加载，但 Bun 的 ESM 缓存导致旧代码仍然生效
- Bun issue #21346：对 file:// URL 动态 import 时，即使 query string 变化也不会触发重新加载

初始方案（已废弃）：
- 在 plugin/loader.ts 的 load() 中给所有 plugin（file 和 npm source）统一添加 ?invalidate=${Date.now()}
- 实际测试证明对 file:// URL 无效，Omni Studio 扩展更新后 plugin 版本号仍为旧版本

最终方案：
- POSIX 系统（Linux/macOS/WSL2）：将 file:// URL 转换为绝对路径 + ?invalidate=... 再 import
  - 例：file:///home/lyl/.omni_studio/plugins/session-memory-plugin/plugin.ts
    → /home/lyl/.omni_studio/plugins/session-memory-plugin/plugin.ts?invalidate=123456
  - Bun 将绝对路径视为不同的模块 specifier，从而绕过 ESM 缓存
- Windows 系统：暂时保持 file:// URL 格式（绝对路径 + query string 在 Windows 上会报错）
  - 等待 Bun 官方修复 issue #21346
- 调试日志：在 plugin/index.ts 中记录 fs.watchFile 的注册、触发、完成状态
  - 在 plugin/loader.ts 中记录 import 路径转换（original → transformed）和加载结果

触发链路：
1. Omni Studio 扩展更新 → store.ts 写入 state.json
2. plugin/index.ts 的 fs.watchFile 检测到 state.json mtime 变化
3. 调用 InstanceState.invalidateAll(state) 清除 ScopedCache
4. 下次 Plugin.trigger / Plugin.list / Plugin.init 调用时，InstanceState.get 重新执行 init
5. init 中 PluginLoader.loadExternal 重新 resolve + load 所有 plugin
6. load() 中 cacheBustEntry() 转换路径，import() 加载新代码
7. 新 plugin hooks 注册到 state.hooks，后续事件触发执行新逻辑
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
3. Bun.build() 编译时自动将 rg 嵌入到 Omni Studio CLI 二进制内部的 bunfs
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

## 7. Token 自动刷新机制

### 7.1 背景

accessToken 有有效期，过期后所有认证请求返回 401。如果每次 401 都让用户重新登录，体验很差。

### 7.2 方案

在 `market.ts` 中引入 `fetchWithRefresh` 包装器：

```
1. 执行认证请求（携带当前 access_token）
2. 如果请求失败且错误包含 401/Unauthorized：
   a. 调用 auth.refreshToken()（POST /api/auth/auth/refresh-token）
   b. 使用新的 access_token 重新获取请求头
   c. 重试原请求（仅重试一次，避免无限循环）
3. 如果刷新也失败（refresh_token 过期），返回刷新错误，提示用户重新登录
4. 非 401 错误直接透传，不重试
```

**Auth API**：
```ts
async function refreshToken(): Promise<OmniStudioConfig>
// 调用 POST /api/auth/auth/refresh-token
// Headers: Authorization: Bearer {access_token}, Content-Type: application/json
// Body: { "accessToken": "..." }
// 成功后更新本地配置中的 access_token 和 refresh_token，保留 api_base 和用户信息
```

**受保护的接口**：
- `listPaged`（列表查询）
- `getMeta`（扩展详情）
- `download` 中的获取预签名下载 URL 步骤

**不受保护的接口**：
- 预签名 URL 的文件下载（不携带认证头）

## 8. 风险与假设

- **假设**：Omni Studio API 返回的扩展包为 zip 格式。如为其他格式需调整解压逻辑。
- **假设**：Bun compile 的 `with { type: "file" }` 导入在目标平台（linux-x64 / darwin-arm64 / win32-x64 等）上均正常工作。
- **假设**：`refresh-token` 接口在 access_token 过期后仍可调用（使用 refresh_token 验证）。
- **风险**：Token 明文存储于本地。缓减措施：设置严格的文件权限（0o600）。
- **风险**：网络不稳定导致下载中断。缓减措施：支持断点续传或重新下载。
- **风险**：扩展与本地现有扩展冲突。缓减措施：安装前检查 slug 和 type 是否已存在。
- **风险**：生命周期脚本执行失败导致扩展处于半安装/半启用状态。缓减措施：
  - install/start 失败时回滚状态变更
  - stop/uninstall 失败时继续操作但输出警告
  - 所有脚本超时时间为 5 分钟，超时时强制终止
- **风险**：activate 脚本未正确设置环境变量导致后续脚本失败。缓减措施：在合并命令中导出环境变量，或在同一会话中顺序执行。
- **风险**：Bun ESM 缓存导致 plugin 热重载在 Windows 上无法生效。缓减措施：POSIX 系统已使用绝对路径 + query string 绕过缓存；Windows 暂保持 file:// URL 格式，等待 Bun 修复 issue #21346。如 Windows 需紧急支持，可降级为临时目录复制方案（将 plugin 目录复制到 %TEMP% 后 import）。

## 9. 品牌统一设计（F15）

### 9.1 CLI 命令名

- **主命令**：`opencode` → `omni`
- **扩展市场子命令**：`omni extension <subcmd>`（原规划中 `opencode omni-studio <subcmd>`）
- **示例**：`omni extension login`、`omni extension list`、`omni extension install skill math-tool`

### 9.2 配置文件与路径

| 旧路径/文件名 | 新路径/文件名 | 说明 |
|---|---|---|
| `opencode.json` / `opencode.jsonc` | `omni.json` / `omni.jsonc` | 项目级配置文件 |
| `.opencode/` | `.omni/` | 项目级配置目录 |
| `~/.config/opencode/` | `~/.config/omni/` | XDG 全局配置目录 |
| `~/.cache/opencode/` | `~/.cache/omni/` | 缓存目录（含 rg 解压路径） |
| `packages/core/src/global.ts` 中 `const app = "opencode"` | `const app = "omni"` | 决定 XDG 目录根名 |

**迁移策略**：首次启动时检测旧路径是否存在，存在则自动复制到新路径并提示用户。

### 9.3 桌面端应用名

| 位置 | 旧值 | 新值 |
|---|---|---|
| `APP_NAMES.prod` | `"OpenCode"` | `"Omni Studio"` |
| `APP_NAMES.beta` | `"OpenCode Beta"` | `"Omni Studio Beta"` |
| `APP_NAMES.dev` | `"OpenCode Dev"` | `"Omni Studio Dev"` |
| 菜单项 | `"OpenCode Documentation"` | `"Omni Studio Documentation"` |
| `package.json` author | `"OpenCode"` | `"Omni Studio"` |
| i18n 文本（15 个语言文件） | 所有 `"OpenCode"` | `"Omni Studio"` |

### 9.4 TUI 标题与提示

- `attention.ts` 中 `DEFAULT_TITLE = "opencode"` → `"omni"`
- `tips-view.tsx` 中所有产品名引用（`opencode run`、`opencode serve`、`.opencode/` 等）→ `omni run`、`omni serve`、`.omni/`
- 注意保留命令本身的语法正确性（如 `{highlight}omni run{/highlight}`）

### 9.5 构建产物名

| 旧产物名 | 新产物名 |
|---|---|
| `opencode-desktop-${os}-${arch}.${ext}` | `omni-desktop-${os}-${arch}.${ext}` |
| `opencode-darwin-arm64` / `x64` 等 | `omni-darwin-arm64` / `x64` 等 |
| `opencode`（单文件 CLI） | `omni`（单文件 CLI） |

### 9.6 VS Code 扩展

- `sdks/vscode/package.json` 中 `name`、`displayName`、`description` 从 `opencode` 改为 `omni`
- Marketplace 发布时需同步更新扩展 ID

## 10. 新 TUI 默认主题设计（F16）

### 10.1 设计目标

为 Omni Studio 品牌打造一套专属视觉主题，替换现有的 `opencode.json` 默认主题，成为 TUI 终端界面的默认外观。

### 10.2 主题文件

- **文件名**：`packages/opencode/src/cli/cmd/tui/context/theme/omni.json`
- **默认激活名**：`theme.tsx` 中 `createStore` 的 `active: "omni"`
- **双模式支持**：完整的 dark / light 双模式（参考 `opencode.json` 的 `defs` + `theme` 结构）

### 10.3 色彩方案（草案）

以 Omni Studio 品牌色为基调（假设品牌主色为深蓝/青色系）：

| 色彩角色 | Dark 模式 | Light 模式 | 用途 |
|---|---|---|---|
| primary | `#00d4ff` | `#0077cc` | 主按钮、选中高亮 |
| secondary | `#7b61ff` | `#5a3fd6` | 次要操作、标签 |
| accent | `#00ffc8` | `#00aa88` | 强调文字、链接 |
| success | `#00ff88` | `#00aa55` | 成功状态 |
| error | `#ff5577` | `#cc2244` | 错误状态 |
| warning | `#ffaa33` | `#cc8800` | 警告状态 |
| text | `#f0f0f0` | `#1a1a1a` | 正文 |
| textMuted | `#8899aa` | `#667788` | 次要文本 |
| background | `#0a0f1a` | `#ffffff` | 背景（深色用近黑蓝） |
| backgroundPanel | `#111827` | `#f8f9fa` | 面板背景 |
| backgroundElement | `#1a2332` | `#f0f2f5` | 元素背景 |

### 10.4 完整键映射

参照 `opencode.json` 的完整结构，定义 46 个颜色键 + `thinkingOpacity`：
- 核心：`primary`、`secondary`、`accent`
- 状态：`error`、`warning`、`success`、`info`
- 文本：`text`、`textMuted`
- 背景：`background`、`backgroundPanel`、`backgroundElement`、`backgroundMenu`
- 边框：`border`、`borderActive`、`borderSubtle`
- Diff 系列（12 键）
- Markdown 系列（15 键）
- 语法高亮（9 键）

## 11. 桌面端集成设计（F17）

### 11.1 功能范围

在 Electron 桌面端应用中新增 Omni Studio Extension 管理入口，功能与 TUI 基本一致：

- **市场浏览**：展示远程扩展列表，支持 skill/tool/plugin/agent/spec 类型切换和搜索
- **安装/更新**：点击安装按钮，展示下载进度，安装后自动启用
- **本地管理**：展示已安装扩展，支持启用/禁用/卸载
- **Spec 触发**：展示已启用的 spec 列表，点击触发
- **登录/登出/配置**：输入 api_base、username、password 完成认证

### 11.2 UI 入口

在桌面端主窗口侧边栏或顶部工具栏添加 **"Extensions"** 按钮/图标：

```
┌──────────────────────────────────────┐
│  💬 Chat    📝 Notes    🧩 Extensions │  ← 顶部 Tab 栏新增 Extensions
├──────────────────────────────────────┤
│                                      │
│  [Extension Manager View]            │
│  ┌────────────────────────────────┐  │
│  │ [skill] [tool] [plugin] [spec] │  │  ← 类型切换 Tab
│  │ Search: [________]             │  │  ← 搜索框
│  │                                │  │
│  │ math-tool@v1.0.0        [安装] │  │  ← 扩展列表行
│  │ code-reviewer@draft     [安装] │  │
│  │ session-memory@1.0.1  [已安装] │  │
│  │                                │  │
│  │ 第 1/3 页  ◀  ▶               │  │
│  └────────────────────────────────┘  │
│                                      │
└──────────────────────────────────────┘
```

### 11.3 技术方案

- **UI 框架**：复用桌面端现有的 React/Solid 组件体系（根据桌面端实际框架）
- **数据层**：复用 `OmniStudioMarket`、`OmniStudioStore`、`OmniStudioAuth` 三个 Effect Service（通过桌面端的 IPC 桥接调用 CLI 核心逻辑）
- **窗口模式**：
  - 方案 A：在主窗口内以 Tab/Route 形式嵌入（推荐，与现有桌面端集成度高）
  - 方案 B：点击后打开独立子窗口（类似设置窗口）
- **状态同步**：扩展启用/禁用后，通过 IPC 通知主进程刷新 skill/config/tool 扫描

### 11.4 与 TUI 的复用关系

| 层级 | 复用方式 |
|---|---|
| Effect Service（auth/market/store） | ✅ 完全复用，通过 `Effect.provide(defaultLayer)` |
| 类型定义（types.ts） | ✅ 完全复用 |
| UI 组件（DialogSelect、行内按钮等） | ❌ 需重写为桌面端组件（React/Solid/HTML） |
| 主题/配色 | ✅ 复用新主题 `omni.json` 的颜色定义 |

### 11.5 品牌一致性

桌面端集成需同步应用 F15 品牌修改：
- 窗口标题、菜单项显示 "Omni Studio"
- 应用图标、Dock 标签使用新品牌名
- 错误报告链接、文档链接指向新域名（如有）
