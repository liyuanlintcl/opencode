# Omni Specs — 企业级 SDD 规范开发平台设计文档

> 基于已审批通过的《Omni Specs 需求文档》进行系统设计。本文档覆盖所有需求的功能点，并建立模块与需求之间的完整映射关系。

---

## 1. 设计概述

### 1.1 设计目标

将需求文档中定义的 5 大功能域（需求分析、设计方案、任务分工、代码钩子、测试生成）映射为可落地的技术架构，确保：
- 每个需求点都有对应的设计模块承载
- 模块间职责单一、接口清晰
- 审批流状态机在所有模块中保持一致

### 1.2 技术选型

| 层级 | 技术栈 | 说明 |
|------|--------|------|
| 前端 | React + TypeScript + TanStack Query | 管理平台 Web 界面 |
| 后端 | Effect.ts + Hono + SQLite | 业务 API + 本地持久化 |
| AI 层 | LLM API（OpenAI / Claude / 本地模型） | SKILL 的推理引擎 |
| 钩子层 | Git Hooks + 服务端 Pre-receive Hook | 代码提交拦截与校验 |
| 测试层 | Vitest（TS 项目）/ Pytest（Python 项目） | 测试脚本执行框架 |

---

## 2. 需求映射矩阵（RTM）

| 需求 ID | 需求标题 | 设计模块 | 映射关系 |
|---------|----------|----------|----------|
| F1.1 | 需求结构化转换 | MOD-REQ-ENGINE | 1:1 |
| F1.2 | 词汇表生成与维护 | MOD-REQ-ENGINE, MOD-TERM-STORE | 1:N |
| F1.3 | 需求审批流 | MOD-WORKFLOW | 1:1 |
| F2.1 | 设计文档生成 | MOD-DESIGN-ENGINE | 1:1 |
| F2.2 | 模块级设计规范 | MOD-DESIGN-ENGINE, MOD-SCHEMA | 1:N |
| F2.3 | 设计审批流 | MOD-WORKFLOW | 1:1 |
| F3.1 | 任务分解与流程图 | MOD-TASK-ENGINE, MOD-GRAPH | 1:N |
| F3.2 | 任务审批流 | MOD-WORKFLOW | 1:1 |
| F4.1 | 任务认领机制 | MOD-TASK-STORE, MOD-HOOK-CLAIM | 1:N |
| F4.2 | 代码范围校验 | MOD-HOOK-SCOPE, MOD-DIFF-ANALYZER | 1:N |
| F4.3 | 功能完成校验 | MOD-HOOK-VERIFY, MOD-COVERAGE | 1:N |
| F5.1 | 测试用例生成 | MOD-TEST-ENGINE | 1:1 |
| F5.2 | 测试脚本生成 | MOD-TEST-ENGINE, MOD-CODEGEN | 1:N |
| F5.3 | 测试审批与冻结 | MOD-WORKFLOW, MOD-TEST-STORE | 1:N |
| NF1-1 ~ NF1-3 | 安全 | MOD-AUTH, MOD-AUDIT | N:1 |
| NF2-1 ~ NF2-3 | 性能 | MOD-CACHE, MOD-QUEUE | N:1 |
| NF3-1 ~ NF3-2 | 可追溯性 | MOD-TRACE, MOD-EVENT-STORE | N:1 |

> **映射说明**："1:N" 表示一个需求由多个模块协作实现；"N:1" 表示多个需求共享同一模块能力。

---

## 3. 系统架构

### 3.1 整体架构图

```
┌─────────────────────────────────────────────────────────────┐
│                        前端层 (React)                        │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│  │ 需求管理  │ │ 设计管理  │ │ 任务管理  │ │ 测试管理  │       │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘       │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTPS
┌────────────────────────▼────────────────────────────────────┐
│                      API 网关层 (Hono)                       │
│              路由 / 认证 / 限流 / 日志统一入口                │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│                      业务服务层 (Effect.ts)                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │  MOD-REQ-*   │  │ MOD-DESIGN-* │  │  MOD-TASK-*  │       │
│  │  需求域服务   │  │  设计域服务   │  │  任务域服务   │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │  MOD-HOOK-*  │  │  MOD-TEST-*  │  │  MOD-WORKFLOW │       │
│  │  钩子域服务   │  │  测试域服务   │  │  审批流服务   │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│                      基础设施层                               │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│  │ SQLite   │ │  LLM API │ │ Git Hook │ │  Event   │       │
│  │ 主数据库  │ │ 推理引擎  │ │ 执行引擎  │ │ 事件总线  │       │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘       │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 模块依赖关系

```
MOD-WORKFLOW
    ↑ 被依赖
