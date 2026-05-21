# Omni Studio Marketplace — 实现计划

## 任务拆分

### P0 — 核心实现

| # | 任务 | 验收标准 | 预估 | 状态 |
|---|---|---|---|---|
| T1 | 创建 `src/omni-studio/` 目录及 `types.ts`、`config.ts` | 类型定义完整，配置读写通过单测 | 2h | ✅ |
| T2 | 实现 Auth 模块（login / logout / getAuthHeaders） | 可成功登录并持久化 token，登出后配置清空 | 3h | ✅ |
| T3 | 实现登录交互流程（仅 username / password，地址由 setup 预先配置） | 交互体验与主 TUI 一致；api_base 由 setup 配置 | 2h | ✅ |
| T4 | 实现 Market HTTP 客户端（list / getExtensionMeta / download） | 可正常调用 API 并处理 401/404 错误 | 3h | ✅ |
| T5 | 实现 Store 模块（install / uninstall / enable / disable / status） | 文件正确写入 `~/.omni_studio/`，状态持久化 | 3h | ✅ |
| T6 | 实现 Executor 模块（detectScripts / runScript / activate 处理） | 支持 .sh/.bat/.ps1，activate 先执行，超时处理 | 3h | ✅ |
| T7 | 实现 TUI 命令路由与交互（list/status 为交互式） | TUI 中 8 个功能全部可调用；list 支持交互安装，status 支持交互管理 | 3h | ✅ |
| T8 | 集成测试：端到端验证各功能组合 | 覆盖登录→列表→安装→启用→状态→卸载→登出全流程，包含脚本执行场景 | 4h | ✅ |
| T9 | 交互式 list 功能：远程列表混合本地安装状态并支持一键安装 | 选中未安装扩展后 confirm 并调用 install，操作后循环返回列表 | 2h | ✅ |
| T10 | 交互式 status 功能：本地扩展列表支持多选批量启用/禁用/卸载 | 按 Space 多选扩展，底部展示 `[批量启用] [批量禁用] [批量卸载]` 按钮；按 e/d/u 批量启用/禁用/卸载；按 a 全选/取消全选；搜索生效时仅对结果操作 | 2h | ✅ |
| T11 | TUI slash 命令集成：`/omni-studio` 在终端界面中显示管理菜单 | DialogOmniStudio 组件实现，在 app.tsx 中注册 slash 命令，支持 status/local/list/login/logout/setup；安装/卸载/启用/禁用集成在 list 和 local 视图中以行内按钮提供；登录使用 TUI 原生 DialogPrompt，不使用 @clack/prompts | 3h | ✅ |
| T12 | 实时同步：扩展启用/禁用后 skill / config / tool 自动刷新 | state.json 变化触发 refresh()，TUI 主界面即时生效 | 4h | ✅ |
| T13 | fs.watch 兜底方案：监听 state.json 文件系统事件 | 因 Bun Web Worker 模块缓存隔离导致 GlobalBus 失效，改用 fs.watch 监听 state.json 变化 | 2h | ✅ |
| T14 | store.ts 自动清理：扩展目录删除后自动清理 state.json | 监听 skills/agents/plugins/tools 目录变化，目录不存在时从 state.json 移除记录 | 2h | ✅ |

### P1 — 完善与优化

