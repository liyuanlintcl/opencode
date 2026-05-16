import fs from "fs"
import path from "path"
import { pathToFileURL } from "url"
import { Effect, Layer, Context, Schema } from "effect"
import { NamedError } from "@opencode-ai/core/util/error"
import type { Agent } from "@/agent/agent"
import { Bus } from "@/bus"
import { InstanceState } from "@/effect/instance-state"
import { InstanceRef } from "@/effect/instance-ref"
import { Instance } from "@/project/instance"
import { Flag } from "@opencode-ai/core/flag/flag"
import { Global } from "@opencode-ai/core/global"
import { Permission } from "@/permission"
import { AppFileSystem } from "@opencode-ai/core/filesystem"
import { Config } from "@/config/config"
import { ConfigMarkdown } from "@/config/markdown"
import { Glob } from "@opencode-ai/core/util/glob"
import * as Log from "@opencode-ai/core/util/log"
import { Discovery } from "./discovery"
import { parseSpecDependencies } from "@/omni-studio/spec-discovery"
import CUSTOMIZE_OPENCODE_SKILL_BODY from "./prompt/customize-opencode.md" with { type: "text" }
import { isRecord } from "@/util/record"

const log = Log.create({ service: "skill" })
const CLAUDE_EXTERNAL_DIR = ".claude"
const AGENTS_EXTERNAL_DIR = ".agents"
const EXTERNAL_SKILL_PATTERN = "skills/**/SKILL.md"
const OPENCODE_SKILL_PATTERN = "{skill,skills}/**/SKILL.md"
const SKILL_PATTERN = "**/SKILL.md"

// Built-in skill that ships with opencode. The model's intuition for what an
// opencode.json should look like is often wrong, and opencode hard-fails on
// invalid config, so users hit cryptic startup errors. Loading this skill
// when the model is asked to touch opencode's own config files gives it the
// actual schemas instead of guesses.
const CUSTOMIZE_OPENCODE_SKILL_NAME = "customize-opencode"
const CUSTOMIZE_OPENCODE_SKILL_DESCRIPTION =
  "Use ONLY when the user is editing or creating opencode's own configuration: opencode.json, opencode.jsonc, files under .opencode/, or files under ~/.config/opencode/. Also use when creating or fixing opencode agents, subagents, skills, plugins, MCP servers, or permission rules. Do not use for the user's own application code, or for any project that is not configuring opencode itself."

export const Info = Schema.Struct({
  name: Schema.String,
  description: Schema.optional(Schema.String),
  location: Schema.String,
  content: Schema.String,
})
export type Info = Schema.Schema.Type<typeof Info>

const Issue = Schema.StructWithRest(
  Schema.Struct({
    message: Schema.String,
    path: Schema.Array(Schema.String),
  }),
  [Schema.Record(Schema.String, Schema.Unknown)],
)

function isSkillFrontmatter(data: unknown): data is { name: string; description?: string } {
  return (
    isRecord(data) &&
    typeof data.name === "string" &&
    (data.description === undefined || typeof data.description === "string")
  )
}

export const InvalidError = NamedError.create("SkillInvalidError", {
  path: Schema.String,
  message: Schema.optional(Schema.String),
  issues: Schema.optional(Schema.Array(Issue)),
})

export const NameMismatchError = NamedError.create("SkillNameMismatchError", {
  path: Schema.String,
  expected: Schema.String,
  actual: Schema.String,
})

type State = {
  skills: Record<string, Info>
  dirs: Set<string>
}

type DiscoveryState = {
  matches: string[]
  dirs: string[]
}

type ScanState = {
  matches: Set<string>
  dirs: Set<string>
}

export interface Interface {
  readonly get: (name: string) => Effect.Effect<Info | undefined>
  readonly all: () => Effect.Effect<Info[]>
  readonly dirs: () => Effect.Effect<string[]>
  readonly available: (agent?: Agent.Info) => Effect.Effect<Info[]>
  readonly refresh: () => Effect.Effect<void>
}