MOD-REQ-ENGINE → MOD-DESIGN-ENGINE → MOD-TASK-ENGINE
    ↓                ↓                  ↓
MOD-TERM-STORE    MOD-SCHEMA       MOD-GRAPH
    ↓                ↓                  ↓
MOD-EVENT-STORE ←──────────────────────┘
    ↓
MOD-TRACE

MOD-HOOK-CLAIM → MOD-HOOK-SCOPE → MOD-HOOK-VERIFY
    ↓               ↓                  ↓
MOD-TASK-STORE  MOD-DIFF-ANALYZER  MOD-COVERAGE

MOD-TEST-ENGINE → MOD-CODEGEN
    ↓
MOD-TEST-STORE
```

> **约束**：图中所有箭头方向表示依赖方向，不允许反向依赖，禁止循环依赖。

---

## 4. 模块详细设计

### 4.1 需求域（MOD-REQ-ENGINE）

**职责**：将自然语言需求转换为结构化需求，维护词汇表

**文件结构**：
```
src/requirement/
  ├── index.ts              # 入口，导出 RequirementService
  ├── service.ts            # 核心业务：parse / extractTerms / validate
  ├── schema.ts             # Requirement, Term, Approval 类型定义
  ├── repository.ts         # SQLite 持久化
  ├── llm-prompts.ts        # 结构化转换的 Prompt 模板
  ├── term-validator.ts     # 词汇表一致性校验
  └── __tests__/
      └── service.test.ts
```

**核心接口**：
```typescript
interface RequirementService {
  // 将原始描述解析为结构化需求列表
  parse(input: RawRequirementInput): Effect<Requirement[], ParseError>

  // 从需求中提取术语，生成词汇表草案
  extractTerms(requirements: Requirement[]): Effect<TermDraft[], TermError>

  // 校验需求中的术语是否全部在词汇表中有定义
  validateTerms(requirements: Requirement[]): Effect<ValidationReport, never>
}
```

**对应需求**：F1.1, F1.2, AC1-1 ~ AC1-6

---

### 4.2 审批流模块（MOD-WORKFLOW）

**职责**：统一的审批状态机，被需求、设计、任务、测试复用

**文件结构**：
```
src/workflow/
  ├── index.ts
  ├── service.ts            # 状态机驱动：submit / review / approve / reject
  ├── schema.ts             # Workflow, ApprovalRecord, ApprovalRole
  ├── repository.ts
  └── __tests__/
      └── state-machine.test.ts
```

**状态机设计**：

```
          submit()              review()
[draft] ─────────→ [pending_review] ─────────→ [approved]
                              │                   │
                              │ reject()          │ freeze()
                              ▼                   ▼
                          [rejected]           [frozen]
                              │                   │
                              │ resubmit()        │ change_request()
                              └──────────────────→ [draft]
```

**核心接口**：
```typescript
interface WorkflowService {
  submit(entityType: "req" | "design" | "task" | "test", entityId: string): Effect<void, WorkflowError>
  review(entityId: string, reviewerId: string): Effect<void, WorkflowError>
  approve(entityId: string, reviewerId: string, comment?: string): Effect<void, WorkflowError>
  reject(entityId: string, reviewerId: string, reason: string): Effect<void, WorkflowError>
  getHistory(entityId: string): Effect<ApprovalRecord[], never>
}
```

**对应需求**：F1.3, F2.3, F3.2, F5.3

---

### 4.3 设计域（MOD-DESIGN-ENGINE）

**职责**：基于已审批需求生成结构化 SDD，维护需求-模块映射

**文件结构**：
```
src/design/
  ├── index.ts
  ├── service.ts            # 生成 SDD、维护 RTM
  ├── schema.ts             # DesignDoc, Module, Interface, FileNode
  ├── rtm-builder.ts        # Requirement Traceability Matrix 构建器
  ├── repository.ts
  └── __tests__/
      └── rtm.test.ts
