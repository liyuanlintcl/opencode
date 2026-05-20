# Omni Studio Extension — 需求分析

## 1. 背景与目标

为 Omni Studio TUI 提供扩展市场能力，使用户能够在终端界面中浏览、安装、管理来自 Omni Studio Marketplace 的扩展（skill / tool / plugin / agent / spec）。
其中 spec 为组合规格类型，通过 `SPEC.md` 声明依赖的外部/内部扩展集合，支持一键触发执行。

## 2. 用户故事

- 作为用户，我希望通过 TUI 登录 Omni Studio，以便访问我的扩展市场账户。
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
| F1 | 登录：TUI 中输入用户名和密码完成认证；认证地址和 API 地址通过 `setup` 预先配置 | P0 |
| F1a | 服务地址配置：TUI 中输入 api_base 并保存 | P0 |
| F2 | 登出：TUI 中调用登出并清除本地 token | P0 |
| F3 | 交互式列出市场扩展：TUI 中展示远程扩展列表，显示本地安装状态并支持选中直接安装 | P0 |
| F4 | 安装扩展：TUI 中选择扩展并安装，`version` 参数支持指定版本号，缺省时安装最新版；安装成功后自动启用扩展，启用失败时行内提示 | P0 |
| F4a | 更新检测：TUI 市场列表自动比对本地版本与远程版本，版本不一致时展示 `[更新]` 按钮 | P0 |
| F4b | 下载进度显示：扩展包下载时展示实时进度百分比 | P1 |
| F5 | 卸载扩展：TUI 中选择已安装扩展并卸载 | P0 |
| F6 | 启用扩展：TUI 中选择已禁用扩展并启用 | P0 |
| F7 | 禁用扩展：TUI 中选择已启用扩展并禁用 | P0 |
| F8 | 交互式查看本地扩展状态：TUI 中展示本地已安装扩展列表，支持选中进行启用/禁用/卸载操作 | P0 |
| F9 | TUI slash 命令：`/omni-extensions`（别名 `/ext`）在终端界面中显示 Omni Extensions 管理菜单，支持 status / local / list / spec / login / logout / setup | P0 |
| F10 | 实时同步：扩展启用/禁用后，skill / config / tool 模块实时刷新，TUI 主界面即时生效 | P0 |
| F11 | 自动清理：扩展目录被手动删除后，自动从 state.json 中移除对应记录 | P1 |
| F12 | Token 自动刷新：accessToken 过期时自动调用 refresh-token 接口，更新本地 token 并重试原请求 | P1 |
| F13 | Spec 扩展支持：安装 spec 类型扩展后，自动扫描已启用的 spec，将其 SPEC.md **正文**（去掉 YAML frontmatter）作为 instructions 注入系统提示；自动拼接内嵌扩展（skills/tools/agents/plugins）的说明文件内容；skill/tool/agent/plugin 扫描自动覆盖 `specs/{slug}/` 子目录 | P0 |
| F14 | Spec 触发：TUI 中提供手动触发 spec 的入口，执行其 SPEC.md 定义的组合流水线 | P0 |
| F15 | **品牌统一**：将用户可见的产品品牌从 `OpenCode` / `opencode` 全面替换为 `Omni Studio` / `omni`。优先项：CLI 命令名（`opencode` → `omni`）、配置文件名/路径（`opencode.json` → `omni.json`、`.opencode/` → `.omni/`、`~/.config/opencode/` → `~/.config/omni/`）、桌面端应用名（窗口标题、菜单、i18n）、TUI 标题（`DEFAULT_TITLE`）、构建产物名（`opencode-desktop-*` → `omni-desktop-*`）、TUI 提示语、VS Code 扩展 ID | P0 |
| F16 | **新 TUI 默认主题**：创建一套全新的 TUI 内置主题（`omni.json`），替换现有默认主题 `opencode.json`，作为 Omni Studio 品牌的视觉识别主题 | P1 |
| F17 | **桌面端集成**：在桌面端应用（Electron）中添加 Omni Studio Extension 入口按钮，打开独立窗口/视图展示扩展管理界面。基本功能与 TUI 一致（浏览市场、安装/卸载/启用/禁用扩展、触发 spec），同时应用品牌修改和新主题 | P1 |
| F18 | **VS Code 插件集成**：在 VS Code 中提供 Omni Studio Extension 管理侧边栏（WebView），支持浏览市场、搜索、安装/卸载/启用/禁用扩展、触发 spec，共用 `~/.omni_studio/` 配置和状态 | P1 |
| F19 | **IDEA 插件集成**：在 IntelliJ IDEA 中提供 Omni Studio Extension 管理 Tool Window，功能与 VS Code 插件一致（浏览市场、搜索、安装/卸载/启用/禁用扩展、触发 spec），共用 `~/.omni_studio/` 配置和状态 | P2 |
| F20 | **Qt 插件集成**：在 Qt Creator 中提供 Omni Studio Extension 管理面板，功能与 VS Code 插件一致（浏览市场、搜索、安装/卸载/启用/禁用扩展、触发 spec），共用 `~/.omni_studio/` 配置和状态 | P2 |

