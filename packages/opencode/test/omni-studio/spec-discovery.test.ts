import { describe, expect } from "bun:test"
import path from "path"
import { Effect, FileSystem, Layer } from "effect"
import { NodeFileSystem } from "@effect/platform-node"
import { AppFileSystem } from "@opencode-ai/core/filesystem"
import { Global } from "@opencode-ai/core/global"
import { discoverSpecs } from "../../src/omni-studio/spec-discovery"
import { TestInstance } from "../fixture/fixture"
import { it } from "../lib/effect"

const write = (filepath: string, content: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    yield* fs.makeDirectory(path.dirname(filepath), { recursive: true })
    yield* fs.writeFileString(filepath, content)
  })

describe("discoverSpecs", () => {
  it.instance("无参数调用 discoverSpecs", () =>
    Effect.gen(function* () {
      const { directory: dir } = yield* TestInstance
      yield* write(path.join(dir, ".omni_studio", "state.json"), JSON.stringify({
        extensions: [
          { type: "spec", slug: "test-spec", version: "1.0.0", enabled: true },
        ],
      }))
      yield* write(path.join(dir, ".omni_studio", "specs", "test-spec", "SPEC.md"), "---\ndependencies:\n  skills:\n    external:\n      - my-skill\n---\n\nTest spec content.")

      const global = { home: dir, config: dir }
      const layer = Layer.mergeAll(
        AppFileSystem.defaultLayer,
        Global.layerWith(global),
      )

      const result = yield* discoverSpecs().pipe(Effect.provide(layer))
      expect(result.length).toBe(1)
      expect(result[0].slug).toBe("test-spec")
      expect(result[0].content).toBe("Test spec content.")
    }).pipe(Effect.provide(NodeFileSystem.layer)),
  )

  it.instance("传入 fs 和 global 调用 discoverSpecs", () =>
    Effect.gen(function* () {
      const { directory: dir } = yield* TestInstance
      yield* write(path.join(dir, ".omni_studio", "state.json"), JSON.stringify({
        extensions: [
          { type: "spec", slug: "test-spec2", version: "1.0.0", enabled: true },
        ],
      }))
      yield* write(path.join(dir, ".omni_studio", "specs", "test-spec2", "SPEC.md"), "Test spec content 2.")

      const fs = yield* AppFileSystem.Service
      const global = yield* Global.Service

      const result = yield* discoverSpecs(fs, global)
      expect(result.length).toBe(1)
      expect(result[0].slug).toBe("test-spec2")
    }).pipe(Effect.provide(NodeFileSystem.layer)),
  )
})
