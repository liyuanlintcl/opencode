import path from "path"
import { Global } from "@opencode-ai/core/global"
import { Effect, Layer, Context } from "effect"
import { AppFileSystem } from "@opencode-ai/core/filesystem"
import type { OmniStudioConfig, OmniStudioState } from "./types"

/** 登录配置文件路径：`~/.omni_studio/omni-studio.json` */
const configFile = () => path.join(Global.Path.home, ".omni_studio", "omni-studio.json")

/** 本地扩展状态文件路径：`~/.omni_studio/state.json` */
const stateFile = () => path.join(Global.Path.home, ".omni_studio", "state.json")

/**
 * Omni Studio 配置管理服务接口。
 * 负责读写登录配置（omni-studio.json）和本地扩展状态（state.json）。
 */
export interface Interface {
  /** 读取登录配置；文件不存在时返回 null */
  readonly read: () => Effect.Effect<OmniStudioConfig | null>
  /** 写入登录配置，文件权限设置为 0o600 */
  readonly write: (config: OmniStudioConfig) => Effect.Effect<void>
  /** 删除登录配置；文件不存在时静默成功 */
  readonly remove: () => Effect.Effect<void>
  /** 设置 api_base；保留已有 token 和用户信息 */
  readonly setEndpoints: (apiBase: string) => Effect.Effect<void>
  /** 读取本地扩展状态；文件不存在时返回 `{ extensions: [] }` */
  readonly readState: () => Effect.Effect<OmniStudioState>
  /** 写入本地扩展状态，文件权限设置为 0o600 */
  readonly writeState: (state: OmniStudioState) => Effect.Effect<void>
}

/**
 * 规范化 api_base 地址。
 * 去除首尾空白和尾部斜杠，确保拼接路径时不会出现双斜杠。
 */
function normalizeApiBase(base: string): string {
  let result = base.trim()
  while (result.endsWith("/")) {
    result = result.slice(0, -1)
  }
  return result
}

/**
 * Omni Studio 配置管理 Effect Service。
 * 通过 `Context.Service` 注册，可被其他模块依赖注入。
 */
export class Service extends Context.Service<Service, Interface>()("@opencode/OmniStudioConfig") {}

/**
 * Omni Studio 配置管理 Layer 实现。
 * 依赖 `AppFileSystem.Service` 进行文件操作。
 */
export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const fs = yield* AppFileSystem.Service

    /** 读取登录配置；返回前对 api_base 做规范化 */
    const read = Effect.fn("OmniStudioConfig.read")(function* () {
      return yield* fs.readJson(configFile()).pipe(
        Effect.map((data) => {
          const config = data as OmniStudioConfig
          if (config.api_base) {
            config.api_base = normalizeApiBase(config.api_base)
          }
          return config
        }),
        Effect.catch(() => Effect.succeed(null)),
      )
    })

    /** 写入登录配置，自动创建父目录 */
    const write = Effect.fn("OmniStudioConfig.write")(function* (config: OmniStudioConfig) {
      yield* fs.ensureDir(path.dirname(configFile())).pipe(Effect.orDie)
      yield* fs.writeJson(configFile(), config, 0o600).pipe(Effect.orDie)
    })

    /** 删除登录配置 */
    const remove = Effect.fn("OmniStudioConfig.remove")(function* () {
      yield* fs.remove(configFile()).pipe(Effect.catch(() => Effect.void))
    })

    /** 设置 api_base；切换服务器时清空已有 token 和用户信息；存储前规范化 */
    const setEndpoints = Effect.fn("OmniStudioConfig.setEndpoints")(function* (apiBase: string) {
      const config: OmniStudioConfig = {
        api_base: normalizeApiBase(apiBase),
        access_token: "",
        refresh_token: "",
        user: { id: "", username: "" },
      }
      yield* write(config)
    })

    /** 读取本地扩展状态 */
    const readState = Effect.fn("OmniStudioConfig.readState")(function* () {
      return yield* fs.readJson(stateFile()).pipe(
        Effect.map((data) => data as OmniStudioState),
        Effect.catch(() => Effect.succeed({ extensions: [] })),
      )
    })

    /** 写入本地扩展状态，自动创建父目录 */
    const writeState = Effect.fn("OmniStudioConfig.writeState")(function* (state: OmniStudioState) {
      yield* fs.ensureDir(path.dirname(stateFile())).pipe(Effect.orDie)
      yield* fs.writeJson(stateFile(), state, 0o600).pipe(Effect.orDie)
    })

    return Service.of({
      read,
      write,
      remove,
      setEndpoints,
      readState,
      writeState,
    })
  }),
)

/** 默认 Layer，自动注入 `AppFileSystem.defaultLayer` */
export const defaultLayer = layer.pipe(Layer.provide(AppFileSystem.defaultLayer))

export * as OmniStudioConfig from "./config"
