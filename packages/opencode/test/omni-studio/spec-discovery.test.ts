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
  it.instance("传入 fs 和 global 调用 discoverSpecs", () =>
    Effect.gen(function* () {
      const { directory: dir } = yield* TestInstance
      yield* write(
        path.join(dir, ".omni_studio", "state.json"),
        JSON.stringify({
          extensions: [
            { type: "spec", slug: "test-spec", version: "1.0.0", enabled: true },
          ],
        }),
      )
      yield* write(
        path.join(dir, ".omni_studio", "specs", "test-spec", "SPEC.md"),
        "---\ndependencies:\n  skills:\n    external:\n      - my-skill\n---\n\nTest spec content.",
      )

      const layer = Layer.mergeAll(
        AppFileSystem.defaultLayer,
        Global.layerWith({ home: dir, config: dir }),
      )

      const result = yield* Effect.gen(function* () {
        const fs = yield* AppFileSystem.Service
        const global = yield* Global.Service
        return yield* discoverSpecs(fs, global)
      }).pipe(Effect.provide(layer))

      expect(result.length).toBe(1)
      expect(result[0].slug).toBe("test-spec")
      expect(result[0].content).toBe("Test spec content.")
    }).pipe(Effect.provide(NodeFileSystem.layer)),
  )

  it.instance("spec 未启用时不返回", () =>
    Effect.gen(function* () {
      const { directory: dir } = yield* TestInstance
      yield* write(
        path.join(dir, ".omni_studio", "state.json"),
        JSON.stringify({
          extensions: [
            { type: "spec", slug: "disabled-spec", version: "1.0.0", enabled: false },
          ],
        }),
      )

      const layer = Layer.mergeAll(
        AppFileSystem.defaultLayer,
        Global.layerWith({ home: dir, config: dir }),
      )

      const result = yield* Effect.gen(function* () {
        const fs = yield* AppFileSystem.Service
        const global = yield* Global.Service
        return yield* discoverSpecs(fs, global)
      }).pipe(Effect.provide(layer))

      expect(result.length).toBe(0)
    }).pipe(Effect.provide(NodeFileSystem.layer)),
  )
})
