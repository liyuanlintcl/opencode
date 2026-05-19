# Omni Studio Marketplace (CLI) — 需求分析

## 1. 背景与目标

为 OpenCode CLI 提供 Omni Studio 扩展市场能力，使用户能够通过命令行浏览、安装、管理来自 Omni Studio Marketplace 的扩展（skill / tool / plugin / agent / spec）。
其中 spec 为组合规格类型，通过 `SPEC.md` 声明依赖的外部/内部扩展集合，支持一键触发执行。

## 2. 用户故事

- 作为用户，我希望通过 CLI 登录 Omni Studio，以便访问我的扩展市场账户。
- 作为用户，我希望列出市场上可用的扩展，以便发现需要的功能。
- 作为用户，我希望安装特定扩展到本地，以便在项目中使用。
- 作为用户，我希望启用/禁用已安装的扩展，以便灵活控制功能加载。
- 作为用户，我希望查看本地扩展的安装状态和登录信息，以便了解当前环境。
- 作为用户，我希望在 TUI 中启用/禁用扩展后，主界面实时加载/卸载对应功能，无需重启。
- 作为用户，我希望手动删除扩展目录后，系统自动清理 state.json 中的残留记录，避免加载不存在的扩展。
- 作为用户，我希望安装 spec 类型扩展后，系统自动发现并加载其内部包含的 skill / tool / plugin / agent，无需逐个手动安装。
- 作为用户，我希望在 TUI 中手动触发已安装的 spec，以便执行其定义的组合任务流水线。

## 3. 功能需求

| ID | 需求 | 优先级 |
|---|---|---|
| F1 | 登录：`opencode omni-studio login`，仅输入用户名和密码；认证地址和 API 地址通过 `setup` 预先配置 | P0 |
| F1a | 服务地址配置：`opencode omni-studio setup`，设置 api_base | P0 |
| F2 | 登出：`opencode omni-studio logout` | P0 |
| F3 | 交互式列出市场扩展：`opencode omni-studio list [type]`，显示本地安装状态并支持选中直接安装 | P0 |
| F4 | 安装扩展：`opencode omni-studio install <type> <slug> [version]` | P0 |
| F4a | 更新检测：TUI 市场列表自动比对本地版本与远程版本，版本不一致时展示 `[更新]` 按钮 | P0 |
| F4b | 下载进度显示：扩展包下载时展示实时进度百分比 | P1 |
| F5 | 卸载扩展：`opencode omni-studio uninstall <type> <slug>` | P0 |
| F6 | 启用扩展：`opencode omni-studio enable <type> <slug>` | P0 |
| F7 | 禁用扩展：`opencode omni-studio disable <type> <slug>` | P0 |
| F8 | 交互式查看本地扩展状态：`opencode omni-studio status`，支持选中扩展进行启用/禁用/卸载操作 | P0 |
| F9 | TUI slash 命令：`/omni-studio` 在终端界面中显示 Omni Studio 管理菜单，支持 status / local / list / login / logout | P0 |
| F10 | 实时同步：扩展启用/禁用后，skill / config / tool 模块实时刷新，TUI 主界面即时生效 | P0 |
| F11 | 自动清理：扩展目录被手动删除后，自动从 state.json 中移除对应记录 | P1 |
| F12 | Token 自动刷新：accessToken 过期时自动调用 refresh-token 接口，更新本地 token 并重试原请求 | P1 |
| F13 | Spec 扩展支持：安装 spec 类型扩展后，自动扫描已启用的 spec，将其 SPEC.md **正文**（去掉 YAML frontmatter）作为 instructions 注入系统提示；自动拼接内嵌扩展（skills/tools/agents/plugins）的说明文件内容；skill/tool/agent/plugin 扫描自动覆盖 `specs/{slug}/` 子目录 | P0 |
| F14 | Spec 触发：TUI 中提供手动触发 spec 的入口，执行其 SPEC.md 定义的组合流水线 | P0 |

## 4. 非功能需求

- **兼容性**：扩展文件遵循与本地 skill/tool/plugin/agent 相同的目录结构。
- **安全性**：Token 明文存储于用户主目录，文件权限应限制为仅所有者可读写。
- **离线可用**：禁用/启用操作不依赖网络。
- **实时性**：state.json 变更后 1 秒内触发 skill / config / tool 刷新。
- **错误处理**：网络失败、认证过期、扩展不存在时给出清晰错误信息。

## 5. 边界与范围

**包含**：
- CLI 命令实现
- 配置文件读写
- HTTP API 调用（登录、列表、下载）
- 本地扩展目录管理
- 实时同步机制（fs.watch）
- 扩展删除自动清理
- CLI 构建与分发：ripgrep 二进制嵌入编译产物，实现单文件可执行程序分发

**不包含**：
- Marketplace 后端服务开发
- 扩展的运行时加载逻辑（由现有框架处理）
- 图形界面

## 6. 验收标准

- [x] 所有 9 个 CLI 命令可正常执行并返回预期结果（含 setup）
- [x] 登录成功后 `~/.omni_studio/omni-studio.json` 包含有效 token
- [x] 安装扩展后文件存在于 `~/.omni_studio/{type}/{slug}/`
- [x] 启用/禁用状态持久化到 `~/.omni_studio/state.json`
- [x] `status` 命令同时显示登录状态和本地扩展列表
- [x] 安装时如扩展包含 `install.sh`/`install.bat`/`install.ps1`，脚本被正确执行
- [x] 卸载时如扩展包含 `uninstall` 脚本，脚本被正确执行后再删除文件
- [x] 启用/禁用时如扩展包含 `start`/`stop` 脚本，脚本被正确执行
- [x] 执行任何生命周期脚本前，如存在 `activate` 脚本，先 source/调用 activate
- [x] TUI 中启用/禁用扩展后，主界面实时刷新，无需重启
- [x] 手动删除扩展目录后，state.json 自动清理对应记录
- [x] 安装 spec 扩展后，系统自动发现其内部 skill / tool / plugin / agent 并正确加载（通过修改各扩展类型的扫描路径实现：skill→`specs/*/skills/`、tool→`specs/*/tools/`、agent→`specs/*/agents/`、plugin→`specs/*/plugins/`）
- [x] TUI 中可手动触发已安装的 spec 扩展（F14）
- [x] Omni Studio 扩展更新后，已加载的 plugin 代码自动热重载，无需重启 opencode（POSIX 系统通过绝对路径 + query string 绕过 Bun ESM 缓存；WSL2 已验证通过）
- [x] Plugin 热重载过程包含完整调试日志，便于定位问题（state.json watchFile 触发、InstanceState invalidate、import 路径转换、加载结果）
