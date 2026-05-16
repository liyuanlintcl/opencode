import path from "path"
import { Effect } from "effect"
import { AppFileSystem } from "@opencode-ai/core/filesystem"
import { Global } from "@opencode-ai/core/global"

/**
 * Spec 扩展发现结果。
 */
export interface SpecEntry {
  /** spec 唯一标识符 */
  slug: string
  /** SPEC.md 的绝对路径 */
  filepath: string
  /** SPEC.md 的完整内容 */
  content: string
}

/**
 * Spec 外部依赖项。
 */
export interface SpecDependency {
  /** 依赖类型 */
  type: "skill" | "tool" | "plugin" | "agent"
  /** 扩展 slug */
  slug: string
}

/**
 * 提取 SPEC.md 的 YAML frontmatter 和正文。
 */
export function extractFrontmatter(content: string): { frontmatter: string; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (!match) return { frontmatter: "", body: content }
  return { frontmatter: match[1], body: match[2] }
}

/**
 * 从 YAML frontmatter 中提取指定 key 的字符串数组值。
 * 仅支持简单的缩进列表格式（每行以 "- " 开头）。
 */
function extractList(frontmatter: string, keyPath: string[]): string[] {
  const lines = frontmatter.split("\n")
  const results: string[] = []
  let depth = 0
  let inTarget = false

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed === "" || trimmed.startsWith("#")) continue

    const indent = line.length - line.trimStart().length
    const expectedIndent = depth * 2

    if (depth < keyPath.length && trimmed.startsWith(keyPath[depth] + ":")) {
      if (depth === keyPath.length - 1) {
        inTarget = true
        depth++
        continue
      }
      depth++
      continue
    }

    if (inTarget && indent === expectedIndent && trimmed.startsWith("- ")) {
      results.push(trimmed.slice(2).trim())
      continue
    }

    if (inTarget && indent < expectedIndent) {
      break
    }
  }

  return results
}

/**
 * 解析 SPEC.md 的外部依赖列表。
 */
export function parseSpecDependencies(content: string): SpecDependency[] {
  const { frontmatter } = extractFrontmatter(content)
  const deps: SpecDependency[] = []
  const types: Array<{ key: string; type: "skill" | "tool" | "plugin" | "agent" }> = [
    { key: "skills", type: "skill" },
    { key: "tools", type: "tool" },
    { key: "plugins", type: "plugin" },
    { key: "agents", type: "agent" },
  ]

  for (const { key, type } of types) {
    const slugs = extractList(frontmatter, [key, "external"])
    for (const slug of slugs) {
      deps.push({ type, slug })
    }
  }

  return deps
}

/**
 * 检查 spec 的外部依赖中哪些尚未安装。
 */
export const checkMissingDependencies = Effect.fn("SpecDiscovery.checkMissingDependencies")(function* (
  specSlug: string,
) {
  const fs = yield* AppFileSystem.Service
  const global = yield* Global.Service

  const specMdPath = path.join(global.home, ".omni_studio", "specs", specSlug, "SPEC.md")
  const exists = yield* fs.existsSafe(specMdPath)
  if (!exists) return [] as SpecDependency[]

  const content = yield* fs.readFileString(specMdPath).pipe(
    Effect.catch(() => Effect.succeed("")),
  )
  if (!content) return [] as SpecDependency[]

  const deps = parseSpecDependencies(content)
  if (deps.length === 0) return [] as SpecDependency[]

  const statePath = path.join(global.home, ".omni_studio", "state.json")
  const stateContent = yield* fs.readFileString(statePath).pipe(
    Effect.catch(() => Effect.succeed("{}")),
  )
  let state: { extensions?: Array<{ type: string; slug: string; enabled: boolean }> }
  try {
    state = JSON.parse(stateContent)
  } catch {
    state = { extensions: [] }
  }
  const installed = new Set((state.extensions ?? []).map((e) => `${e.type}:${e.slug}`))

  return deps.filter((d) => !installed.has(`${d.type}:${d.slug}`))
})

/**
 * 检查 spec 的外部依赖中哪些已安装但未启用。
 */
export const checkDisabledDependencies = Effect.fn("SpecDiscovery.checkDisabledDependencies")(function* (
  specSlug: string,
) {
  const fs = yield* AppFileSystem.Service
  const global = yield* Global.Service

  const specMdPath = path.join(global.home, ".omni_studio", "specs", specSlug, "SPEC.md")
  const exists = yield* fs.existsSafe(specMdPath)
  if (!exists) return [] as SpecDependency[]

  const content = yield* fs.readFileString(specMdPath).pipe(
    Effect.catch(() => Effect.succeed("")),
  )
  if (!content) return [] as SpecDependency[]

  const deps = parseSpecDependencies(content)
  if (deps.length === 0) return [] as SpecDependency[]

  const statePath = path.join(global.home, ".omni_studio", "state.json")
  const stateContent = yield* fs.readFileString(statePath).pipe(
    Effect.catch(() => Effect.succeed("{}")),
  )
  let state: { extensions?: Array<{ type: string; slug: string; enabled: boolean }> }
  try {
    state = JSON.parse(stateContent)
  } catch {
    state = { extensions: [] }
  }
  const installed = new Map(
    (state.extensions ?? []).map((e) => [`${e.type}:${e.slug}`, e.enabled]),
  )

  return deps.filter((d) => {
    const enabled = installed.get(`${d.type}:${d.slug}`)
    return enabled !== undefined && !enabled
  })
})

