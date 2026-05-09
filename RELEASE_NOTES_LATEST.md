# OpenCode 最近一个月版本更新摘要

> 时间范围：2026-04-19 ~ 2026-04-27
> 分支：`dev`
> 版本跨度：v1.14.18 → v1.14.27

---

## v1.14.27 (2026-04-27)

### 核心功能
- **HTTP API 桥接**：新增 TUI 路由桥接 (`/tui/*`)、PTY 路由桥接 (`/pty/*`) 和事件流桥接 (`/event`)
- **可配置 Shell 选择**：支持在桌面端设置中选择默认 Shell
- **Installation 服务重构**：将分散的 `methodImpl`/`latestImpl`/`upgradeImpl` 合并为统一的 `result` 对象，简化服务实现

### 体验优化
- **TUI 启动优化**：隐藏 onboarding 完成前的 provider 检查，减少启动干扰
- **Toast 时长修复**：恢复默认 toast 显示时长行为
- **调试日志清理**：移除 workspace 创建流程中的冗余调试日志

### 工程维护
- 升级 `opentui` 至 `0.1.105`
- 更新 Nix `node_modules` hashes

---

## v1.14.26 (2026-04-25 ~ 04-26)

### 核心功能
- **HTTP API 大规模桥接**：这是本版本的重头戏，桥接了以下接口：
  - Session 全生命周期（读取、变更、消息增删改查）
  - Sync 路由
  - Workspace 增删改查
  - MCP OAuth / 控制端点
  - Experimental 工具路由 / Session 列表
  - Instance 读取 / 处置
  - Worktree 增删改查
  - Project 更新 / Git 初始化
  - Config 更新
- **Go 模型列表端点**：新增 `/go/models` 接口用于查询可用模型

### 架构迁移
- **`shared` → `core` 包重构**：
  - 将 `cross-spawn-spawner` 从 `opencode` 迁移至 `core`
  - 将 `Global` 模块迁移至 `@opencode-ai/core`
  - 将 `npm` 服务迁移至 `core` 包
  - 完成 `shared` 包到 `core` 包的重命名
- **懒加载运行时移除**：清理冗余的 `lazy cross-spawn runtime`

### 修复
- **Editor 锁定文件**：拒绝与当前工作目录不匹配的 workspace lock 文件
- **OpenRouter SDK**：升级版本修复 DeepSeek reasoning 问题
- **Plugin 依赖安装超时**：测试优化避免超时

---

## v1.14.25 (2026-04-24)

### 核心功能
- **权限配置增强**：`ConfigPermission` schema 现在为所有工具权限键提供完整的 IntelliSense 补全
- **Roslyn 支持**：新增 Razor 和 C# 脚本的语言服务器支持
- **GPT-5.5 支持**：模型配置与 Zen 页面更新
- **工具输出截断配置**：允许在 `tool_output` 中自定义 `max_lines` 和 `max_bytes`

### 修复
- **Shell CWD**：修复登录启动后 Shell 工作目录错误的问题
- **Beta 验证**：推送前增加 beta 版本校验
- **Git amend 条件**：修正 amend 需要确认 commit 已落地的条件判断
- **GPT-5.5 压缩**：修复 OpenAI OAuth 模式下 GPT-5.5 上下文压缩阈值

### 工程维护
- 更新 Nix hashes
- 将 `opentui` 依赖集中管理到 workspace catalog

---

## v1.14.24 (2026-04-23 ~ 04-24)

### 模型支持
- **DeepSeek V4 Pro**：Zen 页面新增 DeepSeek V4 Pro 支持
- **OpenTUI 主题检测**：TUI 初始模式使用 OpenTUI 主题检测

### 修复
- **DeepSeek Reasoning**：确保 assistant 消息始终携带 reasoning 字段
- **Interleaved 字段**：使用 `existingModel` 作为 interleaved 的 fallback

### HTTP API
- 桥接 MCP Status 端点 (`/mcp/status`)

---

## v1.14.23 (2026-04-22 ~ 04-23)

### 核心功能
- **Shell 模式 UI**：Prompt 输入新增 Shell 模式，支持取消按钮、自定义图标和示例占位符
- **文件读取桥接**：HTTP API 新增文件读取端点 (`/file/*`)
- **Workspace 读取桥接**：HTTP API 新增 Workspace 读取端点

### 架构迁移（Effect Schema 大规模迁移）
- **Tool 框架**：所有 18 个内置工具的 schema 迁移至 Effect Schema
- **Bus 事件**：`BusEvent` 迁移至 Effect Schema
- **Sync**：Session 事件 schema-first 化
- **Provider**：Provider 领域模型迁移至 Effect Schema
- **Control Plane**：Workspace DTO schemas 迁移
- **Schema 基础**：统一使用 `Schema.Int`，合并 `PositiveInt`/`NonNegativeInt`

### 修复
- **DeepSeek 变体**：修复 DeepSeek 模型变体识别
- **NPM 版本查询**：尊重 `.npmrc` 配置进行版本查找
- **模型变体选择器**：条件性显示模型变体选择器

---

## v1.14.22 (2026-04-21 ~ 04-22)