```

**核心数据结构**：
```typescript
interface DesignDoc {
  id: string
  title: string
  req_ids: string[]           // 覆盖的需求 ID
  modules: Module[]
  interfaces: Interface[]
  data_models: DataModel[]
  status: WorkflowStatus
}

interface Module {
  module_id: string
  module_name: string
  responsibility: string
  req_ids: string[]           // 本模块实现的需求
  file_structure: FileNode[]
  interfaces: string[]        // 接口 ID 引用
  dependencies: string[]      // 依赖的 module_id
}

interface FileNode {
  name: string
  type: "file" | "directory"
  children?: FileNode[]
}
```

**核心接口**：
```typescript
interface DesignService {
  // 基于需求列表生成 SDD 草案
  generate(reqIds: string[]): Effect<DesignDoc, DesignError>

  // 校验模块依赖无环
  validateDependencies(modules: Module[]): Effect<void, CycleError>

  // 生成需求映射矩阵（RTM）
  buildRTM(designId: string): Effect<RTM, never>
}
```

**对应需求**：F2.1, F2.2, AC2-1 ~ AC2-5

---

### 4.4 任务域（MOD-TASK-ENGINE + MOD-GRAPH）

**职责**：将设计文档分解为任务，生成依赖图

**文件结构**：
```
src/task/
  ├── index.ts
  ├── service.ts            # 任务分解、工时估算
  ├── schema.ts             # Task, TaskGraph
  ├── graph-builder.ts      # 依赖图构建与关键路径计算
  ├── repository.ts
  └── __tests__/
      └── graph.test.ts
```

**核心接口**：
```typescript
interface TaskService {
  // 基于 SDD 生成任务列表
  decompose(designId: string): Effect<Task[], TaskError>

  // 构建任务依赖图
  buildGraph(tasks: Task[]): Effect<TaskGraph, never>

  // 计算关键路径
  calculateCriticalPath(graph: TaskGraph): Effect<string[] /* task_ids */, never>
}

interface TaskGraph {
  nodes: TaskNode[]
  edges: { from: string; to: string }[]
  critical_path: string[]
  parallel_groups: string[][]  // 同层级可并行任务
}
```

**对应需求**：F3.1, F3.2, AC3-1 ~ AC3-5

---

### 4.5 钩子域（MOD-HOOK-CLAIM / MOD-HOOK-SCOPE / MOD-HOOK-VERIFY）

**职责**：在 Git 提交前拦截并校验开发者的编码合规性

**文件结构**：
```
src/hook/
  ├── index.ts
  ├── claim-service.ts      # 任务认领与状态管理
  ├── scope-checker.ts      # 文件/函数范围校验
  ├── diff-analyzer.ts      # Git diff 解析，提取修改的文件和函数
  ├── verify-service.ts     # 功能完成度校验（静态分析 + 覆盖率）
  ├── commit-validator.ts   # 提交信息格式校验
  ├── schema.ts             # Claim, DiffReport, ValidationResult
  └── __tests__/
      ├── scope-checker.test.ts
      └── commit-validator.test.ts
```

**钩子执行流程**：

```
Git Pre-commit / Pre-receive Hook
    │
    ▼
┌─────────────────┐
│ 1. 提取提交信息  │──→ commit-validator.ts
│    (TASK-xxx?)   │    失败 → 阻止提交
└────────┬────────┘
         │
    ▼
┌─────────────────┐
│ 2. 校验认领状态  │──→ claim-service.ts
│    (已认领?)     │    失败 → 阻止提交
└────────┬────────┘
         │
    ▼
┌─────────────────┐
│ 3. 解析 Diff     │──→ diff-analyzer.ts
│    (改了哪些?)   │
└────────┬────────┘
         │
    ▼
