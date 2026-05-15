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
 * skill → skills, tool → tools, plugin → plugins, agent → agents, spec → specs
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
  readonly list: (type?: ExtensionType, search?: string) => Effect.Effect<Extension[], string>
  /** 分页列出市场扩展，返回记录和分页信息 */
  readonly listPaged: (type?: ExtensionType, page?: number, search?: string) => Effect.Effect<PagedResult<Extension>, string>
  /** 获取扩展元数据 */
  readonly getMeta: (type: ExtensionType, slug: string) => Effect.Effect<Extension, string>
  /** 下载扩展包到指定目录；onProgress 回调报告已下载字节数和总字节数 */
  readonly download: (ext: Extension, targetDir: string, onProgress?: (downloaded: number, total: number) => void) => Effect.Effect<void, string>
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
      if (!envelope) return yield* Effect.fail(`[${response.status}] 响应体为空`)
      if (response.status === 401) return yield* Effect.fail(`[${response.status}] Unauthorized`)
      if (response.status === 404) return yield* Effect.fail(`[${response.status}] Extension not found`)
      if (response.status >= 500) return yield* Effect.fail(`[${response.status}] ${envelope.message || "Server error"}`)
      if (!response.ok) return yield* Effect.fail(`[${response.status}] ${envelope.message || "HTTP error"}`)
      if (envelope.code !== 200) return yield* Effect.fail(`[${response.status}] ${envelope.message || `Business error: code ${envelope.code}`}`)
    })

    /**
     * 自动刷新 token 包装器。
     * 执行需要认证的请求，若返回 401/Unauthorized 则自动调用 refreshToken 并重试一次。
     */
    const fetchWithRefresh = <A>(fetchFn: (headers: Record<string, string>) => Effect.Effect<A, string>): Effect.Effect<A, string> => {
      return Effect.gen(function* () {
        const headers = yield* authSvc.getAuthHeaders()
        const attempt = fetchFn(headers)

        return yield* attempt.pipe(
          Effect.catch((error: string) => {
            if (error.includes("401") || error.includes("Unauthorized")) {
              return Effect.gen(function* () {
                yield* authSvc.refreshToken()
                const newHeaders = yield* authSvc.getAuthHeaders()
                return yield* fetchFn(newHeaders)
              })
            }
            return Effect.fail(error)
          }),
        )
      })
    }

    /** 分页列出市场扩展 */
    const listPaged = Effect.fn("OmniStudioMarket.listPaged")(function* (type?: ExtensionType, page = 1, search?: string) {
      const base = yield* getApiBase()
      const entityType = toEntityType(type ?? "skill")
      let url = `${base}/api/v1/packages/${entityType}?page=${page}&size=10&withVersion=true`
      if (search) {
        url += `&keyword=${encodeURIComponent(search)}`
      }

      const envelope = yield* fetchWithRefresh((headers) =>
        Effect.gen(function* () {
          const response = yield* Effect.tryPromise({
            try: () => fetch(url, { headers }),
            catch: (error) => (error instanceof Error ? error.message : String(error)),
          })
          const envelope = yield* parseEnvelope(response)
          yield* checkError(response, envelope)
          return envelope
        }),
      )

      /** 后端列表返回字段名与 Extension 类型不完全一致，需要做映射 */
      const raw = envelope.data as {
        records?: Array<Record<string, unknown>>
        pageInfo?: PagedResult<Extension>["pageInfo"]
      }
      const records: Extension[] = (raw.records ?? []).map((r) => ({
        slug: String(r.slug ?? ""),
        name: String(r.displayName ?? r.name ?? r.slug ?? ""),
        description: String(r.description ?? ""),
        version: String(r.latestVersion ?? r.version ?? ""),
        type: (r.type as ExtensionType) ?? type ?? "skill",
        author: String(r.author ?? r.ownerId ?? ""),
        download_url: String(r.download_url ?? ""),
      }))

      return {
        records,
        pageInfo: raw.pageInfo ?? {
          currentPage: page,
          size: 10,
          totalPages: 1,
          totalElements: records.length,
          hasNext: false,
          hasPrevious: page > 1,
        },
      } as PagedResult<Extension>
    })

    /** 列出市场扩展（仅返回第一页 records，兼容旧调用方） */
    const list = Effect.fn("OmniStudioMarket.list")(function* (type?: ExtensionType, search?: string) {
      const result = yield* listPaged(type, 1, search)
      return result.records
    })

    /** 获取扩展元数据 */
    const getMeta = Effect.fn("OmniStudioMarket.getMeta")(function* (type: ExtensionType, slug: string) {
      const base = yield* getApiBase()
      const entityType = toEntityType(type)
      const url = `${base}/api/v1/packages/${entityType}/${slug}`

      const envelope = yield* fetchWithRefresh((headers) =>
        Effect.gen(function* () {
          const response = yield* Effect.tryPromise({
            try: () => fetch(url, { headers }),
            catch: (error) => (error instanceof Error ? error.message : String(error)),
          })
          const envelope = yield* parseEnvelope(response)
          yield* checkError(response, envelope)
          return envelope
        }),
      )

      /** 后端详情返回 { registry, revisions } 嵌套结构，需要映射 */
      const data = envelope.data as {
        registry?: Record<string, unknown>
        revisions?: Array<Record<string, unknown>>
      }
      const registry = data.registry ?? {}
      const revision = data.revisions?.[0] ?? {}
      const manifest = (revision.manifest as Record<string, unknown>) ?? {}

      return {
        slug: String(registry.slug ?? ""),
        name: String(registry.displayName ?? registry.name ?? registry.slug ?? ""),
        description: String(registry.description ?? ""),
        version: String(revision.version ?? ""),
        type,
        author: String(registry.ownerId ?? ""),
        download_url: String(
          revision.objectUrl ?? manifest.objectUrl ?? "",
        ),
      } as Extension
    })

    /** 下载扩展包到指定目录；使用 ReadableStream 逐块读取并写入，支持进度回调 */
    const download = Effect.fn("OmniStudioMarket.download")(function* (ext: Extension, targetDir: string, onProgress?: (downloaded: number, total: number) => void) {
      const base = yield* getApiBase()
      const entityType = toEntityType(ext.type)

      /**
       * 调用下载端点获取带预签名的 downloadUrl。
       * 后端端点：GET /v1/packages/{type}/{slug}/revisions/{version}/download
       */
      const downloadEndpoint = `${base}/api/v1/packages/${entityType}/${ext.slug}/revisions/${ext.version}/download`

      const envelope = yield* fetchWithRefresh((headers) =>
        Effect.gen(function* () {
          const urlResponse = yield* Effect.tryPromise({
            try: () => fetch(downloadEndpoint, { headers }),
            catch: (error) => (error instanceof Error ? error.message : String(error)),
          })
          const envelope = yield* parseEnvelope(urlResponse)
          if (urlResponse.status === 401) return yield* Effect.fail("Unauthorized")
          if (urlResponse.status === 404) return yield* Effect.fail("Extension not found")
          if (!urlResponse.ok) return yield* Effect.fail(envelope.message || `HTTP ${urlResponse.status}`)
          if (envelope.code !== 200) return yield* Effect.fail(envelope.message || `Business error: code ${envelope.code}`)
          return envelope
        }),
      )

      const actualUrl = String((envelope.data as { downloadUrl?: string })?.downloadUrl ?? "")
      if (!actualUrl) return yield* Effect.fail("No download URL returned")

      /** 请求预签名下载地址并使用流式读取，实时报告下载进度 */
      const fileResponse = yield* Effect.tryPromise({
        try: () => fetch(actualUrl),
        catch: (error) => (error instanceof Error ? error.message : String(error)),
      })
      if (!fileResponse.ok) return yield* Effect.fail(`Download failed: HTTP ${fileResponse.status}`)

      const contentLength = Number(fileResponse.headers.get("content-length") || "0")
      const filePath = `${targetDir}/${ext.slug}.zip`

      yield* Effect.tryPromise({
        try: async () => {
          const writer = Bun.file(filePath).writer()
          const reader = fileResponse.body!.getReader()
          let downloaded = 0
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            writer.write(value)
            downloaded += value.byteLength
            onProgress?.(downloaded, contentLength)
          }
          await writer.end()
        },
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