## 4. 非功能需求

- **兼容性**：扩展文件遵循与本地 skill/tool/plugin/agent 相同的目录结构。
- **安全性**：Token 明文存储于用户主目录，文件权限应限制为仅所有者可读写。
- **离线可用**：禁用/启用操作不依赖网络。
- **实时性**：state.json 变更后 1 秒内触发 skill / config / tool 刷新。
- **错误处理**：网络失败、认证过期、扩展不存在时给出清晰错误信息。

## 5. 边界与范围

**包含**：
- TUI 功能实现
- 配置文件读写
- HTTP API 调用（登录、列表、下载）
- 本地扩展目录管理
- 实时同步机制（fs.watch）
- 扩展删除自动清理
- CLI 构建与分发：ripgrep 二进制嵌入编译产物，实现单文件可执行程序分发

**不包含**：
- Marketplace 后端服务开发
- 扩展的运行时加载逻辑（由现有框架处理）
- 除 VS Code / IDEA / Qt 插件和桌面端外的图形界面

## 6. 验收标准

- [x] TUI slash 命令 `/omni-extensions`（别名 `/ext`）可正常打开 Omni Extensions 管理菜单
- [x] 登录成功后 `~/.omni_studio/omni-studio.json` 包含有效 token
- [x] 安装扩展后文件存在于 `~/.omni_studio/{type}/{slug}/`
- [x] 启用/禁用状态持久化到 `~/.omni_studio/state.json`
- [x] TUI 中 Status 视图同时显示登录状态和本地扩展列表
- [x] 安装时如扩展包含 `install.sh`/`install.bat`/`install.ps1`，脚本被正确执行
- [x] 卸载时如扩展包含 `uninstall` 脚本，脚本被正确执行后再删除文件
- [x] 启用/禁用时如扩展包含 `start`/`stop` 脚本，脚本被正确执行
- [x] 执行任何生命周期脚本前，如存在 `activate` 脚本，先 source/调用 activate
- [x] TUI 中启用/禁用扩展后，主界面实时刷新，无需重启
- [x] 手动删除扩展目录后，state.json 自动清理对应记录
- [x] 安装 spec 扩展后，系统自动发现其内部 skill / tool / plugin / agent 并正确加载（通过修改各扩展类型的扫描路径实现：skill→`specs/*/skills/`、tool→`specs/*/tools/`、agent→`specs/*/agents/`、plugin→`specs/*/plugins/`）
- [x] TUI 中可手动触发已安装的 spec 扩展（F14）
- [x] Omni Studio 扩展更新后，已加载的 plugin 代码自动热重载，无需重启 Omni Studio（POSIX 系统通过绝对路径 + query string 绕过 Bun ESM 缓存；WSL2 已验证通过）
- [x] Plugin 热重载过程包含完整调试日志，便于定位问题（state.json watchFile 触发、InstanceState invalidate、import 路径转换、加载结果）
- [x] TUI 中安装扩展时 `version` 参数生效，传入时下载并安装指定版本（F4）
- [x] 安装指定版本后覆盖本地旧版本（旧版本文件删除，不保留多版本共存）
- [x] TUI 安装成功后自动启用扩展，启用失败时行内提示红色错误信息（F4）
- [x] 本地扩展列表显示 `name@version`，市场扩展列表只显示 `name`
- [ ] TUI 安装成功后 1 秒内行内提示自动消失（成功绿色、失败红色）（F4）
- [ ] 品牌统一：用户可见的 `OpenCode` / `opencode` 描述全部替换为 `Omni Studio` / `omni`。CLI 命令名（品牌重命名）、配置文件路径、桌面端应用名、i18n、TUI 标题、构建产物名、TUI 提示语、VS Code 扩展 ID 均已更新（F15）
- [ ] 新 TUI 默认主题 `omni.json` 已创建并设为默认，dark/light 双模式完整定义 46 个颜色键 + thinkingOpacity，通过 `isTheme` 验证（F16）
- [ ] 桌面端应用包含 Extensions 入口按钮，可打开扩展管理视图；支持市场浏览、安装/更新/卸载/启用/禁用、登录/配置、spec 触发；UI 风格与 TUI 一致并应用新主题（F17）
- [ ] VS Code 插件侧边栏可展示扩展市场列表，支持搜索、安装、启用/禁用、卸载和 spec 触发，状态实时同步（F18）
- [ ] IDEA 插件 Tool Window 可展示扩展市场列表，支持搜索、安装、启用/禁用、卸载和 spec 触发，状态实时同步（F19）
- [ ] Qt Creator 插件面板可展示扩展市场列表，支持搜索、安装、启用/禁用、卸载和 spec 触发，状态实时同步（F20）
