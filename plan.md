# Omni Studio Marketplace (CLI) — 实现计划

## 依赖关系图

```
Task 1: 类型定义 & 配置模块
    │
    ├──→ Task 2: Auth 模块
    │       │
    │       ├──→ Task 4: Market 客户端
    │       │       │
    │       │       └──→ Task 5: Store 模块
    │       │               │
    │       │               ├──→ Task 6: Executor 模块
    │       │               │       │
    │       │               │       └──→ Task 7: CLI 路由
    │       │               │               │
    │       │               │               └──→ Task 8: 集成测试
    │       │               │
    │       │               └──→ Task 7: CLI 路由
    │       │
    └──→ Task 3: 登录交互
            │
            └──→ Task 7: CLI 路由
```

## 任务拆分

### P0 — 核心实现

| # | 任务 | 验收标准 | 预估 | 状态 |
|---|---|---|---|---|
| T1 | 创建 `src/omni-studio/` 目录及 `types.ts`、`config.ts` | 类型定义完整，配置读写通过单测 | 2h | ✅ |
| T2 | 实现 Auth 模块（login / logout / getAuthHeaders） | 可成功登录并持久化 token，登出后配置清空 | 3h | ✅ |
| T3 | 实现登录交互流程（仅 username / password，地址由 setup 预先配置） | 交互体验与主 CLI 一致；api_base 由 setup 配置 | 2h | ✅ |
| T4 | 实现 Market HTTP 客户端（list / getExtensionMeta / download） | 可正常调用 API 并处理 401/404 错误 | 3h | ✅ |
| T5 | 实现 Store 模块（install / uninstall / enable / disable / status） | 文件正确写入 `~/.omni_studio/`，状态持久化 | 3h | ✅ |
| T6 | 实现 Executor 模块（detectScripts / runScript / activate 处理） | 支持 .sh/.bat/.ps1，activate 先执行，超时处理 | 3h | ✅ |
| T7 | 实现 CLI 命令路由与参数解析（list/status 为交互式） | 8 个命令全部可调用，帮助信息完整；list 支持交互安装，status 支持交互管理 | 3h | ✅ |
| T8 | 集成测试：端到端验证各命令组合 | 覆盖登录→列表→安装→启用→状态→卸载→登出全流程，包含脚本执行场景 | 4h | ✅ |
| T9 | 交互式 list 命令：远程列表混合本地安装状态并支持一键安装 | 选中未安装扩展后 confirm 并调用 install，操作后循环返回列表 | 2h | ✅ |
| T10 | 交互式 status 命令：本地扩展列表支持 enable/disable/uninstall | 选中扩展后二次选择动作，执行后循环返回列表 | 2h | ✅ |
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
| T24 | dev 分支合并（2025-05-14）：Effect Schema + HttpApi + import 路径迁移 | 将 cli 的 Omni Studio 代码适配到 dev 的新架构（Zod→Effect Schema、Hono→HttpApi、@/effect→@/effect/instance-state）。**注：dev 为主开发分支，后续需持续跟踪合并。** | 6h | ✅ |
| T25 | ripgrep 打包到 CLI：构建时下载 rg，运行时优先查找 CLI 同目录 | build.ts 下载 rg 到 dist/*/bin/，ripgrep.ts 优先查找 path.dirname(process.execPath) 下的 rg | 2h | ✅ |
| T26 | ripgrep 开发模式修复：增加开发模式检测和调试日志 | process.execPath 指向 bun 时查找 node_modules/.bin/rg，修复 target 变量缺失错误 | 1h | ✅ |
| T27 | ripgrep 嵌入编译产物：将 rg 二进制嵌入到可执行文件内部 | build.ts 生成 ripgrep-embedded.gen.ts（with { type: "file" } 导入），ripgrep.ts 运行时从 bunfs 解压到 cache | 3h | ✅ |
| T28 | workflow 恢复单文件上传 | rg 嵌入后不再需要压缩包分发，workflow 直接上传 opencode 单文件 | 1h | ✅ |
| T29 | TUI 键盘快捷键导航 | 列表/本地扩展视图支持 ↑/↓ 或 j/k 移动选中、Enter 执行、Tab 切换类型、←/→ 翻页 | 3h | ✅ |

### P2 — 可选增强

| # | 任务 | 验收标准 | 预估 | 状态 |
|---|---|---|---|---|
| T30 | 扩展版本管理（多版本共存 / 切换） | 可安装指定版本，查看已安装版本列表 | 4h | ⏳ |
| T31 | 扩展搜索（`list --search <keyword>`） | 支持按关键词过滤远程列表 | 2h | ⏳ |
| T32 | 批量安装（`install` 支持从配置文件读取列表） | 可从 `omni-studio.packages.json` 批量安装 | 3h | ⏳ |

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

1. **第一周**：完成 T1–T7（核心 CLI 功能）
2. **第二周**：完成 T8（集成测试）+ T9–T12（体验优化）
3. **第三周**：完成 T13–T14（实时同步与自动清理）+ T24（dev 分支合并适配）
4. 每完成一个任务后运行 `bun typecheck` 确保类型安全
5. 集成测试优先覆盖主流程，边缘情况后续补充

## 进度记录

- [x] T1 — 类型定义 & 配置模块
- [x] T2 — Auth 模块
- [x] T3 — 登录交互流程
- [x] T4 — Market HTTP 客户端
- [x] T5 — Store 模块
- [x] T6 — Executor 模块
- [x] T7 — CLI 命令路由与参数解析
- [x] T8 — 集成测试
- [x] T9 — 交互式 list 命令
- [x] T10 — 交互式 status 命令
- [x] T11 — TUI slash 命令集成
- [x] T12 — 实时同步
- [x] T13 — fs.watch 兜底方案
- [x] T14 — store.ts 自动清理
- [x] T15 — 扩展包解压支持
- [x] T16 — 安装/更新冲突处理
- [x] T17 — 下载进度条显示
- [ ] T18 — Token 自动刷新
- [x] T19 — TUI 体验优化
- [x] T20 — 下载缓存机制
- [x] T21 — Alert 错误展示与闪退修复
- [x] T22 — 生命周期脚本路径调整
- [x] T23 — 安装后默认禁用
- [x] T24 — dev 分支合并（2025-05-14）Effect Schema + HttpApi + import 路径迁移
- [x] T25 — ripgrep 打包到 CLI
- [x] T26 — ripgrep 开发模式修复
- [x] T27 — ripgrep 嵌入编译产物
- [x] T28 — workflow 恢复单文件上传
- [x] T29 — TUI 键盘快捷键导航
- [ ] T30 — 扩展版本管理
- [ ] T31 — 扩展搜索
- [ ] T32 — 批量安装