const add = Effect.fnUntraced(function* (state: State, match: string, bus: Bus.Interface) {
  const md = yield* Effect.tryPromise({
    try: () => ConfigMarkdown.parse(match),
    catch: (err) => err,
  }).pipe(
    Effect.catch(
      Effect.fnUntraced(function* (err) {
        const message = ConfigMarkdown.FrontmatterError.isInstance(err)
          ? err.data.message
          : `Failed to parse skill ${match}`
        const { Session } = yield* Effect.promise(() => import("@/session/session"))
        yield* bus.publish(Session.Event.Error, { error: new NamedError.Unknown({ message }).toObject() })
        log.error("failed to load skill", { skill: match, err })
        return undefined
      }),
    ),
  )

  if (!md) return

  if (!isSkillFrontmatter(md.data)) return

  if (state.skills[md.data.name]) {
    log.warn("duplicate skill name", {
      name: md.data.name,
      existing: state.skills[md.data.name].location,
      duplicate: match,
    })
  }

  state.dirs.add(path.dirname(match))
  state.skills[md.data.name] = {
    name: md.data.name,
    description: md.data.description,
    location: match,
    content: md.content,
  }
})

const scan = Effect.fnUntraced(function* (
  state: ScanState,
  root: string,
  pattern: string,
  opts?: { dot?: boolean; scope?: string },
) {
  const matches = yield* Effect.tryPromise({
    try: () =>
      Glob.scan(pattern, {
        cwd: root,
        absolute: true,
        include: "file",
        symlink: true,
        dot: opts?.dot,
      }),
    catch: (error) => error,
  }).pipe(
    Effect.catch((error) => {
      if (!opts?.scope) return Effect.die(error)
      log.error(`failed to scan ${opts.scope} skills`, { dir: root, error })
      return Effect.succeed([] as string[])
    }),
  )

  for (const match of matches) {
    state.matches.add(match)
    state.dirs.add(path.dirname(match))
  }
})

