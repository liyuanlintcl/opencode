import { Effect, Layer, Context } from "effect"
import { OmniStudioAuth } from "./auth"
import { OmniStudioConfig } from "./config"
import type { Extension, ExtensionType, PagedResult } from "./types"

/**
 * 后端统一响应信封结构：{ code, message, success, data }
 */
interface ApiResponse {
  code: number
  message: string
  success: boolean
  data: unknown
}

/**
 * 将前端 ExtensionType（单数）映射为后端 entity_type（复数）。
 * skill → skills, tool → tools, plugin → plugins, agent → agents
 */
function toEntityType(type: ExtensionType): string {
  return type + "s"
}

/**
 * Omni Studio Marketplace HTTP 客户端接口。
 * 提供扩展列表查询、元数据获取及扩展包下载功能。
 */
export interface Interface {
  /** 列出市场扩展（仅返回第一页数据，兼容旧调用方） */
  readonly list: (type?: ExtensionType) => Effect.Effect<Extension[], string>
  /** 分页列出市场扩展，返回记录和分页信息 */
  readonly listPaged: (type?: ExtensionType, page?: number) => Effect.Effect<PagedResult<Extension>, string>
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

    /** 获取 API 基础地址；config.read() 已做规范化 */
    const getApiBase = Effect.fn("OmniStudioMarket.getApiBase")(function* () {
      const config = yield* configSvc.read()
      if (!config) return yield* Effect.fail("Not logged in")
      return config.api_base
    })

    /**
     * 统一解析后端响应信封。
     * 后端返回格式：{ code, message, success, data }
     */
    const parseEnvelope = Effect.fn("OmniStudioMarket.parseEnvelope")(function* (response: Response) {
      return yield* Effect.tryPromise({
        try: () => response.json() as Promise<ApiResponse>,
        catch: (error) => (error instanceof Error ? error.message : String(error)),
      })
    })

    /**
     * 统一处理 HTTP 及业务错误。
     * 401 → Unauthorized，404 → Extension not found，5xx → 后端内部错误。
     * 业务码非 200 时返回 [HTTP状态码] 错误信息，便于区分网络错误和 token 过期。
     */
    const checkError = Effect.fn("OmniStudioMarket.checkError")(function* (response: Response, envelope: ApiResponse) {
      if (response.status === 401) return yield* Effect.fail(`[${response.status}] Unauthorized`)
      if (response.status === 404) return yield* Effect.fail(`[${response.status}] Extension not found`)
      if (response.status >= 500) return yield* Effect.fail(`[${response.status}] ${envelope.message || "Server error"}`)
      if (!response.ok) return yield* Effect.fail(`[${response.status}] ${envelope.message || "HTTP error"}`)
      if (envelope.code !== 200) return yield* Effect.fail(`[${response.status}] ${envelope.message || `Business error: code ${envelope.code}`}`)
    })

    /** 分页列出市场扩展 */
    const listPaged = Effect.fn("OmniStudioMarket.listPaged")(function* (type?: ExtensionType, page = 1) {
      const base = yield* getApiBase()
      const headers = yield* authSvc.getAuthHeaders()
      const entityType = toEntityType(type ?? "skill")
      const url = `${base}/api/v1/packages/${entityType}?page=${page}&size=10`
      const response = yield* Effect.tryPromise({
        try: () => fetch(url, { headers }),
        catch: (error) => (error instanceof Error ? error.message : String(error)),
      })
      const envelope = yield* parseEnvelope(response)
      yield* checkError(response, envelope)
      return envelope.data as PagedResult<Extension>
    })

    /** 列出市场扩展（仅返回第一页 records，兼容旧调用方） */
    const list = Effect.fn("OmniStudioMarket.list")(function* (type?: ExtensionType) {
      const result = yield* listPaged(type, 1)
      return result.records
    })

    /** 获取扩展元数据 */
    const getMeta = Effect.fn("OmniStudioMarket.getMeta")(function* (type: ExtensionType, slug: string) {
      const base = yield* getApiBase()
      const headers = yield* authSvc.getAuthHeaders()
      const entityType = toEntityType(type)
      const response = yield* Effect.tryPromise({
        try: () => fetch(`${base}/api/v1/packages/${entityType}/${slug}`, { headers }),
        catch: (error) => (error instanceof Error ? error.message : String(error)),
      })
      const envelope = yield* parseEnvelope(response)
      yield* checkError(response, envelope)
      return envelope.data as Extension
    })

    /** 下载扩展包到指定目录 */
    const download = Effect.fn("OmniStudioMarket.download")(function* (ext: Extension, targetDir: string) {
      const base = yield* getApiBase()
      const headers = yield* authSvc.getAuthHeaders()
      const entityType = toEntityType(ext.type)

      /**
       * 先调用下载端点获取下载地址。
       * 后端端点：GET /v1/packages/{type}/{slug}/revisions/{version}/download
       */
      const downloadUrl = `${base}/api/v1/packages/${entityType}/${ext.slug}/revisions/${ext.version}/download`
      const urlResponse = yield* Effect.tryPromise({
        try: () => fetch(downloadUrl, { headers }),
        catch: (error) => (error instanceof Error ? error.message : String(error)),
      })

      /** 若端点直接返回文件流，则直接写入 */
      if (urlResponse.ok && urlResponse.headers.get("content-type")?.includes("application/octet-stream")) {
        const buffer = yield* Effect.tryPromise({
          try: () => urlResponse.arrayBuffer(),
          catch: (error) => (error instanceof Error ? error.message : String(error)),
        })
        const filePath = `${targetDir}/${ext.slug}.zip`
        yield* Effect.tryPromise({
          try: () => Bun.write(filePath, buffer),
          catch: (error) => (error instanceof Error ? error.message : String(error)),
        })
        return
      }

      /** 否则解析响应获取实际下载地址 */
      const envelope = yield* parseEnvelope(urlResponse)
      if (urlResponse.status === 401) return yield* Effect.fail("Unauthorized")
      if (urlResponse.status === 404) return yield* Effect.fail("Extension not found")
      if (!urlResponse.ok) return yield* Effect.fail(envelope.message || `HTTP ${urlResponse.status}`)
      if (envelope.code !== 200) return yield* Effect.fail(envelope.message || `Business error: code ${envelope.code}`)

      const actualUrl = (envelope.data as { url?: string })?.url
      if (!actualUrl) return yield* Effect.fail("No download URL returned")

      /** 请求实际下载地址并保存文件 */
      const fileResponse = yield* Effect.tryPromise({
        try: () => fetch(actualUrl, { headers }),
        catch: (error) => (error instanceof Error ? error.message : String(error)),
      })
      if (!fileResponse.ok) return yield* Effect.fail(`Download failed: HTTP ${fileResponse.status}`)

      const buffer = yield* Effect.tryPromise({
        try: () => fileResponse.arrayBuffer(),
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
      listPaged,
      getMeta,
      download,
    })
  }),
)

/** 默认 Layer，自动注入 `OmniStudioAuth.defaultLayer` 和 `OmniStudioConfig.defaultLayer` */
export const defaultLayer: Layer.Layer<Service> = layer.pipe(
  Layer.provide(OmniStudioAuth.defaultLayer),
  Layer.provide(OmniStudioConfig.defaultLayer),
)

export * as OmniStudioMarket from "./market"
