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

| # | 任务 | 验收标准 | 预估 |
|---|---|---|---|
| T1 | 创建 `src/omni-studio/` 目录及 `types.ts`、`config.ts` | 类型定义完整，配置读写通过单测 | 2h | ✅ |
| T2 | 实现 Auth 模块（login / logout / getAuthHeaders） | 可成功登录并持久化 token，登出后配置清空 | 3h | ✅ |
| T3 | 实现登录交互流程（密码输入隐藏、已登录提示） | 交互体验与主 CLI 一致 | 2h | ✅ |
| T4 | 实现 Market HTTP 客户端（list / getExtensionMeta / download） | 可正常调用 API 并处理 401/404 错误 | 3h | ✅ |
| T5 | 实现 Store 模块（install / uninstall / enable / disable / status） | 文件正确写入 `~/.omni_studio/`，状态持久化 | 3h | ✅ |
| T6 | 实现 Executor 模块（detectScripts / runScript / activate 处理） | 支持 .sh/.bat/.ps1，activate 先执行，超时处理 | 3h | ✅ |
| T7 | 实现 CLI 命令路由与参数解析（list/status 为交互式） | 8 个命令全部可调用，帮助信息完整；list 支持交互安装，status 支持交互管理 | 3h | ✅ |
| T8 | 集成测试：端到端验证各命令组合 | 覆盖登录→列表→安装→启用→状态→卸载→登出全流程，包含脚本执行场景 | 4h | ⏳ |
| T9 | 交互式 list 命令：远程列表混合本地安装状态并支持一键安装 | 选中未安装扩展后 confirm 并调用 install，操作后循环返回列表 | 2h | ⏳ |
| T10 | 交互式 status 命令：本地扩展列表支持 enable/disable/uninstall | 选中扩展后二次选择动作，执行后循环返回列表 | 2h | ⏳ |

### P1 — 完善与优化

| # | 任务 | 验收标准 | 预估 |
|---|---|---|---|
| T11 | 扩展包解压支持（zip / tar.gz） | 自动识别压缩格式并正确解压 | 2h | ⏳ |
| T12 | 安装/更新冲突处理（已存在时提示覆盖） | 交互式确认，支持 `--force` 静默覆盖 | 2h | ⏳ |
| T13 | 下载进度条显示 | 大文件下载时有视觉反馈 | 2h | ⏳ |
| T14 | Token 自动刷新（accessToken 过期时用 refreshToken） | 401 时自动刷新，失败则提示重新登录 | 3h | ⏳ |

### P2 — 可选增强

| # | 任务 | 验收标准 | 预估 |
|---|---|---|---|
| T15 | 扩展版本管理（多版本共存 / 切换） | 可安装指定版本，查看已安装版本列表 | 4h | ⏳ |
| T16 | 扩展搜索（`list --search <keyword>`） | 支持按关键词过滤远程列表 | 2h | ⏳ |
| T17 | 批量安装（`install` 支持从配置文件读取列表） | 可从 `omni-studio.packages.json` 批量安装 | 3h | ⏳ |

## 执行建议

1. **第一周**：完成 T1–T7（核心 CLI 功能）
2. **第二周**：完成 T8（集成测试）+ T9–T12（体验优化）
3. 每完成一个任务后运行 `bun typecheck` 确保类型安全
4. 集成测试优先覆盖主流程，边缘情况后续补充

## 进度记录

- [x] T1 — 类型定义 & 配置模块
- [x] T2 — Auth 模块（已完成）
- [x] T3 — 登录交互流程（已完成）
- [x] T4 — Market HTTP 客户端（已完成）
- [x] T5 — Store 模块（已完成）
- [x] T6 — Executor 模块（已完成）
- [x] T7 — CLI 命令路由与参数解析（已完成）
- [ ] T8 — 集成测试（未开始）
- [ ] T9 — 交互式 list 命令（未开始）
- [ ] T10 — 交互式 status 命令（未开始）
- [ ] T11 — 扩展包解压支持（未开始）
- [ ] T12 — 安装/更新冲突处理（未开始）
- [ ] T13 — 下载进度条显示（未开始）
- [ ] T14 — Token 自动刷新（未开始）
- [ ] T15 — 扩展版本管理（未开始）
- [ ] T16 — 扩展搜索（未开始）
- [ ] T17 — 批量安装（未开始）
