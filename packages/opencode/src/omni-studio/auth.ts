import { Effect, Layer, Context } from "effect"
import { OmniStudioConfig } from "./config"
import type { OmniStudioConfig as OmniStudioConfigType } from "./types"

/**
 * Omni Studio 认证服务接口。
 * 提供登录、登出、获取认证请求头及登录状态检查功能。
 */
export interface Interface {
  /** 登录：调用认证 API 并持久化 token */
  readonly login: (credentials: { username: string; password: string }, apiBase: string) => Effect.Effect<OmniStudioConfigType, string>
  /** 登出：清除本地登录配置 */
  readonly logout: () => Effect.Effect<void>
  /** 获取认证请求头；未登录时返回失败 */
  readonly getAuthHeaders: () => Effect.Effect<Record<string, string>, string>
  /** 检查当前是否已登录 */
  readonly isLoggedIn: () => Effect.Effect<boolean>
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

    /** 登录：调用认证 API 并持久化 token */
    const login = Effect.fn("OmniStudioAuth.login")(function* (credentials: { username: string; password: string }, apiBase: string) {
      const response = yield* Effect.tryPromise({
        try: () =>
          fetch(`${apiBase}/auth/auth/login`, {
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

      const data = yield* Effect.tryPromise({
        try: () => response.json() as Promise<{
          accessToken: string
          refreshToken: string
          user: { id: string; username: string }
        }>,
        catch: (error) => (error instanceof Error ? error.message : String(error)),
      })

      const config: OmniStudioConfigType = {
        api_base: apiBase,
        auth_base: apiBase,
        access_token: data.accessToken,
        refresh_token: data.refreshToken,
        user: data.user,
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

    return Service.of({
      login,
      logout,
      getAuthHeaders,
      isLoggedIn,
    })
  }),
)

/** 默认 Layer，自动注入 `OmniStudioConfig.defaultLayer` */
export const defaultLayer = layer.pipe(Layer.provide(OmniStudioConfig.defaultLayer))

export * as OmniStudioAuth from "./auth"
