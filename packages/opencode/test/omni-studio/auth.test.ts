import { test, expect, describe, beforeEach, afterEach } from "bun:test"
import { Effect } from "effect"
import path from "path"
import fs from "fs/promises"
import os from "os"
import { Global } from "@opencode-ai/core/global"
import { AppFileSystem } from "@opencode-ai/core/filesystem"
import { OmniStudioAuth } from "../../src/omni-studio/auth"
import { OmniStudioConfig } from "../../src/omni-studio/config"

describe("OmniStudioAuth", () => {
  let tmpHome: string
  let server: ReturnType<typeof Bun.serve>

  beforeEach(async () => {
    tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), "omni-studio-auth-"))
    process.env.OPENCODE_TEST_HOME = tmpHome

    server = Bun.serve({
      port: 0,
      async fetch(req) {
        if (req.url.endsWith("/auth/auth/login")) {
          const body = await req.json()
          if (body.username === "test" && body.password === "pass") {
            return Response.json({
              accessToken: "token123",
              refreshToken: "refresh456",
              user: { id: "u1", username: "test" },
            })
          }
          return new Response("Invalid credentials", { status: 401 })
        }
        return new Response("Not found", { status: 404 })
      },
    })
  })

  afterEach(async () => {
    delete process.env.OPENCODE_TEST_HOME
    server.stop()
    await fs.rm(tmpHome, { recursive: true, force: true })
  })

  const run = <A, E>(eff: Effect.Effect<A, E, OmniStudioAuth.Service>) =>
    Effect.runPromise(eff.pipe(Effect.provide(OmniStudioAuth.defaultLayer), Effect.provide(AppFileSystem.defaultLayer)))

  test("login succeeds and persists config", async () => {
    const config = await run(
      OmniStudioAuth.Service.use((svc) => svc.login({ username: "test", password: "pass" }, `http://localhost:${server.port}`)),
    )

    expect(config.access_token).toBe("token123")
    expect(config.refresh_token).toBe("refresh456")
    expect(config.user.id).toBe("u1")
    expect(config.api_base).toBe(`http://localhost:${server.port}`)

    const configPath = path.join(tmpHome, ".omni_studio", "omni-studio.json")
    const raw = await fs.readFile(configPath, "utf-8")
    const saved = JSON.parse(raw)
    expect(saved.access_token).toBe("token123")
    expect(saved.refresh_token).toBe("refresh456")
  })

  test("login fails on invalid credentials", async () => {
    await expect(
      run(
        OmniStudioAuth.Service.use((svc) => svc.login({ username: "bad", password: "wrong" }, `http://localhost:${server.port}`)),
      ),
    ).rejects.toBe("Invalid credentials")
  })

  test("logout removes config", async () => {
    await run(
      OmniStudioAuth.Service.use((svc) => svc.login({ username: "test", password: "pass" }, `http://localhost:${server.port}`)),
    )
    let exists = await fs.stat(path.join(tmpHome, ".omni_studio", "omni-studio.json")).then(() => true).catch(() => false)
    expect(exists).toBe(true)

    await run(OmniStudioAuth.Service.use((svc) => svc.logout()))
    exists = await fs.stat(path.join(tmpHome, ".omni_studio", "omni-studio.json")).then(() => true).catch(() => false)
    expect(exists).toBe(false)
  })

  test("getAuthHeaders returns bearer token when logged in", async () => {
    await run(
      OmniStudioAuth.Service.use((svc) => svc.login({ username: "test", password: "pass" }, `http://localhost:${server.port}`)),
    )
    const headers = await run(OmniStudioAuth.Service.use((svc) => svc.getAuthHeaders()))
    expect(headers).toEqual({ Authorization: "Bearer token123" })
  })

  test("getAuthHeaders fails when not logged in", async () => {
    await expect(run(OmniStudioAuth.Service.use((svc) => svc.getAuthHeaders()))).rejects.toBe("Not logged in")
  })

  test("isLoggedIn returns true after login", async () => {
    await run(
      OmniStudioAuth.Service.use((svc) => svc.login({ username: "test", password: "pass" }, `http://localhost:${server.port}`)),
    )
    const loggedIn = await run(OmniStudioAuth.Service.use((svc) => svc.isLoggedIn()))
    expect(loggedIn).toBe(true)
  })

  test("isLoggedIn returns false when not logged in", async () => {
    const loggedIn = await run(OmniStudioAuth.Service.use((svc) => svc.isLoggedIn()))
    expect(loggedIn).toBe(false)
  })
})
