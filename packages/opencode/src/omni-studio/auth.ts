import { Effect, Layer, Context } from "effect"
import { OmniStudioConfig } from "./config"
import type { OmniStudioConfig as OmniStudioConfigType } from "./types"

/**
 * Omni Studio 认证服务接口。
 * 提供登录、登出、获取认证请求头及登录状态检查功能。
 * login 不再接收地址参数，从配置中读取预先设置的 api_base。
 */
export interface Interface {
  /** 登录：调用认证 API 并持久化 token；api_base 从配置读取 */
  readonly login: (credentials: { username: string; password: string }) => Effect.Effect<OmniStudioConfigType, string>
  /** 登出：清除本地登录配置 */
  readonly logout: () => Effect.Effect<void>
  /** 获取认证请求头；未登录时返回失败 */
  readonly getAuthHeaders: () => Effect.Effect<Record<string, string>, string>
  /** 检查当前是否已登录 */
  readonly isLoggedIn: () => Effect.Effect<boolean>
  /** 使用 refresh_token 刷新 access_token；刷新成功后更新本地配置 */
  readonly refreshToken: () => Effect.Effect<OmniStudioConfigType, string>
}

/**
 * Omni Studio 认证 Effect Service。
 * 通过 `Context.Service` 注册，可被其他模块依赖注入。
 */
export class Service extends Context.Service<Service, Interface>()("@opencode/OmniStudioAuth") {}

/**
 * Omni Studio 认证 Layer 实现。
 * 依赖 `OmniStudioConfig.Service` 进行配置持久化。
 */
export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const configSvc = yield* OmniStudioConfig.Service

    /** 登录：从配置读取 api_base，仅更新 token 和用户信息 */
    const login = Effect.fn("OmniStudioAuth.login")(function* (credentials: { username: string; password: string }) {
      const existing = yield* configSvc.read()
      const apiBase = existing?.api_base
      if (!apiBase) {
        return yield* Effect.fail("api_base not configured, run `opencode omni-studio setup` first")
      }

      const response = yield* Effect.tryPromise({
        try: () =>
          fetch(`${apiBase}/api/auth/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(credentials),
          }),
        catch: (error) => (error instanceof Error ? error.message : String(error)),
      })

      if (!response.ok) {
        const text = yield* Effect.tryPromise({
          try: () => response.text(),
          catch: () => "Login failed",
        })
        return yield* Effect.fail(text || `Login failed with status ${response.status}`)
      }

      const result = yield* Effect.tryPromise({
        try: () => response.json() as Promise<{
          code: number
          data: {
            accessToken: string
            refreshToken: string
            userId: number
            username: string
          }
          message: string
        }>,
        catch: (error) => (error instanceof Error ? error.message : String(error)),
      })

      if (result.code !== 200) {
        return yield* Effect.fail(result.message || `Login failed with code ${result.code}`)
      }

      const data = result.data

      /** 保留已有的 api_base，仅更新 token 和用户信息 */
      const config: OmniStudioConfigType = {
        api_base: existing?.api_base ?? apiBase,
        access_token: data.accessToken,
        refresh_token: data.refreshToken,
        user: { id: String(data.userId), username: data.username },
      }

      yield* configSvc.write(config)
      return config
    })

    /** 登出：清除本地登录配置 */
    const logout = Effect.fn("OmniStudioAuth.logout")(function* () {
      yield* configSvc.remove()
    })

    /** 获取认证请求头；未登录时返回失败 */
    const getAuthHeaders = Effect.fn("OmniStudioAuth.getAuthHeaders")(function* () {
      const config = yield* configSvc.read()
      if (!config) return yield* Effect.fail("Not logged in")
      return { Authorization: `Bearer ${config.access_token}` }
    })

    /** 检查当前是否已登录 */
    const isLoggedIn = Effect.fn("OmniStudioAuth.isLoggedIn")(function* () {
      const config = yield* configSvc.read()
      return config !== null
    })

    /** 使用 refresh_token 刷新 access_token；刷新成功后更新本地配置 */
    const refreshToken = Effect.fn("OmniStudioAuth.refreshToken")(function* () {
      const config = yield* configSvc.read()
      if (!config) return yield* Effect.fail("Not logged in")

      const response = yield* Effect.tryPromise({
        try: () =>
          fetch(`${config.api_base}/api/auth/auth/refresh-token`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${config.access_token}`,
            },
            body: JSON.stringify({ accessToken: config.access_token }),
          }),
        catch: (error) => (error instanceof Error ? error.message : String(error)),
      })

      if (!response.ok) {
        const text = yield* Effect.tryPromise({
          try: () => response.text(),
          catch: () => "Refresh token failed",
        })
        return yield* Effect.fail(text || `Refresh token failed with status ${response.status}`)
      }

      const result = yield* Effect.tryPromise({
        try: () => response.json() as Promise<{
          code: number
          data: {
            accessToken: string
            refreshToken: string
          }
          message: string
        }>,
        catch: (error) => (error instanceof Error ? error.message : String(error)),
      })

      if (result.code !== 200) {
        return yield* Effect.fail(result.message || `Refresh token failed with code ${result.code}`)
      }

      const data = result.data

      /** 保留已有的 api_base 和用户信息，仅更新 token */
      const updated: OmniStudioConfigType = {
        api_base: config.api_base,
        access_token: data.accessToken,
        refresh_token: data.refreshToken,
        user: config.user,
      }

      yield* configSvc.write(updated)
      return updated
    })

    return Service.of({
      login,
      logout,
      getAuthHeaders,
      isLoggedIn,
      refreshToken,
    })
  }),
)

/** 默认 Layer，自动注入 `OmniStudioConfig.defaultLayer` */
export const defaultLayer = layer.pipe(Layer.provide(OmniStudioConfig.defaultLayer))

export * as OmniStudioAuth from "./auth"