┌─────────────────┐
│ 4. 范围校验      │──→ scope-checker.ts
│    (越权修改?)   │    失败 → 阻止提交
└────────┬────────┘
         │
    ▼
┌─────────────────┐
│ 5. 功能完成校验  │──→ verify-service.ts
│    (测试覆盖?)   │    失败 → 阻止提交
└─────────────────┘
         │
         ▼
    全部通过 → 允许提交
```

**核心接口**：
```typescript
interface HookService {
  // 开发者认领任务
  claimTask(developerId: string, taskId: string): Effect<void, ClaimError>

  // 执行完整的提交前校验
  validateCommit(commitInfo: CommitInfo): Effect<ValidationResult, HookError>

  // 校验提交信息格式
  validateCommitMessage(message: string): Effect<{ taskId: string; summary: string }, FormatError>
}
```

**对应需求**：F4.1, F4.2, F4.3, AC4-1 ~ AC4-8

---

### 4.6 测试域（MOD-TEST-ENGINE + MOD-CODEGEN）

**职责**：基于设计点和验收标准生成测试用例与可执行脚本

**文件结构**：
```
src/testgen/
  ├── index.ts
  ├── service.ts            # 测试用例生成主逻辑
  ├── schema.ts             # TestCase, TestScript
  ├── codegen/
  │   ├── index.ts
  │   ├── vitest-generator.ts   # Vitest 脚本生成器
  │   └── pytest-generator.ts   # Pytest 脚本生成器（预留）
  ├── repository.ts
  └── __tests__/
      └── codegen.test.ts
```

**核心接口**：
```typescript
interface TestGenService {
  // 基于需求/设计生成测试用例
  generateCases(reqIds: string[], designId: string): Effect<TestCase[], TestGenError>

  // 将测试用例转化为可执行脚本
  generateScript(cases: TestCase[], framework: "vitest" | "pytest"): Effect<TestScript, CodegenError>

  // 执行测试脚本并关联结果到需求
  execute(script: TestScript): Effect<TestReport, never>
}
```

**对应需求**：F5.1, F5.2, F5.3, AC5-1 ~ AC5-6

---

### 4.7 基础设施模块

#### MOD-AUTH（认证授权）
```
src/auth/
  ├── index.ts
  ├── service.ts            # JWT 签发/校验、RBAC 权限校验
  └── schema.ts             # User, Role, Permission
```
- 所有管理 API 必经 MOD-AUTH 校验
- 钩子调用也需要携带 developer token

#### MOD-AUDIT（审计日志）
```
src/audit/
  ├── index.ts
  ├── service.ts            # 记录所有审批操作和敏感变更
  └── schema.ts             # AuditLog
```
- 异步写入，不影响主流程性能

#### MOD-TRACE（可追溯性）
```
src/trace/
  ├── index.ts
  ├── service.ts            # 建立 code → task → design → req 的链路查询
  └── schema.ts             # TraceLink
```
- 基于 Git commit 中的 TASK-xxx 标识自动构建链路

#### MOD-EVENT-STORE（事件存储）
```
src/event/
  ├── index.ts
  ├── service.ts            # 领域事件发布与订阅
  └── schema.ts             # DomainEvent
```
- 需求/设计/任务状态变更时发布事件
- 测试脚本自动标记"待更新"通过事件监听实现

---

## 5. 数据模型设计

### 5.1 ER 图（核心实体）

```
┌─────────────┐       ┌─────────────┐       ┌─────────────┐
│ Requirement │◄─────►│   DesignDoc │◄─────►│    Task     │
└──────┬──────┘       └──────┬──────┘       └──────┬──────┘
       │                     │                     │
       │              ┌──────┴──────┐              │
       │              │   Module    │              │
       │              └─────────────┘              │
       │                                           │
       ▼                                           ▼
┌─────────────┐                            ┌─────────────┐
│    Term     │                            │  TestCase   │
└─────────────┘                            └─────────────┘
       │                                           │
       │              ┌─────────────┐              │
       └─────────────►│   TraceLink │◄─────────────┘
                      └─────────────┘
