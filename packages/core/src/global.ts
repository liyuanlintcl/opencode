import path from "path"
import fs from "fs/promises"
import fsSync from "fs"
import { xdgData, xdgCache, xdgConfig, xdgState } from "xdg-basedir"
import os from "os"
import { Context, Effect, Layer } from "effect"
import { Flock } from "./util/flock"
import { Flag } from "./flag/flag"

const app = "omni"
const data = path.join(xdgData!, app)
const cache = path.join(xdgCache!, app)
const config = path.join(xdgConfig!, app)
const state = path.join(xdgState!, app)
const tmp = path.join(os.tmpdir(), app)

async function migrateFromLegacy() {
  const legacyApp = "opencode"
  const dirs = [
    { from: path.join(xdgConfig!, legacyApp), to: config },
    { from: path.join(xdgData!, legacyApp), to: data },
    { from: path.join(xdgState!, legacyApp), to: state },
  ]

  for (const { from, to } of dirs) {
    if (fsSync.existsSync(from) && !fsSync.existsSync(to)) {
      await fs.mkdir(to, { recursive: true })
      const entries = await fs.readdir(from, { withFileTypes: true })
      for (const entry of entries) {
        const src = path.join(from, entry.name)
        const dst = path.join(to, entry.name)
        if (entry.isDirectory()) {
          await fs.cp(src, dst, { recursive: true })
        } else {
          await fs.copyFile(src, dst)
        }
      }
      process.stderr.write(`Migrated ${from} → ${to}${os.EOL}`)
    }
  }
}

const paths = {
  get home() {
    return process.env.OMNI_TEST_HOME ?? process.env.OPENCODE_TEST_HOME ?? os.homedir()
  },
  data,
  bin: path.join(cache, "bin"),
  log: path.join(data, "log"),
  repos: path.join(data, "repos"),
  cache,
  config,
  state,
  tmp,
}

export const Path = paths

Flock.setGlobal({ state })

await migrateFromLegacy()

await Promise.all([
  fs.mkdir(Path.data, { recursive: true }),
  fs.mkdir(Path.config, { recursive: true }),
  fs.mkdir(Path.state, { recursive: true }),
  fs.mkdir(Path.tmp, { recursive: true }),
  fs.mkdir(Path.log, { recursive: true }),
  fs.mkdir(Path.bin, { recursive: true }),
  fs.mkdir(Path.repos, { recursive: true }),
])

export class Service extends Context.Service<Service, Interface>()("@opencode/Global") {}

export interface Interface {
  readonly home: string
  readonly data: string
  readonly cache: string
  readonly config: string
  readonly state: string
  readonly tmp: string
  readonly bin: string
  readonly log: string
  readonly repos: string
}

export function make(input: Partial<Interface> = {}): Interface {
  return {
    get home() { return Path.home },
    data: Path.data,
    cache: Path.cache,
    config: Flag.OPENCODE_CONFIG_DIR ?? Path.config,
    state: Path.state,
    tmp: Path.tmp,
    bin: Path.bin,
    log: Path.log,
    repos: Path.repos,
    ...input,
  }
}

export const layer = Layer.effect(
  Service,
  Effect.sync(() => Service.of(make())),
)

export const defaultLayer = layer

export const layerWith = (input: Partial<Interface>) =>
  Layer.effect(
    Service,
    Effect.sync(() => Service.of(make(input))),
  )

export * as Global from "./global"
