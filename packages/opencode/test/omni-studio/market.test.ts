import { test, expect, describe, beforeEach, afterEach } from "bun:test"
import { Effect } from "effect"
import path from "path"
import fs from "fs/promises"
import os from "os"
import { AppFileSystem } from "@opencode-ai/core/filesystem"
import { OmniStudioMarket } from "../../src/omni-studio/market"
import { OmniStudioAuth } from "../../src/omni-studio/auth"

const API_BASE = process.env.OMNI_STUDIO_API_BASE ?? "http://192.88.1.63:3008/api/"
const TEST_USERNAME = process.env.OMNI_STUDIO_TEST_USERNAME ?? "admin"
const TEST_PASSWORD = process.env.OMNI_STUDIO_TEST_PASSWORD ?? ".2admin"

let backendAvailable = false

const run = <A, E>(eff: Effect.Effect<A, E, OmniStudioMarket.Service>) =>
  Effect.runPromise(eff.pipe(Effect.provide(OmniStudioMarket.defaultLayer), Effect.provide(AppFileSystem.defaultLayer)))

describe("OmniStudioMarket", () => {
  let tmpHome: string

  beforeEach(async () => {
    tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), "omni-studio-market-"))
    process.env.OPENCODE_TEST_HOME = tmpHome

    // Try to login first so auth headers are available
    try {
      await Effect.runPromise(
        OmniStudioAuth.Service.use((svc) => svc.login({ username: TEST_USERNAME, password: TEST_PASSWORD }, API_BASE))
          .pipe(Effect.provide(OmniStudioAuth.defaultLayer), Effect.provide(AppFileSystem.defaultLayer)),
      )
      // Probe if market endpoints exist
      const res = await fetch(API_BASE + "/extensions", { headers: { Authorization: "Bearer test" }, signal: AbortSignal.timeout(3000) })
      backendAvailable = res.status !== 404
    } catch {
      backendAvailable = false
    }
  })

  afterEach(async () => {
    delete process.env.OPENCODE_TEST_HOME
    await fs.rm(tmpHome, { recursive: true, force: true })
  })

  test("list returns extensions when backend available", async () => {
    if (!backendAvailable) return
    const extensions = await run(OmniStudioMarket.Service.use((svc) => svc.list()))
    expect(Array.isArray(extensions)).toBe(true)
  })

  test("getMeta returns extension metadata when backend available", async () => {
    if (!backendAvailable) return
    // This test may need a known extension slug; skip if none available
    const extensions = await run(OmniStudioMarket.Service.use((svc) => svc.list()))
    if (extensions.length === 0) return
    const meta = await run(OmniStudioMarket.Service.use((svc) => svc.getMeta(extensions[0].type, extensions[0].slug)))
    expect(meta.slug).toBe(extensions[0].slug)
  })

  test("download saves file when backend available", async () => {
    if (!backendAvailable) return
    const extensions = await run(OmniStudioMarket.Service.use((svc) => svc.list()))
    if (extensions.length === 0) return
    const targetDir = path.join(tmpHome, "downloads")
    await run(OmniStudioMarket.Service.use((svc) => svc.download(extensions[0], targetDir)))
    const files = await fs.readdir(targetDir)
    expect(files.length).toBeGreaterThan(0)
  })

  test("list fails when not logged in", async () => {
    // Ensure no login config
    await fs.rm(path.join(tmpHome, ".omni_studio"), { recursive: true, force: true })
    await expect(run(OmniStudioMarket.Service.use((svc) => svc.list()))).rejects.toBeDefined()
  })
})
