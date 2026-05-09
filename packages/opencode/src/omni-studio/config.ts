import path from "path"
import { Global } from "@opencode-ai/core/global"
import { Effect, Layer, Context } from "effect"
import { AppFileSystem } from "@opencode-ai/core/filesystem"
import type { OmniStudioConfig, OmniStudioState } from "./types"

const configFile = () => path.join(Global.Path.home, ".omni_studio", "omni-studio.json")
const stateFile = () => path.join(Global.Path.home, ".omni_studio", "state.json")

export interface Interface {
  readonly read: () => Effect.Effect<OmniStudioConfig | null>
  readonly write: (config: OmniStudioConfig) => Effect.Effect<void>
  readonly remove: () => Effect.Effect<void>
  readonly readState: () => Effect.Effect<OmniStudioState>
  readonly writeState: (state: OmniStudioState) => Effect.Effect<void>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/OmniStudioConfig") {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const fs = yield* AppFileSystem.Service

    const read = Effect.fn("OmniStudioConfig.read")(function* () {
      return yield* fs.readJson(configFile()).pipe(
        Effect.map((data) => data as OmniStudioConfig),
        Effect.catch(() => Effect.succeed(null)),
      )
    })

    const write = Effect.fn("OmniStudioConfig.write")(function* (config: OmniStudioConfig) {
      yield* fs.ensureDir(path.dirname(configFile())).pipe(Effect.orDie)
      yield* fs.writeJson(configFile(), config, 0o600).pipe(Effect.orDie)
    })

    const remove = Effect.fn("OmniStudioConfig.remove")(function* () {
      yield* fs.remove(configFile()).pipe(Effect.catch(() => Effect.void))
    })

    const readState = Effect.fn("OmniStudioConfig.readState")(function* () {
      return yield* fs.readJson(stateFile()).pipe(
        Effect.map((data) => data as OmniStudioState),
        Effect.catch(() => Effect.succeed({ extensions: [] })),
      )
    })

    const writeState = Effect.fn("OmniStudioConfig.writeState")(function* (state: OmniStudioState) {
      yield* fs.ensureDir(path.dirname(stateFile())).pipe(Effect.orDie)
      yield* fs.writeJson(stateFile(), state, 0o600).pipe(Effect.orDie)
    })

    return Service.of({
      read,
      write,
      remove,
      readState,
      writeState,
    })
  }),
)

export const defaultLayer = layer.pipe(Layer.provide(AppFileSystem.defaultLayer))

export * as OmniStudioConfig from "./config"
