import path from "path"
import { Global } from "@opencode-ai/core/global"
import { Effect, Layer, Context } from "effect"
import { AppFileSystem } from "@opencode-ai/core/filesystem"
import { extractZip } from "@/util/archive"
import { OmniStudioConfig } from "./config"
import { OmniStudioMarket } from "./market"
import { detectScripts, runScript } from "./executor"
import type { Extension, ExtensionType, ExtensionEntry, OmniStudioConfig as OmniStudioConfigType } from "./types"

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
      const tempDir = path.join(Global.Path.home, ".omni_studio", "tmp", `${ext.slug}-${Date.now()}`)
      yield* fs.ensureDir(tempDir).pipe(Effect.orDie)

      yield* Effect.ensuring(
        Effect.gen(function* () {
          yield* marketSvc.download(ext, tempDir)
          const zipPath = path.join(tempDir, `${ext.slug}.zip`)
          const targetDir = path.join(Global.Path.home, ".omni_studio", toPlural(ext.type), ext.slug)
          yield* fs.ensureDir(targetDir).pipe(Effect.orDie)
          yield* Effect.tryPromise({
            try: () => extractZip(zipPath, targetDir),
            catch: (error) => (error instanceof Error ? error.message : String(error)),
          })

          const scripts = yield* detectScripts(targetDir)
          if (scripts.install) {
            yield* runScript(targetDir, "install", scripts).pipe(
              Effect.catch((error) =>
                Effect.gen(function* () {
                  yield* fs.remove(targetDir, { recursive: true, force: true }).pipe(Effect.catch(() => Effect.void))
                  return yield* Effect.fail(error)
                }),
              ),
            )
          }

          const updated = [
            ...state.extensions.filter((e) => !(e.type === ext.type && e.slug === ext.slug)),
            {
              type: ext.type,
              slug: ext.slug,
              version: ext.version,
              enabled: true,
              installed_at: new Date().toISOString(),
            },
          ]

          yield* configSvc.writeState({ extensions: updated }).pipe(Effect.orDie).pipe(Effect.orDie)
        }),
        fs.remove(tempDir, { recursive: true, force: true }).pipe(Effect.catch(() => Effect.void)),
      )
    })

    /** 卸载扩展 */
    const uninstall = Effect.fn("OmniStudioStore.uninstall")(function* (type: ExtensionType, slug: string) {
      const state = yield* configSvc.readState()
      const entry = state.extensions.find((e) => e.type === type && e.slug === slug)
      if (!entry) return yield* Effect.fail("Extension not installed")

      const targetDir = path.join(Global.Path.home, ".omni_studio", toPlural(type), slug)

      const scripts = yield* detectScripts(targetDir)
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
    })

    /** 启用或禁用扩展 */
    const setEnabled = Effect.fn("OmniStudioStore.setEnabled")(function* (type: ExtensionType, slug: string, enabled: boolean) {
      const state = yield* configSvc.readState()
      const entry = state.extensions.find((e) => e.type === type && e.slug === slug)
      if (!entry) return yield* Effect.fail("Extension not installed")

      const updated = state.extensions.map((e) =>
        e.type === type && e.slug === slug ? { ...e, enabled } : e,
      )
      yield* configSvc.writeState({ extensions: updated }).pipe(Effect.orDie)
    })

    /** 查看登录状态和本地扩展列表 */
    const getStatus = Effect.fn("OmniStudioStore.getStatus")(function* () {
      const config = yield* configSvc.read()
      const state = yield* configSvc.readState()
      return { config, extensions: state.extensions }
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
