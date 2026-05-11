import { test, expect, describe, beforeEach, afterEach } from "bun:test"
import { Effect } from "effect"
import path from "path"
import fs from "fs/promises"
import os from "os"
import { Global } from "@opencode-ai/core/global"
import { AppFileSystem } from "@opencode-ai/core/filesystem"
import { OmniStudioConfig } from "../../src/omni-studio/config"
import type { OmniStudioConfig as OmniStudioConfigType, OmniStudioState } from "../../src/omni-studio/types"

describe("OmniStudioConfig", () => {
  let tmpHome: string

  beforeEach(async () => {
    tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), "omni-studio-"))
    process.env.OPENCODE_TEST_HOME = tmpHome
  })

  afterEach(async () => {
    delete process.env.OPENCODE_TEST_HOME
    await fs.rm(tmpHome, { recursive: true, force: true })
  })

  const run = <A, E>(eff: Effect.Effect<A, E, OmniStudioConfig.Service>) =>
    Effect.runPromise(eff.pipe(Effect.provide(OmniStudioConfig.defaultLayer)))

  test("read returns null when config file does not exist", async () => {
    const config = await run(OmniStudioConfig.Service.use((svc) => svc.read()))
    expect(config).toBeNull()
  })

  test("write and read roundtrip", async () => {
    const config: OmniStudioConfigType = {
      api_base: "https://api.example.com",
      access_token: "token-123",
      refresh_token: "refresh-456",
      user: {
        id: "user-1",
        username: "testuser",
      },
    }

    await run(OmniStudioConfig.Service.use((svc) => svc.write(config)))
    const result = await run(OmniStudioConfig.Service.use((svc) => svc.read()))
    expect(result).toEqual(config)
  })

  test("remove deletes config file", async () => {
    const config: OmniStudioConfigType = {
      api_base: "https://api.example.com",
      access_token: "token-123",
      refresh_token: "refresh-456",
      user: {
        id: "user-1",
        username: "testuser",
      },
    }

    await run(OmniStudioConfig.Service.use((svc) => svc.write(config)))
    let exists = await fs.stat(path.join(tmpHome, ".omni_studio", "omni-studio.json")).then(() => true).catch(() => false)
    expect(exists).toBe(true)

    await run(OmniStudioConfig.Service.use((svc) => svc.remove()))
    exists = await fs.stat(path.join(tmpHome, ".omni_studio", "omni-studio.json")).then(() => true).catch(() => false)
    expect(exists).toBe(false)
  })

  test("readState returns default when state file does not exist", async () => {
    const state = await run(OmniStudioConfig.Service.use((svc) => svc.readState()))
    expect(state).toEqual({ extensions: [] })
  })

  test("writeState and readState roundtrip", async () => {
    const state: OmniStudioState = {
      extensions: [
        {
          type: "skill",
          slug: "test-skill",
          version: "1.0.0",
          enabled: true,
          installed_at: "2026-01-01T00:00:00Z",
        },
      ],
    }

    await run(OmniStudioConfig.Service.use((svc) => svc.writeState(state)))
    const result = await run(OmniStudioConfig.Service.use((svc) => svc.readState()))
    expect(result).toEqual(state)
  })
})