/**
 * 扫描 ~/.omni_studio/specs/ 目录下所有已启用的 spec，读取其 SPEC.md 内容。
 * 发现机制借鉴 opencode.jsonc 的 instructions 字段：系统读取文件内容并注入 system prompt。
 * 内嵌的 skill/tool/plugin/agent 不单独注册到 state.json，仅作为 spec 资源存在。
 */
export const discoverSpecs = Effect.fn("SpecDiscovery.discover")(function* () {
  const debugLog = (msg: string) => {
    try { require("fs").appendFileSync("/tmp/opencode-debug.log", `[${new Date().toISOString()}] [discoverSpecs] ${msg}\n`) } catch {}
  }
  debugLog("start")
  const fs = yield* AppFileSystem.Service
  const global = yield* Global.Service
  debugLog(`global.home=${global.home}`)

  const specsDir = path.join(global.home, ".omni_studio", "specs")
  const statePath = path.join(global.home, ".omni_studio", "state.json")
  debugLog(`statePath=${statePath}`)

  const stateExists = yield* fs.existsSafe(statePath)
  debugLog(`stateExists=${stateExists}`)
  if (!stateExists) return [] as SpecEntry[]

  debugLog("reading state.json...")
  const stateContent = yield* fs.readFileString(statePath).pipe(
    Effect.catch(() => Effect.succeed("{}")),
  )
  debugLog(`stateContent length=${stateContent.length}`)

  let state: { extensions?: Array<{ type: string; slug: string; enabled: boolean }> }
  try {
    state = JSON.parse(stateContent)
  } catch {
    state = { extensions: [] }
  }
  const enabledSpecs = (state.extensions ?? []).filter(
    (e) => e.type === "spec" && e.enabled,
  )
  debugLog(`enabledSpecs count=${enabledSpecs.length}`)

  const results: SpecEntry[] = []
  for (const spec of enabledSpecs) {
    debugLog(`processing spec slug=${spec.slug}`)
    if (!spec.slug) {
      debugLog("skip: slug is empty")
      continue
    }
    const specMdPath = path.join(specsDir, spec.slug, "SPEC.md")
    debugLog(`specMdPath=${specMdPath}`)
    const exists = yield* fs.existsSafe(specMdPath)
    debugLog(`exists=${exists}`)
    if (!exists) continue

    debugLog("reading SPEC.md...")
    const content = yield* fs.readFileString(specMdPath).pipe(
      Effect.catch(() => Effect.succeed("")),
    )
    debugLog(`content length=${content.length}`)
    if (content) {
      const { body } = extractFrontmatter(content)
      results.push({ slug: spec.slug, filepath: specMdPath, content: body.trim() })
    }
  }

  debugLog(`done, results count=${results.length}`)
  return results
})

/**
 * 获取所有已启用的 spec 的 slug 列表。
 * 供其他扩展类型（skill/tool/agent/plugin）扫描内嵌扩展时使用。
 */
export const getEnabledSpecs = Effect.fn("SpecDiscovery.getEnabledSpecs")(function* () {
  const fs = yield* AppFileSystem.Service
  const global = yield* Global.Service

  const statePath = path.join(global.home, ".omni_studio", "state.json")
  const stateExists = yield* fs.existsSafe(statePath)
  if (!stateExists) return [] as string[]

  const stateContent = yield* fs.readFileString(statePath).pipe(
    Effect.catch(() => Effect.succeed("{}")),
  )

  let state: { extensions?: Array<{ type: string; slug: string; enabled: boolean }> }
  try {
    state = JSON.parse(stateContent)
  } catch {
    state = { extensions: [] }
  }

  return (state.extensions ?? [])
    .filter((e) => e.type === "spec" && e.enabled)
    .map((e) => e.slug)
})

/**
 * 查找依赖指定扩展的所有已启用 spec。
 * 用于禁用/卸载扩展时级联禁用依赖它的 spec。
 */
export const findDependentSpecs = Effect.fn("SpecDiscovery.findDependentSpecs")(function* (
  depType: string,
  depSlug: string,
) {
  const fs = yield* AppFileSystem.Service
  const global = yield* Global.Service

  const statePath = path.join(global.home, ".omni_studio", "state.json")
  const stateContent = yield* fs.readFileString(statePath).pipe(
    Effect.catch(() => Effect.succeed("{}")),
  )
  let state: { extensions?: Array<{ type: string; slug: string; enabled: boolean }> }
  try {
    state = JSON.parse(stateContent)
  } catch {
    state = { extensions: [] }
  }
  const enabledSpecs = (state.extensions ?? []).filter(
    (e) => e.type === "spec" && e.enabled,
  )

  const dependentSpecs: string[] = []
  for (const spec of enabledSpecs) {
    const specMdPath = path.join(global.home, ".omni_studio", "specs", spec.slug, "SPEC.md")
    const content = yield* fs.readFileString(specMdPath).pipe(
      Effect.catch(() => Effect.succeed("")),
    )
    if (!content) continue
    const deps = parseSpecDependencies(content)
    if (deps.some((d) => d.type === depType && d.slug === depSlug)) {
      dependentSpecs.push(spec.slug)
    }
  }

  return dependentSpecs
})