| # | 任务 | 验收标准 | 预估 | 状态 |
|---|---|---|---|---|
| T15 | 扩展包解压支持（zip / tar.gz） | 自动识别压缩格式并正确解压 | 2h | ✅ |
| T16 | 安装/更新冲突处理（已存在时提示覆盖） | TUI 市场列表自动比对版本，版本不一致时展示 `[更新]` 按钮；install 方法覆盖旧版本，保留 enabled 状态，清理旧缓存 | 2h | ✅ |
| T17 | 下载进度条显示 | fetch ReadableStream 流式下载，onProgress 回调实时报告进度，TUI 列表行展示 `下载中 XX%` | 2h | ✅ |
| T18 | Token 自动刷新（accessToken 过期时用 refreshToken） | auth.ts 实现 refreshToken 方法；market.ts 引入 fetchWithRefresh 包装器，401 时自动刷新并重试 | 3h | ✅ |
| T19 | TUI 体验优化：行内确认、scrollbox 自适应、按钮靠右 | 本地扩展操作使用行内确认避免 dialog 跳转；scrollbox 高度根据内容自适应；列表项使用 space-between 让按钮靠右 | 2h | ✅ |
| T20 | 下载缓存机制 | install 时 zip 缓存到 ~/.omni_studio/cache/，同一版本重新安装跳过下载；install.sh 失败保留解压目录 | 2h | ✅ |
| T21 | Alert 错误展示与闪退修复 | 脚本失败时 DialogAlert 展示完整 stdout/stderr；suppressBackToMenu 防止 Alert 被 backToMenu 替换闪退 | 2h | ✅ |
| T22 | 生命周期脚本路径调整 | 脚本从扩展根目录移至 lifecycle/ 子目录，cwd 仍为扩展根目录 | 1h | ✅ |
| T23 | 安装后默认禁用 | install 完成后 enabled 设为 false，需手动 enable 才执行 start 脚本 | 1h | ✅ |
| T24 | dev 分支合并（2025-05-14）：Effect Schema + HttpApi + import 路径迁移 | 将 omni-studio 模块代码适配到 dev 的新架构（Zod→Effect Schema、Hono→HttpApi、@/effect→@/effect/instance-state）。**注：dev 为主开发分支，后续需持续跟踪合并。** | 6h | ✅ |
| T25 | ripgrep 打包到可执行文件：构建时下载 rg，运行时优先查找二进制同目录 | build.ts 下载 rg 到 dist/*/bin/，ripgrep.ts 优先查找 path.dirname(process.execPath) 下的 rg | 2h | ✅ |
| T26 | ripgrep 开发模式修复：增加开发模式检测和调试日志 | process.execPath 指向 bun 时查找 node_modules/.bin/rg，修复 target 变量缺失错误 | 1h | ✅ |
| T27 | ripgrep 嵌入编译产物：将 rg 二进制嵌入到可执行文件内部 | build.ts 生成 ripgrep-embedded.gen.ts（with { type: "file" } 导入），ripgrep.ts 运行时从 bunfs 解压到 cache | 3h | ✅ |
| T28 | workflow 恢复单文件上传 | rg 嵌入后不再需要压缩包分发，workflow 直接上传 Omni Studio 单文件 | 1h | ✅ |
| T29 | TUI 键盘快捷键导航 | 列表/本地扩展视图支持 ↑/↓ 或 j/k 移动选中、Enter 执行、Tab 切换类型、←/→ 翻页 | 3h | ✅ |

### P2 — 可选增强

| # | 任务 | 验收标准 | 预估 | 状态 |
|---|---|---|---|---|
| T30 | 安装路径带版本号：扩展安装到 `~/.omni_studio/{type}s/{slug}/{version}/`，更新后路径变化自然绕过 Bun ESM 缓存 | 后端已支持指定版本下载；store.ts 安装路径改为 `{slug}/{version}/`，卸载/启用/禁用时路径同步更新；config/tool/skill 扫描路径同步适配。**范围调整**：不做多版本共存/版本回退，不做 TUI 常驻版本下拉框 | 4h | ✅ |
| T31 | 扩展搜索（TUI 常驻搜索框，按 `/` 获取焦点，Backspace 清除搜索） | 市场列表：market.ts `listPaged` 支持 `search` 参数调用后端 `&keyword=` 过滤；本地扩展：前端按 `name`/`slug` 关键词过滤。搜索框常驻显示，默认焦点在列表（方向键可导航），按 `/` 键 focus 搜索框，Enter 确认后自动 blur 回到列表；焦点在列表时按 Backspace 一键清空搜索词；切换类型保留搜索词 | 2h | ✅ |
| T32 | 批量安装（TUI 市场列表支持多选批量安装） | TUI List 视图中按 Space 多选扩展，底部展示 `[批量安装 (N)]` 按钮，点击后逐个下载安装并自动启用 | 3h | ✅ |
| T33 | Spec 扩展类型支持：类型定义、Market API、Store 安装/卸载 | `ExtensionType` 增加 `"spec"`，market.ts `toEntityType` 映射 specs，store.ts `toPlural` 映射 spec→specs，安装解压到 `~/.omni_studio/specs/`，TUI `typeOptions` 增加 spec 类型 | 3h | ✅ |
| T34 | Spec 发现机制：扫描已启用 spec 的 SPEC.md 并注入 instructions，含依赖管理、内嵌扩展自动发现、搜索框常驻 | `spec-discovery.ts` 扫描已启用 spec 的 `SPEC.md`，解析 YAML frontmatter，**只注入正文**（去掉 frontmatter）；扫描内嵌扩展说明文件拼接到正文；`session/instruction.ts` 集成发现结果；skill/tool/agent/plugin 扫描增加 `specs/{slug}/` 子目录路径；TUI 搜索框常驻显示，按 `/` 获取焦点，Enter 确认后自动 blur | 4h | ✅ |
| T35 | Spec TUI 手动触发：新增 Spec 菜单和触发视图 | DialogOmniStudio 主菜单增加 "触发 Spec" 选项，展示已安装且已启用的 spec 列表，支持搜索和 `[触发]` 按钮；触发时检查当前是否在 session 中，发送简短消息 `请按 spec "xxx" 的规范执行。` 到当前 session | 3h | ✅ |
| T36 | Plugin 热重载：Bun ESM 缓存绕过与调试日志 | Omni Studio 扩展更新后 plugin 代码未热重载；根因是 Bun issue #21346（`file://` URL + query string 不会触发重新加载）。修复：POSIX 系统上将 `file://` URL 转为绝对路径 + `?invalidate=...` 再 import；Windows 暂保持原样。在 `plugin/index.ts` 和 `plugin/loader.ts` 中添加详细调试日志辅助定位 | 2h | ✅ |
| T37 | session-memory-plugin API 适配与响应解析修复 | plugin 中 v1 messages 调用需传 `path.id` 替换 URL 占位符；v2 调用需使用 `client._client.get()`；Anthropic 返回 content 数组含 thinking + text block，需过滤 `type === "text"` 后拼接；OpenAI 兼容格式也可能返回数组，统一处理 | 2h | ✅ |
| T38 | Omni Studio TUI 安装成功 UI 优化 | 安装成功后移除 3 秒高亮 `setTimeout` 过渡，直接更新 `localVersions` Map 使按钮立即显示灰色 `[已安装]`，避免闪烁 | 1h | ✅ |
| T39 | TUI 安装后自动启用扩展 | 安装成功后自动调用 `setEnabled(type, slug, true)`；启用成功行内提示绿色"安装并启用成功"，启用失败行内提示红色"安装成功，但启用失败: xxx"；安装失败也改为行内提示，不再弹出 DialogAlert | 1h | ✅ |
| T39a | TUI 自定义 Provider 配置 | TUI 中支持创建自定义 OpenAI-compatible provider：输入 Provider ID、Base URL、Model ID/Name、API Key，自动写入 `opencode.json`；支持配置多个 model；支持编辑已有自定义 provider（修改 URL、Model、API Key） | 2h | ✅ |

### P3 — 品牌与体验升级

| # | 任务 | 验收标准 | 预估 | 状态 |
|---|---|---|---|---|
| T40 | 品牌统一：CLI 命令名 | 将 CLI 主命令从 `opencode` 改为 `omni`；TUI slash 命令从 `/omni-studio` 改为 `/omni-extensions`（别名 `/ext`）；修改 `package.json` bin 字段、`src/cli/index.ts` 命令注册、所有命令描述文案 | 2h | ✅ |
| T41 | 品牌统一：配置文件与路径 | `global.ts` 中 XDG 目录与配置文件名改为编译时可配置（`BRAND_NAME` 环境变量注入 `__BRAND_NAME__`）；`flag.ts` 同时支持 `OMNI_*` 与 `OPENCODE_*` 环境变量；`config.ts` 全面使用 `Global.BRAND` 常量；`cli/cmd/` 下所有硬编码命令名/路径/包名替换为 `BRAND` | 2h | ✅ |
| T42 | 品牌统一：桌面端应用名与 i18n | 新增 `src/shared/brand.ts` 从 `BRAND_NAME` 环境变量读取品牌；`index.ts` APP_NAMES/APP_IDS、menu.ts label、windows.ts title 全部引用品牌常量；`electron-builder.config.ts` artifactName/protocols.name/appId/productName/rpm 动态化；`package.json` author 改为 Omni；15 个 i18n 文件中的 "OpenCode"/"opencode" 改为 `{{brand}}`/`{{command}}` 模板变量，`cli.ts` 调用时传入 | 2h | ✅ |
| T43 | 品牌统一：TUI 标题与提示语 | `attention.ts` DEFAULT_TITLE 改为 `"omni"`；`tips-view.tsx` 中所有产品名引用改为 `omni` 品牌；TUI 配置默认值同步更新 | 1h | ⏳ |
| T44 | 品牌统一：构建产物与 VS Code 扩展 | 修改 `scripts/utils.ts` 二进制文件名、`electron-builder.config.ts` artifactName；修改 `sdks/vscode/package.json` name/displayName/description | 1h | ⏳ |
| T45 | 新 TUI 默认主题 | 创建 `packages/opencode/src/cli/cmd/tui/context/theme/omni.json`，定义完整的 dark/light 双模式色彩方案（46 个颜色键 + thinkingOpacity）；在 `theme.tsx` 中导入并设为默认 `active: "omni"`；确保主题通过 `isTheme` 验证 | 3h | ⏳ |
| T46 | 桌面端集成：IPC 桥接与主进程集成 | 在 `main/ipc.ts` 中注册 omni-studio 相关 IPC handlers：`extension-list`、`extension-install`、`extension-uninstall`、`extension-enable`、`extension-disable`、`extension-status`、`extension-login`、`extension-logout`、`extension-setup`；通过 sidecar 或子进程调用核心 Effect Service（OmniStudioMarket / OmniStudioStore / OmniStudioAuth）；在 `preload/types.ts` 中声明 IPC 类型 | 3h | ⏳ |
| T47 | 桌面端集成：Extension 路由与入口 | 在 renderer 路由中添加 `/extensions` 路径；在主窗口侧边栏/顶部工具栏添加 "Extensions" 图标按钮；点击后导航到 ExtensionManager 视图；应用品牌修改后的新主题配色 | 2h | ⏳ |
| T48 | 桌面端集成：市场列表视图 | 实现远程扩展列表组件：类型切换 Tab（skill/tool/plugin/agent/spec）、搜索框、分页控件；每行展示 name@version + 右侧操作按钮（`[安装]` / `[更新]` / `[已安装]`）；下载时展示实时进度百分比；安装成功后自动启用，行内显示成功/失败提示 | 3h | ⏳ |
| T49 | 桌面端集成：本地管理视图 | 实现本地已安装扩展列表：每行展示 name@version + 状态（enabled/disabled）+ 操作按钮（`[启用]`/`[禁用]`/`[卸载]`）；行内确认模式（点击卸载后切换为 `[确认卸载] [取消]`）；支持按关键词过滤 | 2h | ⏳ |
| T50 | 桌面端集成：登录与配置对话框 | 实现 setup 对话框（输入 api_base）、login 对话框（输入 username/password）、logout 按钮；调用 IPC handlers 完成认证和配置持久化；错误时弹窗提示 | 1.5h | ⏳ |
| T51 | 桌面端集成：Spec 触发视图 | 实现已启用 spec 列表：每行展示 spec 名称 + `[触发]` 按钮；触发前检查当前是否在 session 中，不在则提示；触发时发送用户消息到当前 session；展示触发结果 | 1.5h | ⏳ |

### P4 — IDE 插件集成

| # | 任务 | 验收标准 | 预估 | 状态 |
|---|---|---|---|---|
| T52 | VS Code 插件集成 | VS Code 插件团队负责：在现有 VS Code 扩展中新增 Omni Studio 面板（Activity Bar WebView），支持市场浏览、安装/卸载/启用/禁用扩展、触发 spec；共用 `~/.omni_studio/` 配置和状态 | 可在 VS Code 中完成 Omni Studio 扩展的全生命周期管理 | — | ⏳ |
| T53 | IDEA 插件集成 | IDEA 插件团队负责：在现有 IDEA 插件中新增 Omni Studio Tool Window，支持市场浏览、安装/卸载/启用/禁用扩展、触发 spec；共用 `~/.omni_studio/` 配置和状态 | 可在 IDEA 中完成 Omni Studio 扩展的全生命周期管理 | — | ⏳ |
| T54 | Qt 插件集成 | Qt 插件团队负责：在现有 Qt 插件中新增 Omni Studio 管理面板，支持市场浏览、安装/卸载/启用/禁用扩展、触发 spec；共用 `~/.omni_studio/` 配置和状态 | 可在 Qt Creator 中完成 Omni Studio 扩展的全生命周期管理 | — | ⏳ |

## Task 交付规范

每个 Task 完成后必须执行以下步骤：

1. **更新 plan.md**：
   - 在「任务拆分」表格中，将该 Task 的状态标记从 `⏳` 改为 `✅`
   - 在「进度记录」中，将该 Task 的 `[ ]` 改为 `[x]`
2. **代码质量要求**：
   - 所有生成的代码必须包含必要的中文注释（JSDoc 和行内注释）
   - 遵循 AGENTS.md 中的代码风格约定（snake_case 字段、Effect-based 服务、避免 `else`/`try-catch` 等）
3. **验证**：
   - 运行 `bun typecheck` 确保类型安全
   - 如有单测，确保全部通过
4. **提交与推送**：
   - 使用 `git commit` 提交本次 Task 的全部变更
   - 推送到 `origin/cli` 和 `omni-studio/cli` 两个远程仓库

## 执行建议

1. **第一周**：完成 T1–T7（核心 TUI 功能）
2. **第二周**：完成 T8（集成测试）+ T9–T12（体验优化）
3. **第三周**：完成 T13–T14（实时同步与自动清理）+ T24（dev 分支合并适配）
4. **第四周及以后**：完成 P3 品牌与体验升级 + P4 IDE 插件集成
5. 每完成一个任务后运行 `bun typecheck` 确保类型安全
5. 集成测试优先覆盖主流程，边缘情况后续补充

## 进度记录

- [x] T1 — 类型定义 & 配置模块
- [x] T2 — Auth 模块
- [x] T3 — 登录交互流程
- [x] T4 — Market HTTP 客户端
- [x] T5 — Store 模块
- [x] T6 — Executor 模块
- [x] T7 — TUI 命令路由与交互
- [x] T8 — 集成测试
- [x] T9 — 交互式 list 功能
- [x] T10 — 交互式 status 功能（本地扩展列表支持多选批量启用/禁用/卸载）
- [x] T11 — TUI slash 命令集成
- [x] T12 — 实时同步
- [x] T13 — fs.watch 兜底方案
- [x] T14 — store.ts 自动清理
- [x] T15 — 扩展包解压支持
- [x] T16 — 安装/更新冲突处理
- [x] T17 — 下载进度条显示
- [x] T18 — Token 自动刷新（已完成）
- [x] T19 — TUI 体验优化
- [x] T20 — 下载缓存机制
- [x] T21 — Alert 错误展示与闪退修复
- [x] T22 — 生命周期脚本路径调整
- [x] T23 — 安装后默认禁用
- [x] T24 — dev 分支合并（2025-05-14）Effect Schema + HttpApi + import 路径迁移
- [x] T25 — ripgrep 打包到可执行文件
- [x] T26 — ripgrep 开发模式修复
- [x] T27 — ripgrep 嵌入编译产物
- [x] T28 — workflow 恢复单文件上传
- [x] T29 — TUI 键盘快捷键导航
- [x] T30 — 安装路径带版本号：扩展安装到 `{slug}/{version}/`，更新后路径变化自然绕过 Bun ESM 缓存
- [x] T31 — 扩展搜索（市场列表远程搜索 + 本地扩展前端过滤，常驻搜索框按 `/` 获取焦点）
- [x] T32 — 批量安装
- [x] T33 — Spec 扩展类型支持（类型定义、Market API、Store 安装/卸载）
- [x] T34 — Spec 发现机制（扫描已启用 spec 的 SPEC.md 并注入 instructions）
- [x] T35 — Spec TUI 手动触发（新增 Spec 菜单和触发视图）
- [x] T36 — Plugin 热重载：Bun ESM 缓存绕过与调试日志
- [x] T37 — session-memory-plugin API 适配与响应解析修复
- [x] T38 — Omni Studio TUI 安装成功 UI 优化
- [x] T39 — TUI 安装后自动启用扩展
- [x] T39a — TUI 自定义 Provider 配置（创建/编辑多 model OpenAI-compatible provider）
- [x] T40 — 品牌统一：CLI 命令名
- [x] T41 — 品牌统一：配置文件与路径
- [x] T42 — 品牌统一：桌面端应用名与 i18n
- [ ] T43 — 品牌统一：TUI 标题与提示语
- [ ] T44 — 品牌统一：构建产物与 VS Code 扩展
- [ ] T45 — 新 TUI 默认主题
- [ ] T46 — 桌面端集成：IPC 桥接与主进程集成
- [ ] T47 — 桌面端集成：Extension 路由与入口
- [ ] T48 — 桌面端集成：市场列表视图
- [ ] T49 — 桌面端集成：本地管理视图
- [ ] T50 — 桌面端集成：登录与配置对话框
- [ ] T51 — 桌面端集成：Spec 触发视图
- [ ] T52 — VS Code 插件集成
- [ ] T53 — IDEA 插件集成
- [ ] T54 — Qt 插件集成
