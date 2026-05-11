# Omni Studio Marketplace (CLI) — 需求分析

## 1. 背景与目标

为 OpenCode CLI 提供 Omni Studio 扩展市场能力，使用户能够通过命令行浏览、安装、管理来自 Omni Studio Marketplace 的扩展（skill / tool / plugin / agent）。

## 2. 用户故事

- 作为用户，我希望通过 CLI 登录 Omni Studio，以便访问我的扩展市场账户。
- 作为用户，我希望列出市场上可用的扩展，以便发现需要的功能。
- 作为用户，我希望安装特定扩展到本地，以便在项目中使用。
- 作为用户，我希望启用/禁用已安装的扩展，以便灵活控制功能加载。
- 作为用户，我希望查看本地扩展的安装状态和登录信息，以便了解当前环境。

## 3. 功能需求

| ID | 需求 | 优先级 |
|---|---|---|
| F1 | 登录：`opencode omni-studio login`，仅输入用户名和密码；认证地址和 API 地址通过 `setup` 预先配置 | P0 |
| F1a | 服务地址配置：`opencode omni-studio setup`，独立设置 auth_base 和 api_base | P0 |
| F2 | 登出：`opencode omni-studio logout` | P0 |
| F3 | 交互式列出市场扩展：`opencode omni-studio list [type]`，显示本地安装状态并支持选中直接安装 | P0 |
| F4 | 安装扩展：`opencode omni-studio install <type> <slug> [version]` | P0 |
| F5 | 卸载扩展：`opencode omni-studio uninstall <type> <slug>` | P0 |
| F6 | 启用扩展：`opencode omni-studio enable <type> <slug>` | P0 |
| F7 | 禁用扩展：`opencode omni-studio disable <type> <slug>` | P0 |
| F8 | 交互式查看本地扩展状态：`opencode omni-studio status`，支持选中扩展进行启用/禁用/卸载操作 | P0 |
| F9 | TUI slash 命令：`/omni-studio` 在终端界面中显示 Omni Studio 管理菜单，支持 status / list / login / logout | P0 |

## 4. 非功能需求

- **兼容性**：扩展文件遵循与本地 skill/tool/plugin/agent 相同的目录结构。
- **安全性**：Token 明文存储于用户主目录，文件权限应限制为仅所有者可读写。
- **离线可用**：禁用/启用操作不依赖网络。
- **错误处理**：网络失败、认证过期、扩展不存在时给出清晰错误信息。

## 5. 边界与范围

**包含**：
- CLI 命令实现
- 配置文件读写
- HTTP API 调用（登录、列表、下载）
- 本地扩展目录管理

**不包含**：
- Marketplace 后端服务开发
- 扩展的运行时加载逻辑（由现有框架处理）
- 图形界面

## 6. 验收标准

- [ ] 所有 9 个 CLI 命令可正常执行并返回预期结果（含 setup）
- [ ] 登录成功后 `~/.omni_studio/omni-studio.json` 包含有效 token
- [ ] 安装扩展后文件存在于 `~/.omni_studio/{type}/{slug}/`
- [ ] 启用/禁用状态持久化到 `~/.omni_studio/state.json`
- [ ] `status` 命令同时显示登录状态和本地扩展列表
- [ ] 安装时如扩展包含 `install.sh`/`install.bat`/`install.ps1`，脚本被正确执行
- [ ] 卸载时如扩展包含 `uninstall` 脚本，脚本被正确执行后再删除文件
- [ ] 启用/禁用时如扩展包含 `start`/`stop` 脚本，脚本被正确执行
- [ ] 执行任何生命周期脚本前，如存在 `activate` 脚本，先 source/调用 activate
- [ ] 脚本执行失败时给出清晰错误信息，install/start 失败回滚状态
- [ ] TUI 模式下输入 `/omni-studio` 显示 Omni Studio 管理菜单（status / list / install / uninstall / enable / disable / login / logout / setup）
