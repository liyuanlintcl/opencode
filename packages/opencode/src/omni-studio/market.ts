import { Effect, Layer, Context } from "effect"
import { OmniStudioAuth } from "./auth"
import { OmniStudioConfig } from "./config"
import type { Extension, ExtensionType } from "./types"

/**
 * Omni Studio Marketplace HTTP 客户端接口。
 * 提供扩展列表查询、元数据获取及扩展包下载功能。
 */
export interface Interface {
  /** 列出市场扩展 */
  readonly list: (type?: ExtensionType) => Effect.Effect<Extension[], string>
  /** 获取扩展元数据 */
  readonly getMeta: (type: ExtensionType, slug: string) => Effect.Effect<Extension, string>
  /** 下载扩展包到指定目录 */
  readonly download: (ext: Extension, targetDir: string) => Effect.Effect<void, string>
}

/**
 * Omni Studio Marketplace Effect Service。
 * 通过 `Context.Service` 注册，可被其他模块依赖注入。
 */
export class Service extends Context.Service<Service, Interface>()("@opencode/OmniStudioMarket") {}

/**
 * Omni Studio Marketplace Layer 实现。
 * 依赖 `OmniStudioAuth.Service` 获取认证请求头，
 * 依赖 `OmniStudioConfig.Service` 读取 API 基础地址。
 */
export const layer: Layer.Layer<Service, never, OmniStudioAuth.Service | OmniStudioConfig.Service> = Layer.effect(
  Service,
  Effect.gen(function* () {
    const authSvc = yield* OmniStudioAuth.Service
    const configSvc = yield* OmniStudioConfig.Service

    /** 获取 API 基础地址并去除尾部斜杠；未登录时返回失败 */
    const getApiBase = Effect.fn("OmniStudioMarket.getApiBase")(function* () {
      const config = yield* configSvc.read()
      if (!config) return yield* Effect.fail("Not logged in")
      return config.api_base.endsWith("/") ? config.api_base.slice(0, -1) : config.api_base
    })

    /** 统一处理 HTTP 响应状态码 */
    const handleResponse = Effect.fn("OmniStudioMarket.handleResponse")(function* (response: Response) {
      if (response.status === 401) return yield* Effect.fail("Unauthorized")
      if (response.status === 404) return yield* Effect.fail("Extension not found")
      if (!response.ok) return yield* Effect.fail(response.statusText || `HTTP ${response.status}`)
      return response
    })

    /** 列出市场扩展 */
    const list = Effect.fn("OmniStudioMarket.list")(function* (type?: ExtensionType) {
      const base = yield* getApiBase()
      const headers = yield* authSvc.getAuthHeaders()
      const url = type ? `${base}/extensions?type=${type}` : `${base}/extensions`
      const response = yield* Effect.tryPromise({
        try: () => fetch(url, { headers }),
        catch: (error) => (error instanceof Error ? error.message : String(error)),
      })
      const ok = yield* handleResponse(response)
      return yield* Effect.tryPromise({
        try: () => ok.json() as Promise<Extension[]>,
        catch: (error) => (error instanceof Error ? error.message : String(error)),
      })
    })

    /** 获取扩展元数据 */
    const getMeta = Effect.fn("OmniStudioMarket.getMeta")(function* (type: ExtensionType, slug: string) {
      const base = yield* getApiBase()
      const headers = yield* authSvc.getAuthHeaders()
      const response = yield* Effect.tryPromise({
        try: () => fetch(`${base}/extensions/${type}/${slug}`, { headers }),
        catch: (error) => (error instanceof Error ? error.message : String(error)),
      })
      const ok = yield* handleResponse(response)
      return yield* Effect.tryPromise({
        try: () => ok.json() as Promise<Extension>,
        catch: (error) => (error instanceof Error ? error.message : String(error)),
      })
    })

    /** 下载扩展包到指定目录 */
    const download = Effect.fn("OmniStudioMarket.download")(function* (ext: Extension, targetDir: string) {
      const base = yield* getApiBase()
      const headers = yield* authSvc.getAuthHeaders()
      const url = ext.download_url || `${base}/extensions/${ext.type}/${ext.slug}/download`
      const response = yield* Effect.tryPromise({
        try: () => fetch(url, { headers }),
        catch: (error) => (error instanceof Error ? error.message : String(error)),
      })
      yield* handleResponse(response)
      const buffer = yield* Effect.tryPromise({
        try: () => response.arrayBuffer(),
        catch: (error) => (error instanceof Error ? error.message : String(error)),
      })
      const filePath = `${targetDir}/${ext.slug}.zip`
      yield* Effect.tryPromise({
        try: () => Bun.write(filePath, buffer),
        catch: (error) => (error instanceof Error ? error.message : String(error)),
      })
    })

    return Service.of({
      list,
      getMeta,
      download,
    })
  }),
)

/** 默认 Layer，自动注入 `OmniStudioAuth.defaultLayer` */
export const defaultLayer: Layer.Layer<Service> = layer.pipe(
  Layer.provide(OmniStudioAuth.defaultLayer),
  Layer.provide(OmniStudioConfig.defaultLayer),
)

export * as OmniStudioMarket from "./market"
