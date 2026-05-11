import { test, expect, describe, beforeEach, afterEach } from "bun:test"
import { Effect } from "effect"
import path from "path"
import fs from "fs/promises"
import os from "os"
import { AppFileSystem } from "@opencode-ai/core/filesystem"
import { OmniStudioMarket } from "../../src/omni-studio/market"
import { OmniStudioAuth } from "../../src/omni-studio/auth"

/** 真实后端 API 基础地址 */
const API_BASE = process.env.OMNI_STUDIO_API_BASE ?? "http://192.88.1.63:3008/api/"

/** 测试账号（优先从环境变量读取，回退到默认测试账号） */
const TEST_USERNAME = process.env.OMNI_STUDIO_TEST_USERNAME ?? "admin"
const TEST_PASSWORD = process.env.OMNI_STUDIO_TEST_PASSWORD ?? ".2admin"

/** 后端是否可用（在 beforeEach 中探测） */
let backendAvailable = false

/** 后端列表端点是否正常（部分端点可能 500） */
let listEndpointHealthy = false

/**
 * 辅助函数：运行需要 OmniStudioMarket.Service 的 Effect。
 * 自动注入默认 Layer（含 OmniStudioAuth + OmniStudioConfig + AppFileSystem）。
 */
const run = <A, E>(eff: Effect.Effect<A, E, OmniStudioMarket.Service>) =>
  Effect.runPromise(eff.pipe(Effect.provide(OmniStudioMarket.defaultLayer), Effect.provide(AppFileSystem.defaultLayer)))

describe("OmniStudioMarket", () => {
  let tmpHome: string

  beforeEach(async () => {
    tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), "omni-studio-market-"))
    process.env.OPENCODE_TEST_HOME = tmpHome

    /** 先执行登录，确保认证配置存在 */
    try {
      await Effect.runPromise(
        OmniStudioAuth.Service.use((svc) => svc.login({ username: TEST_USERNAME, password: TEST_PASSWORD }))
          .pipe(Effect.provide(OmniStudioAuth.defaultLayer), Effect.provide(AppFileSystem.defaultLayer)),
      )
      backendAvailable = true
    } catch {
      backendAvailable = false
    }

    /** 探测列表端点健康状态 */
    if (backendAvailable) {
      try {
        const headers = { Authorization: "Bearer test" }
        const res = await fetch(`${API_BASE}v1/packages/skills?page=0&size=1`, { headers, signal: AbortSignal.timeout(5000) })
        listEndpointHealthy = res.status < 500
      } catch {
        listEndpointHealthy = false
      }
    }
  })

  afterEach(async () => {
    delete process.env.OPENCODE_TEST_HOME
    await fs.rm(tmpHome, { recursive: true, force: true })
  })

  describe("with real backend", () => {
    test("list returns extensions when backend healthy", async () => {
      if (!backendAvailable || !listEndpointHealthy) return

      const extensions = await run(OmniStudioMarket.Service.use((svc) => svc.list("skill")))
      expect(Array.isArray(extensions)).toBe(true)
    })

    test("list fails gracefully when backend errors", async () => {
      if (!backendAvailable || listEndpointHealthy) return

      /** 后端 500 时应返回业务错误信息 */
      await expect(run(OmniStudioMarket.Service.use((svc) => svc.list("skill")))).rejects.toBeDefined()
    })

    test("getMeta returns extension metadata when backend healthy", async () => {
      if (!backendAvailable || !listEndpointHealthy) return

      /** 先获取列表，再查询第一个扩展的详情 */
      const extensions = await run(OmniStudioMarket.Service.use((svc) => svc.list("skill")))
      if (extensions.length === 0) return

      const meta = await run(
        OmniStudioMarket.Service.use((svc) => svc.getMeta(extensions[0].type, extensions[0].slug)),
      )
      expect(meta.slug).toBe(extensions[0].slug)
    })

    test("getMeta fails for non-existent slug", async () => {
      if (!backendAvailable) return

      await expect(
        run(OmniStudioMarket.Service.use((svc) => svc.getMeta("skill", "__nonexistent__"))),
      ).rejects.toBeDefined()
    })

    test("download saves file when backend healthy", async () => {
      if (!backendAvailable || !listEndpointHealthy) return

      const extensions = await run(OmniStudioMarket.Service.use((svc) => svc.list("skill")))
      if (extensions.length === 0) return

      const targetDir = path.join(tmpHome, "downloads")
      await fs.mkdir(targetDir, { recursive: true })

      await run(OmniStudioMarket.Service.use((svc) => svc.download(extensions[0], targetDir)))
      const files = await fs.readdir(targetDir)
      expect(files.length).toBeGreaterThan(0)
    })
  })

  describe("local only", () => {
    test("list fails when not logged in", async () => {
      /** 清除本地登录配置 */
      await fs.rm(path.join(tmpHome, ".omni_studio"), { recursive: true, force: true })

      await expect(run(OmniStudioMarket.Service.use((svc) => svc.list()))).rejects.toBeDefined()
    })
  })
})