const discoverSkills = Effect.fnUntraced(function* (
  config: Config.Interface,
  discovery: Discovery.Interface,
  fsys: AppFileSystem.Interface,
  global: Global.Interface,
  directory: string,
  worktree: string,
) {
  const state: ScanState = { matches: new Set(), dirs: new Set() }

  const externalDirs: string[] = []
  if (!Flag.OPENCODE_DISABLE_EXTERNAL_SKILLS) {
    if (!Flag.OPENCODE_DISABLE_CLAUDE_CODE_SKILLS) externalDirs.push(CLAUDE_EXTERNAL_DIR)
    externalDirs.push(AGENTS_EXTERNAL_DIR)

    for (const dir of externalDirs) {
      const root = path.join(global.home, dir)
      if (!(yield* fsys.isDir(root))) continue
      yield* scan(state, root, EXTERNAL_SKILL_PATTERN, { dot: true, scope: "global" })
    }

    const upDirs = yield* fsys
      .up({ targets: externalDirs, start: directory, stop: worktree })
      .pipe(Effect.catch(() => Effect.succeed([] as string[])))

    for (const root of upDirs) {
      yield* scan(state, root, EXTERNAL_SKILL_PATTERN, { dot: true, scope: "project" })
    }
  }

  const configDirs = yield* config.directories()
  for (const dir of configDirs) {
    yield* scan(state, dir, OPENCODE_SKILL_PATTERN)
  }

  const cfg = yield* config.get()
  for (const item of cfg.skills?.paths ?? []) {
    const expanded = item.startsWith("~/") ? path.join(global.home, item.slice(2)) : item
    const dir = path.isAbsolute(expanded) ? expanded : path.join(directory, expanded)
    if (!(yield* fsys.isDir(dir))) {
      log.warn("skill path not found", { path: dir })
      continue
    }

    yield* scan(state, dir, SKILL_PATTERN)
  }

  for (const url of cfg.skills?.urls ?? []) {
    const pulledDirs = yield* discovery.pull(url)
    for (const dir of pulledDirs) {
      yield* scan(state, dir, SKILL_PATTERN)
    }
  }

  /** 扫描 Omni Studio 安装的已启用 skill 扩展 */
  const omniStudioStatePath = path.join(Global.Path.home, ".omni_studio", "state.json")
  log.info("scanning omni studio skills", { statePath: omniStudioStatePath })

  const omniState = yield* Effect.tryPromise({
    try: () => Bun.file(omniStudioStatePath).json().catch(() => ({ extensions: [] })),
    catch: () => ({ extensions: [] }),
  }).pipe(Effect.orElseSucceed(() => ({ extensions: [] })))

  log.info("omni studio state loaded", {
    statePath: omniStudioStatePath,
    resultType: typeof omniState,
    hasExtensions: "extensions" in (omniState as any),
    extensionsCount: (omniState as any).extensions?.length ?? 0,
  })

  for (const ext of (omniState as { extensions?: Array<{ type: string; slug: string; enabled: boolean }> }).extensions ?? []) {
    log.info("checking omni studio extension", { type: ext.type, slug: ext.slug, enabled: ext.enabled })
    if (ext.type === "skill" && ext.enabled) {
      const extDir = path.join(Global.Path.home, ".omni_studio", "skills", ext.slug)
      const dirExists = yield* fsys.isDir(extDir)
      log.info("omni studio skill directory check", { slug: ext.slug, extDir, exists: dirExists })
      if (dirExists) {
        const beforeMatches = state.matches.size
        yield* scan(state, extDir, SKILL_PATTERN)
        log.info("omni studio skill scanned", { slug: ext.slug, newMatches: state.matches.size - beforeMatches })
      }
    }
  }

  /** 扫描已启用 spec 内嵌的 skill */
  const enabledSpecs = ((omniState as { extensions?: Array<{ type: string; slug: string; enabled: boolean }> }).extensions ?? [])
    .filter((e) => e.type === "spec" && e.enabled)
  const omniSpecsDir = path.join(Global.Path.home, ".omni_studio", "specs")
  for (const spec of enabledSpecs) {
    const specSkillsDir = path.join(omniSpecsDir, spec.slug, "skills")
    const dirExists = yield* fsys.isDir(specSkillsDir)
    log.info("checking spec internal skills", { spec: spec.slug, dir: specSkillsDir, exists: dirExists })
    if (dirExists) {
      const beforeMatches = state.matches.size
      yield* scan(state, specSkillsDir, SKILL_PATTERN)
      log.info("spec internal skills scanned", { spec: spec.slug, newMatches: state.matches.size - beforeMatches })
    }
  }

  /** 扫描已启用 spec 声明的外部 skill 依赖 */
  for (const spec of enabledSpecs) {
    const specMdPath = path.join(omniSpecsDir, spec.slug, "SPEC.md")
    if (!(yield* fsys.existsSafe(specMdPath))) continue

    const content = yield* fsys.readFileString(specMdPath).pipe(
      Effect.catch(() => Effect.succeed("")),
    )
    if (!content) continue

    const deps = parseSpecDependencies(content)
    for (const dep of deps) {
      if (dep.type !== "skill") continue
      const skillDir = path.join(Global.Path.home, ".omni_studio", "skills", dep.slug)
      const dirExists = yield* fsys.isDir(skillDir)
      log.info("checking spec external skill", { spec: spec.slug, skill: dep.slug, dir: skillDir, exists: dirExists })
      if (dirExists) {
        const beforeMatches = state.matches.size
        yield* scan(state, skillDir, SKILL_PATTERN)
        log.info("spec external skill scanned", { spec: spec.slug, skill: dep.slug, newMatches: state.matches.size - beforeMatches })
      }
    }
  }

  return {
    matches: Array.from(state.matches),
    dirs: Array.from(state.dirs),
  }
})

const loadSkills = Effect.fnUntraced(function* (state: State, discovered: DiscoveryState, bus: Bus.Interface) {
  yield* Effect.forEach(discovered.matches, (match) => add(state, match, bus), {
    concurrency: "unbounded",
    discard: true,
  })

  log.info("init", { count: Object.keys(state.skills).length })
})

