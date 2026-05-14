import path from "path"
import { Global } from "@opencode-ai/core/global"
import { Effect, Layer, Context } from "effect"
import { AppFileSystem } from "@opencode-ai/core/filesystem"
import { extractZip } from "@/util/archive"
import { OmniStudioConfig } from "./config"
import { OmniStudioMarket } from "./market"
import { detectScripts, runScript } from "./executor"
import type { Extension, ExtensionType, ExtensionEntry, OmniStudioConfig as OmniStudioConfigType } from "./types"
import NodeFS from "fs/promises"
import { watch } from "fs"
import { GlobalBus } from "@/bus/global"

/** 将 ExtensionType 单数映射为目录名复数形式 */
function toPlural(type: ExtensionType): string {
  return type + "s"
}

/**
 * Omni Studio Store 服务接口。
 * 负责扩展的安装、卸载、启用/禁用以及状态查询。
 */
export interface Interface {
  /** 安装扩展：下载扩展包、解压到本地目录、更新 state.json */
  readonly install: (ext: Extension) => Effect.Effect<void, string>
  /** 卸载扩展：删除本地目录、从 state.json 移除记录 */
  readonly uninstall: (type: ExtensionType, slug: string) => Effect.Effect<void, string>
  /** 启用或禁用扩展 */
  readonly setEnabled: (type: ExtensionType, slug: string, enabled: boolean) => Effect.Effect<void, string>
  /** 查看登录状态和本地扩展列表 */
  readonly getStatus: () => Effect.Effect<{ config: OmniStudioConfigType | null; extensions: ExtensionEntry[] }, string>
}

/**
 * Omni Studio Store Effect Service。
 * 通过 `Context.Service` 注册，可被其他模块依赖注入。
 */
export class Service extends Context.Service<Service, Interface>()("@opencode/OmniStudioStore") {}

/**
 * Omni Studio Store Layer 实现。
 * 依赖 `OmniStudioConfig.Service` 读写状态与配置，
 * 依赖 `OmniStudioMarket.Service` 下载扩展包，
 * 依赖 `AppFileSystem.Service` 进行目录操作。
 */