```

### 5.2 核心表结构（SQLite）

```sql
-- 需求表
CREATE TABLE requirement (
  id TEXT PRIMARY KEY,              -- REQ-2024-001
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  priority TEXT NOT NULL CHECK(priority IN ('P0','P1','P2','P3')),
  acceptance_criteria TEXT NOT NULL, -- JSON 数组
  related_terms TEXT,               -- JSON 数组，TERM ID 列表
  source TEXT,                      -- 原始描述片段
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','pending_review','approved','rejected','frozen')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- 词汇表
CREATE TABLE term (
  id TEXT PRIMARY KEY,              -- TERM-001
  term TEXT NOT NULL UNIQUE,
  definition TEXT NOT NULL,
  forbidden_synonyms TEXT NOT NULL, -- JSON 数组
  scope TEXT NOT NULL DEFAULT 'global',
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','approved')),
  created_by TEXT NOT NULL,
  approved_by TEXT
);

-- 设计文档表
CREATE TABLE design_doc (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  req_ids TEXT NOT NULL,            -- JSON 数组
  modules TEXT NOT NULL,            -- JSON 数组
  status TEXT NOT NULL DEFAULT 'draft',
  created_at INTEGER NOT NULL
);

-- 任务表
CREATE TABLE task (
  id TEXT PRIMARY KEY,              -- TASK-001
  title TEXT NOT NULL,
  module_id TEXT NOT NULL,
  req_ids TEXT NOT NULL,            -- JSON 数组
  description TEXT NOT NULL,
  files_to_modify TEXT NOT NULL,    -- JSON 数组
  data_structures TEXT,             -- JSON 数组
  functions TEXT,                   -- JSON 数组
  acceptance_criteria TEXT NOT NULL,-- JSON 数组
  estimated_hours INTEGER,
  dependencies TEXT,                -- JSON 数组，task_id 列表
  status TEXT NOT NULL DEFAULT 'draft',
  assignee_id TEXT,                 -- 认领者
  claimed_at INTEGER,
  created_at INTEGER NOT NULL
);

-- 审批记录表
CREATE TABLE approval_record (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL CHECK(entity_type IN ('req','design','task','test')),
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK(action IN ('submit','review','approve','reject','freeze','change_request')),
  actor_id TEXT NOT NULL,
  comment TEXT,
  created_at INTEGER NOT NULL
);

-- 可追溯链路表
CREATE TABLE trace_link (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  commit_hash TEXT NOT NULL,
  task_id TEXT NOT NULL,
  design_id TEXT NOT NULL,
  req_id TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
```

---

## 6. 接口设计

### 6.1 管理 API 路由

```
POST   /api/v1/requirements/parse          # 解析原始需求
GET    /api/v1/requirements                # 列表查询
GET    /api/v1/requirements/:id            # 详情
POST   /api/v1/requirements/:id/submit     # 提交审批
POST   /api/v1/requirements/:id/approve    # 审批通过
POST   /api/v1/requirements/:id/reject     # 审批拒绝

GET    /api/v1/terms                       # 词汇表列表
POST   /api/v1/terms                       # 新增术语
POST   /api/v1/terms/:id/approve           # 术语审批

POST   /api/v1/designs/generate            # 基于需求生成 SDD
GET    /api/v1/designs/:id/rtm             # 获取需求映射矩阵
POST   /api/v1/designs/:id/submit          # 提交设计审批

POST   /api/v1/tasks/decompose             # 基于设计分解任务
GET    /api/v1/tasks/:id/graph             # 获取任务依赖图
POST   /api/v1/tasks/:id/claim             # 认领任务
POST   /api/v1/tasks/:id/release           # 释放任务

POST   /api/v1/tests/generate              # 生成测试用例
POST   /api/v1/tests/scripts               # 生成测试脚本
GET    /api/v1/tests/reports/:id           # 获取测试报告

POST   /api/v1/hooks/validate              # 提交前校验（Git Hook 调用）
GET    /api/v1/traces/:commit_hash         # 获取提交的可追溯链路
```

### 6.2 Git Hook 调用协议

**Pre-receive Hook**（服务端，推荐）
```bash
# Git 服务器收到 push 时调用
curl -X POST https://admin.omni-studio.local/api/v1/hooks/validate \
  -H "Authorization: Bearer ${DEVELOPER_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "repo_url": "https://github.com/org/repo",
    "branch": "feature/TASK-001",
    "commit_hash": "abc123",
    "commit_message": "TASK-001 实现用户登录功能",
    "diff": "..."
  }'
```

**Pre-commit Hook**（客户端，兜底）
```bash
# 本地 commit 前调用（同协议，但校验力度弱于服务端）
```

---

## 7. 异常与边界处理

| 场景 | 处理策略 | 对应需求 |
|------|----------|----------|
| LLM 解析需求失败/超时 | 返回 `ParseError`，保留原始输入，提示人工介入 | F1.1, NF2-1 |
| 词汇表术语冲突 | 标记冲突位置，强制人工选择保留哪个定义 | F1.2 |
| 模块依赖成环 | `validateDependencies` 抛出 `CycleError`，阻止 SDD 提交 | F2.2 |
| 任务依赖成环 | `buildGraph` 检测并抛出错误，强制人工调整 | F3.1 |
| 开发者越权修改 | Hook 拦截，返回违规文件清单，阻止提交 | F4.2 |
| 认领任务超时 | 定时任务扫描，超 48h 无提交自动释放 | F4.1 |
| 测试脚本生成失败 | 返回 `CodegenError`，提示不支持的语法或框架 | F5.2 |
| 需求变更后关联测试过期 | 事件监听自动标记 `stale`，CI 跳过过期测试 | F5.3 |

---

## 8. 验收标准对应检查表

| 需求 ID | 设计模块 | 验收标准 | 设计覆盖方式 |
|---------|----------|----------|--------------|
| F1.1 | MOD-REQ-ENGINE | AC1-1 ~ AC1-3 | `parse()` + `validateTerms()` 接口 + 测试用例 |
| F1.2 | MOD-REQ-ENGINE, MOD-TERM-STORE | AC1-4 ~ AC1-6 | `extractTerms()` + `term` 表状态机 + 事件监听 |
| F1.3 | MOD-WORKFLOW | AC1-7 ~ AC1-9 | 统一状态机 + `approval_record` 表 |
| F2.1 | MOD-DESIGN-ENGINE | AC2-1 ~ AC2-2 | `generate()` + RTM 构建逻辑 |
| F2.2 | MOD-DESIGN-ENGINE, MOD-SCHEMA | AC2-3 ~ AC2-5 | `Module` 类型定义 + `validateDependencies()` |
| F2.3 | MOD-WORKFLOW | AC2-6 ~ AC2-7 | 状态机 + 联锁逻辑（design approved → req frozen）|
| F3.1 | MOD-TASK-ENGINE, MOD-GRAPH | AC3-1 ~ AC3-3 | `decompose()` + `buildGraph()` + 关键路径算法 |
| F3.2 | MOD-WORKFLOW | AC3-4 ~ AC3-5 | 状态机 + 依赖校验 |
| F4.1 | MOD-HOOK-CLAIM, MOD-TASK-STORE | AC4-1 ~ AC4-2 | `claimTask()` + 定时释放任务 |
| F4.2 | MOD-HOOK-SCOPE, MOD-DIFF-ANALYZER | AC4-3 ~ AC4-5 | `validateCommit()` 中的范围校验步骤 |
| F4.3 | MOD-HOOK-VERIFY, MOD-COVERAGE | AC4-6 ~ AC4-8 | 提交信息正则 + 覆盖率阈值校验 |
| F5.1 | MOD-TEST-ENGINE | AC5-1 ~ AC5-2 | `generateCases()` 边界覆盖策略 |
| F5.2 | MOD-TEST-ENGINE, MOD-CODEGEN | AC5-3 ~ AC5-4 | `generateScript()` + 错误码映射 |
| F5.3 | MOD-WORKFLOW, MOD-TEST-STORE | AC5-5 ~ AC5-6 | 状态机 + 事件监听标记 stale |
