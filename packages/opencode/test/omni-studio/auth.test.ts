import { test, expect, describe, beforeEach, afterEach } from "bun:test"
import { Effect } from "effect"
import path from "path"
import fs from "fs/promises"
import os from "os"
import { AppFileSystem } from "@opencode-ai/core/filesystem"
import { OmniStudioAuth } from "../../src/omni-studio/auth"

/** 真实后端 API 基础地址 */
const API_BASE = process.env.OMNI_STUDIO_API_BASE ?? "http://127.0.0.1:18000/api/v1"

/** 测试账号（从环境变量读取，未设置时跳过依赖真实后端的测试） */
const TEST_USERNAME = process.env.OMNI_STUDIO_TEST_USERNAME
const TEST_PASSWORD = process.env.OMNI_STUDIO_TEST_PASSWORD

/** 后端是否可用（在 beforeEach 中探测） */
let backendAvailable = false

/**
 * 辅助函数：运行需要 OmniStudioAuth.Service 的 Effect。
 * 自动注入默认 Layer（含 OmniStudioConfig + AppFileSystem）。
 */
const run = <A, E>(eff: Effect.Effect<A, E, OmniStudioAuth.Service>) =>
  Effect.runPromise(eff.pipe(Effect.provide(OmniStudioAuth.defaultLayer), Effect.provide(AppFileSystem.defaultLayer)))

describe("OmniStudioAuth", () => {
  let tmpHome: string

  beforeEach(async () => {
    tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), "omni-studio-auth-"))
    process.env.OPENCODE_TEST_HOME = tmpHome

    /** 探测后端是否可用 */
    try {
      const res = await fetch(API_BASE, { method: "HEAD", signal: AbortSignal.timeout(2000) })
      backendAvailable = res.status < 500
    } catch {
      backendAvailable = false
    }
  })

  afterEach(async () => {
    delete process.env.OPENCODE_TEST_HOME
    await fs.rm(tmpHome, { recursive: true, force: true })
  })

  /**
   * 依赖真实后端的测试：
   * 如果后端不可用或未配置测试账号，则跳过。
   */
  describe("with real backend", () => {
    beforeEach(() => {
      if (!backendAvailable) {
        console.log(`[skip] Backend ${API_BASE} not available`)
      }
      if (!TEST_USERNAME || !TEST_PASSWORD) {
        console.log("[skip] OMNI_STUDIO_TEST_USERNAME or OMNI_STUDIO_TEST_PASSWORD not set")
      }
    })

    test("login succeeds and persists config", async () => {
      if (!backendAvailable || !TEST_USERNAME || !TEST_PASSWORD) return

      const config = await run(
        OmniStudioAuth.Service.use((svc) => svc.login({ username: TEST_USERNAME, password: TEST_PASSWORD }, API_BASE)),
      )

      expect(config.access_token).toBeTruthy()
      expect(config.refresh_token).toBeTruthy()
      expect(config.user.id).toBeTruthy()
      expect(config.api_base).toBe(API_BASE)
      expect(config.auth_base).toBe(API_BASE)

      /** 验证文件已持久化到本地 */
      const configPath = path.join(tmpHome, ".omni_studio", "omni-studio.json")
      const raw = await fs.readFile(configPath, "utf-8")
      const saved = JSON.parse(raw)
      expect(saved.access_token).toBe(config.access_token)
      expect(saved.refresh_token).toBe(config.refresh_token)
    })

    test("login fails on invalid credentials", async () => {
      if (!backendAvailable) return

      await expect(
        run(OmniStudioAuth.Service.use((svc) => svc.login({ username: "__invalid__", password: "__wrong__" }, API_BASE))),
      ).rejects.toBeDefined()
    })

    test("getAuthHeaders returns bearer token when logged in", async () => {
      if (!backendAvailable || !TEST_USERNAME || !TEST_PASSWORD) return

      await run(
        OmniStudioAuth.Service.use((svc) => svc.login({ username: TEST_USERNAME, password: TEST_PASSWORD }, API_BASE)),
      )
      const headers = await run(OmniStudioAuth.Service.use((svc) => svc.getAuthHeaders()))
      expect(headers.Authorization).toMatch(/^Bearer /)
    })

    test("isLoggedIn returns true after login", async () => {
      if (!backendAvailable || !TEST_USERNAME || !TEST_PASSWORD) return

      await run(
        OmniStudioAuth.Service.use((svc) => svc.login({ username: TEST_USERNAME, password: TEST_PASSWORD }, API_BASE)),
      )
      const loggedIn = await run(OmniStudioAuth.Service.use((svc) => svc.isLoggedIn()))
      expect(loggedIn).toBe(true)
    })
  })

  /**
   * 纯本地操作测试：
   * 不依赖后端，只验证本地配置文件的读写行为。
   */
  describe("local only", () => {
    test("logout removes config", async () => {
      /** 手动写入一个模拟配置 */
      const configPath = path.join(tmpHome, ".omni_studio", "omni-studio.json")
      await fs.mkdir(path.dirname(configPath), { recursive: true })
      await fs.writeFile(configPath, JSON.stringify({ access_token: "fake" }))

      let exists = await fs.stat(configPath).then(() => true).catch(() => false)
      expect(exists).toBe(true)

      await run(OmniStudioAuth.Service.use((svc) => svc.logout()))

      exists = await fs.stat(configPath).then(() => true).catch(() => false)
      expect(exists).toBe(false)
    })

    test("getAuthHeaders fails when not logged in", async () => {
      await expect(run(OmniStudioAuth.Service.use((svc) => svc.getAuthHeaders()))).rejects.toBe("Not logged in")
    })

    test("isLoggedIn returns false when not logged in", async () => {
      const loggedIn = await run(OmniStudioAuth.Service.use((svc) => svc.isLoggedIn()))
      expect(loggedIn).toBe(false)
    })
  })
})