### 核心功能
- **Project 图标覆盖**：新增 `icon_url_override` 字段支持自定义项目图标
- **Session Schema 迁移**：Session 领域模型迁移至 Effect Schema

### 修复
- **NPM 配置**：尊重 `.npmrc` 配置
- **TUI 消息渲染**：渲染用户消息的所有非合成文本部分
- **Desktop 更新**：避免未安装更新时反复重启

### 工程维护
- 新增 `TEAM_MEMBERS` 成员
- CI 平台特定的 `bun install` 标志

---

## v1.14.21 (2026-04-20 ~ 04-21)

### 核心功能
- **LSP Pull Diagnostics**：支持 C#、Kotlin 等语言的 Pull Diagnostics
- **Roslyn Language Server**：用 `roslyn-language-server` 替换 `csharp-ls`
- **Mistral Small Reasoning**：新增 Mistral Small reasoning 变体支持
- **MiMo V2.5 / Kimi K2.6**：Go/Zen 页面更新模型信息

### 架构迁移（MessageV2 / Config Effect Schema）
- **MessageV2 全面迁移**：
  - 错误体系迁移至 Schema-backed named errors
  - 内部 `Cursor` 迁移至 Effect Schema
  - DTOs（User/Assistant/Part/Info/WithParts）迁移
  - Part leaves 和 ToolPart 迁移
  - Tool state schemas 迁移
- **Config 迁移**：`Config.Info` 和 `ConfigPermission.Info` 迁移至 Effect Schema
- **Snapshot / LSP**：Snapshot 和 LSP 数据 schemas 迁移至 Effect Schema
- **Provider Schema**：通过 `effect-zod` walker 统一推导 `.zod`

### 修复
- **Session Compaction**：改进 session 压缩逻辑
- **BOM 保留**：修复文本工具往返时 BOM 丢失问题
- **Windows CI**：修复 `cross-spawn` stderr 竞态条件
- **Project Avatar**：统一头像来源逻辑，支持 `icon.url` fallback
- **TUI 启动**：无效 session 启动时快速失败

---

## v1.14.20 (2026-04-19 ~ 04-20)

### 核心功能
- **Config HTTP API**：实验性 HttpApi 桥接 `GET /config`
- **Debug Workspace Server**：新增调试 workspace 服务器
- **TPM 路由**：Zen 模型路由基于 TPM（每分钟 Token）智能分发
- **Kimi K2.6 / M2.7**：模型页面更新

### 桌面端修复
- **Prompt Input 动画**：防止每次渲染时重新运行动画
- **进度条设置**：支持在设置中禁用进度条
- **Electron 安全**：启用 `contextIsolation` 和 `sandbox`
- **CORS**：为 Electron 主窗口添加 CORS 头
- **DialogSelectServer**：调整布局属性

### 修复
- **Remote Workspace**：修复远程 workspace 的权限路由
- **Windows 动态导入**：使用 `file://` URLs 避免 Node+Windows 问题
- **Project 缓存**：bare repo 使用 git common dir 缓存
- **Diff 渲染**：修正 diff 渲染条件逻辑

---

## v1.14.19 (2026-04-19)

### 核心功能
- **Session Compaction 改进**：
  - 重命名 `tail_tokens` → `preserve_recent_tokens`
  - 保留最近 turns 的媒体内容
  - 预算保留 tail 的媒体资源
  - 翻转 toolcall prune 默认值
- **终端字体设置**：内置 Nerd Font 支持，可配置终端字体
- **TUI 主题持久化**：稳定 TUI 主题持久化和 KV 写入

### 修复
- **循环依赖**：延迟 `MessageV2.Assistant.shape` 访问以打破编译二进制中的循环依赖
- **Windows 安装**：修复 Windows managed install，ripgrep 升级至 15.1.0 支持 ARM64
- **并行编辑**：修复并行编辑互相覆盖的问题
- **NVIDIA Provider**：新增 NVIDIA 到热门 provider 列表

---

## v1.14.18 (2026-04-19)

### 修复
- **Beta 发布**：移除 `--target` 标志避免 beta release 创建错误
- **Electron 迁移**：启动 sidecar 前运行 JSON 迁移
- **Ripgrep**：恢复原生 `rg` 后端
- **Electron Store**：懒加载修复不正确的 config 目录问题
- **免费下载按钮**：文案改为 "Download"

### 文档
- 新增 `--dangerously-skip-permissions` CLI 标志文档

---

## 总结趋势

最近一个月（v1.14.18 → v1.14.27）的主要发展方向：

1. **HTTP API 桥接**：这是近两个版本的重点，大量内部路由被桥接到 HTTP API，为外部集成做准备
2. **Effect Schema 全面迁移**：从 v1.14.21 开始的大规模迁移，涉及 MessageV2、Config、Tool、Bus、Sync、Provider 等核心模块
3. **架构重构**：`shared` 包合并到 `core` 包，Installation 服务重构为统一 result 对象
4. **模型支持**：快速跟进新模型（DeepSeek V4 Pro、GPT-5.5、Kimi K2.6、MiMo V2.5、Mistral Small Reasoning）
5. **桌面端稳定**：Electron 安全加固、CORS、主题持久化、动画优化
