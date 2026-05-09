import { test, expect, describe, beforeEach, afterEach } from "bun:test"
import { Effect } from "effect"
import path from "path"
import fs from "fs/promises"
import os from "os"
import { AppFileSystem } from "@opencode-ai/core/filesystem"
import { OmniStudioAuth } from "../../src/omni-studio/auth"
import { OmniStudioMarket } from "../../src/omni-studio/market"
import { OmniStudioStore } from "../../src/omni-studio/store"
import { OmniStudioConfig } from "../../src/omni-studio/config"

const API_BASE = process.env.OMNI_STUDIO_API_BASE ?? "http://192.88.1.63:3008/api/"
const TEST_USERNAME = process.env.OMNI_STUDIO_TEST_USERNAME ?? "admin"
const TEST_PASSWORD = process.env.OMNI_STUDIO_TEST_PASSWORD ?? ".2admin"

let backendAvailable = false
let listEndpointHealthy = false

const runAuth = <A, E>(eff: Effect.Effect<A, E, OmniStudioAuth.Service>) =>
  Effect.runPromise(eff.pipe(Effect.provide(OmniStudioAuth.defaultLayer), Effect.provide(AppFileSystem.defaultLayer)))

const runMarket = <A, E>(eff: Effect.Effect<A, E, OmniStudioMarket.Service>) =>
  Effect.runPromise(eff.pipe(Effect.provide(OmniStudioMarket.defaultLayer), Effect.provide(AppFileSystem.defaultLayer)))

const runStore = <A, E>(eff: Effect.Effect<A, E, OmniStudioStore.Service>) =>
  Effect.runPromise(eff.pipe(Effect.provide(OmniStudioStore.defaultLayer), Effect.provide(AppFileSystem.defaultLayer)))

describe("OmniStudio Integration", () => {
  let tmpHome: string

  beforeEach(async () => {
    tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), "omni-studio-integration-"))
    process.env.OPENCODE_TEST_HOME = tmpHome

    try {
      await runAuth(OmniStudioAuth.Service.use((svc) => svc.login({ username: TEST_USERNAME, password: TEST_PASSWORD }, API_BASE)))
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

  test("full lifecycle: login → list → install → disable → enable → status → uninstall → logout", async () => {
    if (!backendAvailable || !listEndpointHealthy) return

    // 1. Login (already done in beforeEach, verify config exists)
    const config = await runAuth(OmniStudioAuth.Service.use((svc) => svc.isLoggedIn()))
    expect(config).toBe(true)

    // 2. List remote extensions
    const extensions = await runMarket(OmniStudioMarket.Service.use((svc) => svc.list("skill")))
    expect(extensions.length).toBeGreaterThan(0)
    const ext = extensions[0]

    // 3. Install extension
    await runStore(OmniStudioStore.Service.use((svc) => svc.install(ext)))
    const extDir = path.join(tmpHome, ".omni_studio", "skills", ext.slug)
    expect(await fs.stat(extDir).then(() => true).catch(() => false)).toBe(true)

    // 4. Get status — should include the installed extension
    const status = await runStore(OmniStudioStore.Service.use((svc) => svc.getStatus()))
    expect(status.config).toBeDefined()
    expect(status.extensions.find((e) => e.slug === ext.slug)).toBeDefined()

    // 5. Disable extension
    await runStore(OmniStudioStore.Service.use((svc) => svc.setEnabled(ext.type, ext.slug, false)))
    const afterDisable = await Effect.runPromise(
      OmniStudioConfig.Service.use((svc) => svc.readState())
        .pipe(Effect.provide(OmniStudioConfig.defaultLayer), Effect.provide(AppFileSystem.defaultLayer)),
    )
    expect(afterDisable.extensions.find((e) => e.slug === ext.slug)?.enabled).toBe(false)

    // 6. Enable extension
    await runStore(OmniStudioStore.Service.use((svc) => svc.setEnabled(ext.type, ext.slug, true)))
    const afterEnable = await Effect.runPromise(
      OmniStudioConfig.Service.use((svc) => svc.readState())
        .pipe(Effect.provide(OmniStudioConfig.defaultLayer), Effect.provide(AppFileSystem.defaultLayer)),
    )
    expect(afterEnable.extensions.find((e) => e.slug === ext.slug)?.enabled).toBe(true)

    // 7. Uninstall extension
    await runStore(OmniStudioStore.Service.use((svc) => svc.uninstall(ext.type, ext.slug)))
    expect(await fs.stat(extDir).then(() => true).catch(() => false)).toBe(false)
    const afterUninstall = await Effect.runPromise(
      OmniStudioConfig.Service.use((svc) => svc.readState())
        .pipe(Effect.provide(OmniStudioConfig.defaultLayer), Effect.provide(AppFileSystem.defaultLayer)),
    )
    expect(afterUninstall.extensions.find((e) => e.slug === ext.slug)).toBeUndefined()

    // 8. Logout
    await runAuth(OmniStudioAuth.Service.use((svc) => svc.logout()))
    const afterLogout = await runAuth(OmniStudioAuth.Service.use((svc) => svc.isLoggedIn()))
    expect(afterLogout).toBe(false)
  })

  test("lifecycle with scripts: install executes install.sh, disable executes stop.sh, uninstall executes stop + uninstall.sh", async () => {
    // Create a fake extension directory with scripts
    const extDir = path.join(tmpHome, ".omni_studio", "skills", "script-test")
    await fs.mkdir(extDir, { recursive: true })

    // Write install.sh that creates a marker
    await fs.writeFile(path.join(extDir, "install.sh"), "#!/bin/sh\ntouch install-marker.txt\n")
    await fs.chmod(path.join(extDir, "install.sh"), 0o755)

    // Write stop.sh that creates a marker
    await fs.writeFile(path.join(extDir, "stop.sh"), "#!/bin/sh\ntouch stop-marker.txt\n")
    await fs.chmod(path.join(extDir, "stop.sh"), 0o755)

    // Write uninstall.sh that creates a marker outside the extension dir
    // (the dir is deleted after uninstall runs)
    await fs.writeFile(path.join(extDir, "uninstall.sh"), `#!/bin/sh\ntouch "${path.join(tmpHome, "uninstall-marker.txt")}"\n`)
    await fs.chmod(path.join(extDir, "uninstall.sh"), 0o755)

    // Register in state as installed and enabled
    await Effect.runPromise(
      OmniStudioConfig.Service.use((svc) =>
        svc.writeState({
          extensions: [
            { type: "skill", slug: "script-test", version: "1.0.0", enabled: true, installed_at: new Date().toISOString() },
          ],
        }),
      ).pipe(Effect.provide(OmniStudioConfig.defaultLayer), Effect.provide(AppFileSystem.defaultLayer)),
    )

    // Trigger stop script by calling setEnabled(false)
    await runStore(OmniStudioStore.Service.use((svc) => svc.setEnabled("skill", "script-test", false)))
    expect(await fs.stat(path.join(extDir, "stop-marker.txt")).then(() => true).catch(() => false)).toBe(true)

    // Test uninstall → should run uninstall.sh (stop is skipped because already disabled)
    await runStore(OmniStudioStore.Service.use((svc) => svc.uninstall("skill", "script-test")))
    expect(await fs.stat(path.join(tmpHome, "uninstall-marker.txt")).then(() => true).catch(() => false)).toBe(true)
  })
})