export class Service extends Context.Service<Service, Interface>()("@opencode/Skill") {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const discovery = yield* Discovery.Service
    const config = yield* Config.Service
    const bus = yield* Bus.Service
    const fsys = yield* AppFileSystem.Service
    const global = yield* Global.Service
    const discovered = yield* InstanceState.make(
      Effect.fn("Skill.discovery")(function* (ctx) {
        return yield* discoverSkills(config, discovery, fsys, global, ctx.directory, ctx.worktree)
      }),
    )
    const state = yield* InstanceState.make(
      Effect.fn("Skill.state")(function* () {
        const s: State = { skills: {}, dirs: new Set() }
        // Register the built-in skill BEFORE disk discovery so a user-disk
        // skill with the same name can override it.
        s.skills[CUSTOMIZE_OPENCODE_SKILL_NAME] = {
          name: CUSTOMIZE_OPENCODE_SKILL_NAME,
          description: CUSTOMIZE_OPENCODE_SKILL_DESCRIPTION,
          location: "<built-in>",
          content: CUSTOMIZE_OPENCODE_SKILL_BODY,
        }
        yield* loadSkills(s, yield* InstanceState.get(discovered), bus)
        return s
      }),
    )

    const get = Effect.fn("Skill.get")(function* (name: string) {
      const s = yield* InstanceState.get(state)
      return s.skills[name]
    })

    const all = Effect.fn("Skill.all")(function* () {
      const s = yield* InstanceState.get(state)
      return Object.values(s.skills)
    })

    const dirs = Effect.fn("Skill.dirs")(function* () {
      return (yield* InstanceState.get(discovered)).dirs
    })

    const available = Effect.fn("Skill.available")(function* (agent?: Agent.Info) {
      const s = yield* InstanceState.get(state)
      const list = Object.values(s.skills).toSorted((a, b) => a.name.localeCompare(b.name))
      if (!agent) return list
      return list.filter((skill) => Permission.evaluate("skill", skill.name, agent.permission).action !== "deny")
    })

    const refresh = Effect.fn("Skill.refresh")(function* () {
      yield* InstanceState.invalidate(discovered)
      yield* InstanceState.invalidate(state)
    })

    /** 监听 state.json 文件变化，触发 skill 刷新 */
    const omniStudioDir = path.join(Global.Path.home, ".omni_studio")
    try {
      const watcher = fs.watch(omniStudioDir, InstanceState.bind((eventType: string, filename: string | Buffer | null) => {
        const name = filename ? (typeof filename === "string" ? filename : filename.toString()) : null
        if (name === "state.json" || name === null) {
          log.info("state.json changed, refreshing skills")
          try {
            const ctx = Instance.current
            Effect.runPromise(
              refresh().pipe(Effect.provideService(InstanceRef, ctx)),
            ).then(() => {
              log.info("skill refresh completed (fs.watch)")
            }).catch((err) => {
              log.error("skill refresh failed (fs.watch)", { error: err instanceof Error ? err.message : String(err) })
            })
          } catch (err) {
            log.warn("fs.watch callback failed: InstanceContext not available", { error: err instanceof Error ? err.message : String(err) })
          }
        }
      }))
      yield* Effect.addFinalizer(() => Effect.sync(() => { watcher.close() }))
    } catch (err) {
      log.warn("failed to watch omni studio directory", { dir: omniStudioDir, error: err instanceof Error ? err.message : String(err) })
    }

    return Service.of({ get, all, dirs, available, refresh })
  }),
)

export const defaultLayer = layer.pipe(
  Layer.provide(Discovery.defaultLayer),
  Layer.provide(Config.defaultLayer),
  Layer.provide(Bus.layer),
  Layer.provide(AppFileSystem.defaultLayer),
  Layer.provide(Global.layer),
)

export function fmt(list: Info[], opts: { verbose: boolean }) {
  const described = list.filter((skill) => skill.description !== undefined)
  if (described.length === 0) return "No skills are currently available."
  if (opts.verbose) {
    return [
      "<available_skills>",
      ...described
        .toSorted((a, b) => a.name.localeCompare(b.name))
        .flatMap((skill) => [
          "  <skill>",
          `    <name>${skill.name}</name>`,
          `    <description>${skill.description}</description>`,
          `    <location>${pathToFileURL(skill.location).href}</location>`,
          "  </skill>",
        ]),
      "</available_skills>",
    ].join("\n")
  }

  return [
    "## Available Skills",
    ...described
      .toSorted((a, b) => a.name.localeCompare(b.name))
      .map((skill) => `- **${skill.name}**: ${skill.description}`),
  ].join("\n")
}

export * as Skill from "."
