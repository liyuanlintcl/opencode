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
| `store.ts` | 本地扩展安装/卸载/状态 | `src/omni-studio/store.ts` |
| `executor.ts` | 扩展生命周期脚本执行（install/start/stop/uninstall/activate） | `src/omni-studio/executor.ts` |
| `config.ts` | 配置文件读写 | `src/omni-studio/config.ts` |
| `types.ts` | 共享类型定义 | `src/omni-studio/types.ts` |

## 3. 数据模型

### 3.1 登录配置 (`~/.omni_studio/omni-studio.json`)

```ts
interface OmniStudioConfig {
  api_base: string
  auth_base: string
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
  | { cmd: "login" }
  | { cmd: "logout" }
  | { cmd: "list"; type?: ExtensionType }          // 交互式：展示远程列表 + 本地安装状态，支持选中安装
  | { cmd: "install"; type: ExtensionType; slug: string; version?: string }
  | { cmd: "uninstall"; type: ExtensionType; slug: string }
  | { cmd: "enable"; type: ExtensionType; slug: string }
  | { cmd: "disable"; type: ExtensionType; slug: string }
  | { cmd: "status" }                               // 交互式：展示本地扩展，支持选中启用/禁用/卸载
```

### 4.2 Auth API

```ts
async function login(credentials: { username: string; password: string }): Promise<AuthResult>
async function logout(): Promise<void>
async function getAuthHeaders(): Promise<Record<string, string>>
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

### 5.1 登录流程

```
1. 检查是否已有登录配置
   - 有 → 提示已登录，询问是否重新登录
   - 无 → 继续
2. 交互式输入 username / password
3. POST ${authBase}/auth/auth/login
4. 保存 token 和用户信息到 omni-studio.json
5. 设置文件权限 0o600
6. 输出登录成功信息
```

### 5.2 安装流程

```
1. 检查是否已登录（读取 omni-studio.json）
2. 调用 Market API 获取扩展元数据
3. 检查本地是否已安装同名扩展
   - 已安装 → 提示是否覆盖/更新
4. 下载扩展压缩包到临时目录
5. 解压到 ~/.omni_studio/{type}/{slug}/
6. 检测扩展目录中的生命周期脚本（detectScripts）
7. 如存在 install 脚本：
   - 先检测是否存在 activate 脚本，有则先 source/调用
   - 执行 install.sh / install.bat / install.ps1（根据 OS）
   - 如脚本返回非 0，回滚已解压文件并输出错误
8. 更新 state.json（enabled: true）
9. 清理临时文件
10. 输出安装成功信息
```

### 5.3 列表交互流程（list）

```
1. 调用 Market API 获取远程扩展列表
2. 调用 Store.getStatus() 获取本地已安装扩展
3. 构建 prompts.select 选项：
   - 每个选项显示：name (v1.0.0) [已安装] / [未安装]
   - 末尾增加「退出」选项
4. 用户选择扩展：
   - 未安装 → confirm("Install {slug}?") → 是则执行 install → 成功/失败提示 → 返回列表
   - 已安装 → log.info("Already installed") → 返回列表
   - 退出 → 结束交互
5. 使用 while 循环支持连续操作
```

### 5.4 状态交互流程（status）

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

### 5.5 卸载流程

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

### 5.6 启用流程（enable）

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

### 5.7 禁用流程（disable）

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

### 5.8 脚本执行规则

```
- Shell 脚本（.sh）：在 Unix 系统通过 /bin/bash 或 /bin/sh 执行
- Batch 脚本（.bat）：在 Windows 通过 cmd.exe /c 执行
- PowerShell 脚本（.ps1）：在 Windows 优先通过 pwsh/powershell 执行
- activate 脚本的特殊性：
  - 如为 .sh，使用 "source activate.sh && <command>" 方式合并执行
  - 如为 .bat/.ps1，先执行 activate 脚本，再执行目标脚本（同进程环境继承）
  - activate 脚本本身不计入错误回滚条件，仅用于环境准备
- 所有脚本执行工作目录设为扩展目录本身（cwd = ~/.omni_studio/{type}/{slug}/）
```

## 6. 技术选型

| 层面 | 选型 | 理由 |
|---|---|---|
| HTTP 客户端 | `fetch` (Bun 内置) | 项目已使用 Bun，无需额外依赖 |
| 配置存储 | JSON 文件 + `Bun.file()` | 符合项目风格，简单可靠 |
| 压缩解压 | `Bun.write()` + `unzip` 或 `fflate` | 扩展包通常为 zip 格式 |
| 脚本执行 | `Bun.spawn()` 或 `$` | Bun 内置进程管理，支持流式输出和退出码捕获 |
| 交互提示 | 现有 CLI 提示库（如有）或 `readline` | 保持与主 CLI 一致的交互风格 |

## 7. 风险与假设

- **假设**：Omni Studio API 返回的扩展包为 zip 格式。如为其他格式需调整解压逻辑。
- **风险**：Token 明文存储于本地。缓减措施：设置严格的文件权限（0o600）。
- **风险**：网络不稳定导致下载中断。缓减措施：支持断点续传或重新下载。
- **风险**：扩展与本地现有扩展冲突。缓减措施：安装前检查 slug 和 type 是否已存在。
- **风险**：生命周期脚本执行失败导致扩展处于半安装/半启用状态。缓减措施：
  - install/start 失败时回滚状态变更
  - stop/uninstall 失败时继续操作但输出警告
  - 所有脚本超时时间为 5 分钟，超时时强制终止
- **风险**：activate 脚本未正确设置环境变量导致后续脚本失败。缓减措施：在合并命令中导出环境变量，或在同一会话中顺序执行。
