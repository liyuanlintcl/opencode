import { test, expect, describe, beforeEach, afterEach } from "bun:test"
import { Effect } from "effect"
import path from "path"
import fs from "fs/promises"
import os from "os"
import { AppFileSystem } from "@opencode-ai/core/filesystem"
import { OmniStudioStore } from "../../src/omni-studio/store"
import { OmniStudioConfig } from "../../src/omni-studio/config"
import { OmniStudioAuth } from "../../src/omni-studio/auth"
import { OmniStudioMarket } from "../../src/omni-studio/market"

const API_BASE = process.env.OMNI_STUDIO_API_BASE ?? "http://192.88.1.63:3008"
const TEST_USERNAME = process.env.OMNI_STUDIO_TEST_USERNAME ?? "admin"
const TEST_PASSWORD = process.env.OMNI_STUDIO_TEST_PASSWORD ?? ".2admin"

let backendAvailable = false
let listEndpointHealthy = false

const run = <A, E>(eff: Effect.Effect<A, E, OmniStudioStore.Service>) =>
  Effect.runPromise(eff.pipe(Effect.provide(OmniStudioStore.defaultLayer), Effect.provide(AppFileSystem.defaultLayer)))

describe("OmniStudioStore", () => {
  let tmpHome: string

  beforeEach(async () => {
    tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), "omni-studio-store-"))
    process.env.OPENCODE_TEST_HOME = tmpHome

    try {
      await Effect.runPromise(
        OmniStudioAuth.Service.use((svc) => svc.login({ username: TEST_USERNAME, password: TEST_PASSWORD }))
          .pipe(Effect.provide(OmniStudioAuth.defaultLayer), Effect.provide(AppFileSystem.defaultLayer)),
      )
      backendAvailable = true
      const res = await fetch(`${API_BASE}v1/packages/skills?page=0&size=1`, { headers: { Authorization: "Bearer test" }, signal: AbortSignal.timeout(5000) })
      listEndpointHealthy = res.status < 500
    } catch {
      backendAvailable = false
      listEndpointHealthy = false
    }
  })

  afterEach(async () => {
    delete process.env.OPENCODE_TEST_HOME
    await fs.rm(tmpHome, { recursive: true, force: true })
  })

  test("install downloads and extracts extension", async () => {
    if (!backendAvailable || !listEndpointHealthy) return

    const extensions = await Effect.runPromise(
      OmniStudioMarket.Service.use((svc) => svc.list("skill"))
        .pipe(Effect.provide(OmniStudioMarket.defaultLayer), Effect.provide(AppFileSystem.defaultLayer)),
    )
    if (extensions.length === 0) return

    const ext = extensions[0]
    await run(OmniStudioStore.Service.use((svc) => svc.install(ext)))

    const extDir = path.join(tmpHome, ".omni_studio", "skills", ext.slug)
    const exists = await fs.stat(extDir).then(() => true).catch(() => false)
    expect(exists).toBe(true)

    const state = await Effect.runPromise(
      OmniStudioConfig.Service.use((svc) => svc.readState())
        .pipe(Effect.provide(OmniStudioConfig.defaultLayer), Effect.provide(AppFileSystem.defaultLayer)),
    )
    const entry = state.extensions.find((e) => e.slug === ext.slug)
    expect(entry).toBeDefined()
    expect(entry?.enabled).toBe(true)
  })

  test("uninstall removes extension directory and state", async () => {
    if (!backendAvailable || !listEndpointHealthy) return

    const extensions = await Effect.runPromise(
      OmniStudioMarket.Service.use((svc) => svc.list("skill"))
        .pipe(Effect.provide(OmniStudioMarket.defaultLayer), Effect.provide(AppFileSystem.defaultLayer)),
    )
    if (extensions.length === 0) return

    const ext = extensions[0]
    await run(OmniStudioStore.Service.use((svc) => svc.install(ext)))
    await run(OmniStudioStore.Service.use((svc) => svc.uninstall(ext.type, ext.slug)))

    const extDir = path.join(tmpHome, ".omni_studio", "skills", ext.slug)
    const exists = await fs.stat(extDir).then(() => true).catch(() => false)
    expect(exists).toBe(false)

    const state = await Effect.runPromise(
      OmniStudioConfig.Service.use((svc) => svc.readState())
        .pipe(Effect.provide(OmniStudioConfig.defaultLayer), Effect.provide(AppFileSystem.defaultLayer)),
    )
    const entry = state.extensions.find((e) => e.slug === ext.slug)
    expect(entry).toBeUndefined()
  })

  test("setEnabled toggles extension state", async () => {
    if (!backendAvailable || !listEndpointHealthy) return

    const extensions = await Effect.runPromise(
      OmniStudioMarket.Service.use((svc) => svc.list("skill"))
        .pipe(Effect.provide(OmniStudioMarket.defaultLayer), Effect.provide(AppFileSystem.defaultLayer)),
    )
    if (extensions.length === 0) return

    const ext = extensions[0]
    await run(OmniStudioStore.Service.use((svc) => svc.install(ext)))
    await run(OmniStudioStore.Service.use((svc) => svc.setEnabled(ext.type, ext.slug, false)))

    const state = await Effect.runPromise(
      OmniStudioConfig.Service.use((svc) => svc.readState())
        .pipe(Effect.provide(OmniStudioConfig.defaultLayer), Effect.provide(AppFileSystem.defaultLayer)),
    )
    const entry = state.extensions.find((e) => e.slug === ext.slug)
    expect(entry?.enabled).toBe(false)
  })

  test("getStatus returns config and extensions", async () => {
    if (!backendAvailable || !listEndpointHealthy) return

    const extensions = await Effect.runPromise(
      OmniStudioMarket.Service.use((svc) => svc.list("skill"))
        .pipe(Effect.provide(OmniStudioMarket.defaultLayer), Effect.provide(AppFileSystem.defaultLayer)),
    )
    if (extensions.length === 0) return

    const ext = extensions[0]
    await run(OmniStudioStore.Service.use((svc) => svc.install(ext)))
    const status = await run(OmniStudioStore.Service.use((svc) => svc.getStatus()))

    expect(status.config).toBeDefined()
    expect(status.config?.user.username).toBe(TEST_USERNAME)
    expect(status.extensions.length).toBeGreaterThan(0)
  })
})