export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const configSvc = yield* OmniStudioConfig.Service
    const marketSvc = yield* OmniStudioMarket.Service
    const fs = yield* AppFileSystem.Service

    /** 安装扩展 */
    const install = Effect.fn("OmniStudioStore.install")(function* (ext: Extension) {
      const state = yield* configSvc.readState()
      const cacheDir = path.join(Global.Path.home, ".omni_studio", "cache", toPlural(ext.type))
      const cachePath = path.join(cacheDir, `${ext.slug}-${ext.version}.zip`)
      const downloadOutputPath = path.join(cacheDir, `${ext.slug}.zip`)

      /** 查找本地是否已有同类型同 slug 的扩展，记录其启用状态用于更新时保留 */
      const existing = state.extensions.find((e) => e.type === ext.type && e.slug === ext.slug)

      yield* fs.ensureDir(cacheDir).pipe(Effect.orDie)

      /** 若缓存不存在则下载，已下载的 zip 保留在缓存目录供下次复用 */
      const zipPath = yield* Effect.gen(function* () {
        const cacheExists = yield* Effect.tryPromise({
          try: () => Bun.file(cachePath).exists(),
          catch: () => false,
        }).pipe(Effect.orElseSucceed(() => false))

        if (cacheExists) {
          return cachePath
        }

        yield* marketSvc.download(ext, cacheDir)

        yield* Effect.tryPromise({
          try: () => NodeFS.rename(downloadOutputPath, cachePath),
          catch: (error) => (error instanceof Error ? error.message : String(error)),
        })

        return cachePath
      })

      const targetDir = path.join(Global.Path.home, ".omni_studio", toPlural(ext.type), ext.slug)

      /** 若目标目录已存在（更新场景），先删除旧目录避免旧版本文件残留 */
      const targetExists = yield* fs.isDir(targetDir).pipe(Effect.orElseSucceed(() => false))
      if (targetExists) {
        yield* fs.remove(targetDir, { recursive: true, force: true }).pipe(Effect.catch(() => Effect.void))
      }

      yield* fs.ensureDir(targetDir).pipe(Effect.orDie)
      yield* Effect.tryPromise({
        try: () => extractZip(zipPath, targetDir),
        catch: (error) => (error instanceof Error ? error.message : String(error)),
      })

      const scripts = yield* detectScripts(targetDir)
      if (scripts.install) {
        yield* runScript(targetDir, "install", scripts).pipe(
          Effect.catch((error) => Effect.fail(error)),
        )
      }

      /** 更新 state.json：保留原有启用状态（更新场景），新安装默认禁用 */
      const updated = [
        ...state.extensions.filter((e) => !(e.type === ext.type && e.slug === ext.slug)),
        {
          type: ext.type,
          slug: ext.slug,
          name: ext.name,
          version: ext.version,
          enabled: existing?.enabled ?? false,
          installed_at: new Date().toISOString(),
        },
      ]

      /** 安装成功后清理 cache 目录中同 slug 的旧版本 zip，避免磁盘空间无限增长 */
      yield* Effect.tryPromise({
        try: async () => {
          const entries = await NodeFS.readdir(cacheDir)
          for (const entry of entries) {
            if (entry.startsWith(`${ext.slug}-`) && entry.endsWith(".zip") && entry !== `${ext.slug}-${ext.version}.zip`) {
              await NodeFS.rm(path.join(cacheDir, entry), { force: true })
            }
          }
        },
        catch: () => {},
      }).pipe(Effect.catch(() => Effect.void))

      yield* configSvc.writeState({ extensions: updated }).pipe(Effect.orDie).pipe(Effect.orDie)
      GlobalBus.emit("event", { payload: { type: "omni-studio:extension-changed" } })
    })

    /** 卸载扩展 */
    const uninstall = Effect.fn("OmniStudioStore.uninstall")(function* (type: ExtensionType, slug: string) {
      const state = yield* configSvc.readState()
      const entry = state.extensions.find((e) => e.type === type && e.slug === slug)
      if (!entry) return yield* Effect.fail("Extension not installed")

      const targetDir = path.join(Global.Path.home, ".omni_studio", toPlural(type), slug)
      const scripts = yield* detectScripts(targetDir)

      /** 若扩展当前处于启用状态，先执行 stop 脚本 */
      if (entry.enabled && scripts.stop) {
        yield* runScript(targetDir, "stop", scripts).pipe(
          Effect.catch((error) =>
            Effect.sync(() => {
              console.warn(`Stop script failed for ${slug}: ${error}`)
              return { exitCode: 0, stdout: "", stderr: "" }
            }),
          ),
        )
      }

      /** 执行 uninstall 脚本 */
      if (scripts.uninstall) {
        yield* runScript(targetDir, "uninstall", scripts).pipe(
          Effect.catch((error) =>
            Effect.sync(() => {
              console.warn(`Uninstall script failed for ${slug}: ${error}`)
              return { exitCode: 0, stdout: "", stderr: "" }
            }),
          ),
        )
      }

      yield* fs.remove(targetDir, { recursive: true, force: true }).pipe(Effect.catch(() => Effect.void))

      const updated = state.extensions.filter((e) => !(e.type === type && e.slug === slug))
      yield* configSvc.writeState({ extensions: updated }).pipe(Effect.orDie)
      GlobalBus.emit("event", { payload: { type: "omni-studio:extension-changed" } })
    })

    /** 启用或禁用扩展 */
    const setEnabled = Effect.fn("OmniStudioStore.setEnabled")(function* (type: ExtensionType, slug: string, enabled: boolean) {
      const state = yield* configSvc.readState()
      const entry = state.extensions.find((e) => e.type === type && e.slug === slug)
      if (!entry) return yield* Effect.fail("Extension not installed")

      const targetDir = path.join(Global.Path.home, ".omni_studio", toPlural(type), slug)
      const scripts = yield* detectScripts(targetDir)

      /** 启用时执行 start 脚本；失败则保持禁用状态 */
      if (enabled && scripts.start) {
        yield* runScript(targetDir, "start", scripts).pipe(
          Effect.catch((error) =>
            Effect.gen(function* () {
              console.warn(`Start script failed for ${slug}: ${error}`)
              return yield* Effect.fail(`Enable failed: ${error}`)
            }),
          ),
        )
      }

      /** 更新状态 */
      const updated = state.extensions.map((e) =>
        e.type === type && e.slug === slug ? { ...e, enabled } : e,
      )
      yield* configSvc.writeState({ extensions: updated }).pipe(Effect.orDie)
      GlobalBus.emit("event", { payload: { type: "omni-studio:extension-changed" } })

      /** 禁用时执行 stop 脚本；失败仅警告 */
      if (!enabled && scripts.stop) {
        yield* runScript(targetDir, "stop", scripts).pipe(
          Effect.catch((error) =>
            Effect.sync(() => {
              console.warn(`Stop script failed for ${slug}: ${error}`)
              return { exitCode: 0, stdout: "", stderr: "" }
            }),
          ),
        )
      }
    })

    /** 查看登录状态和本地扩展列表 */
    const getStatus = Effect.fn("OmniStudioStore.getStatus")(function* () {
      const config = yield* configSvc.read()
      const state = yield* configSvc.readState()
      return { config, extensions: state.extensions }
    })

    /** 监听扩展目录变化，自动清理 state.json 中已不存在的扩展记录 */
    const omniStudioDir = path.join(Global.Path.home, ".omni_studio")
    const extensionDirs = ["skills", "agents", "plugins", "tools"]
    watch(omniStudioDir, { recursive: true }, async (_eventType, filename) => {
      if (!filename || typeof filename !== "string") return
      const parts = filename.split(path.sep)
      // 只关注 skills/xxx、agents/xxx 等扩展目录级别的变化
      if (parts.length < 2 || !extensionDirs.includes(parts[0])) return

      const typeDir = parts[0]
      const slug = parts[1]
      const type = typeDir.slice(0, -1) as ExtensionType

      // 检查扩展目录是否还存在
      try {
        const extDir = path.join(omniStudioDir, typeDir, slug)
        await NodeFS.access(extDir)
        return // 目录还在，无需清理
      } catch {
        // 目录已不存在，继续清理 state.json
      }

      try {
        const statePath = path.join(omniStudioDir, "state.json")
        const content = await NodeFS.readFile(statePath, "utf-8")
        const state = JSON.parse(content) as import("./types").OmniStudioState

        const beforeCount = state.extensions.length
        state.extensions = state.extensions.filter(
          (e) => !(e.type === type && e.slug === slug),
        )

        if (state.extensions.length < beforeCount) {
          await NodeFS.writeFile(statePath, JSON.stringify(state, null, 2), { mode: 0o600 })
          console.log(`[OmniStudio] 已自动清理删除的扩展记录：${type}/${slug}`)
        }
      } catch {
        // 读取或写入失败时静默忽略，避免 watcher 崩溃
      }
    })

    return Service.of({
      install,
      uninstall,
      setEnabled,
      getStatus,
    })
  }),
)

/** 默认 Layer，自动注入 `OmniStudioMarket.defaultLayer` */
export const defaultLayer: Layer.Layer<Service> = layer.pipe(
  Layer.provide(OmniStudioMarket.defaultLayer),
  Layer.provide(OmniStudioConfig.defaultLayer),
  Layer.provide(AppFileSystem.defaultLayer),
)

export * as OmniStudioStore from "./store"
