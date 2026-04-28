import os from "os"
import path from "path"
import { Effect } from "effect"
import { AppFileSystem } from "@opencode-ai/core/filesystem"

export type ExtensionState = { enabled: boolean; version: string }

export type OmniStudioState = {
  skills: Record<string, ExtensionState>
  tools: Record<string, ExtensionState>
  plugins: Record<string, ExtensionState>
  agents: Record<string, ExtensionState>
}

const OMNI_STUDIO_DIR = path.join(os.homedir(), ".omni_studio")
const STATE_PATH = path.join(OMNI_STUDIO_DIR, "state.json")

export const OMNI_STUDIO_PATHS = {
  dir: OMNI_STUDIO_DIR,
  state: STATE_PATH,
  skills: path.join(OMNI_STUDIO_DIR, "skills"),
  tools: path.join(OMNI_STUDIO_DIR, "tools"),
  plugins: path.join(OMNI_STUDIO_DIR, "plugins"),
  agents: path.join(OMNI_STUDIO_DIR, "agents"),
} as const

export function readOmniStudioState() {
  return Effect.gen(function* () {
    const fs = yield* AppFileSystem.Service
    const exists = yield* fs.existsSafe(STATE_PATH)
    if (!exists) return null
    const data = yield* fs.readJson(STATE_PATH)
    return data as OmniStudioState
  }).pipe(Effect.catchAll(() => Effect.succeed(null)))
}

export function getEnabledSlugs(state: OmniStudioState | null, type: keyof OmniStudioState): string[] {
  if (!state) return []
  return Object.entries(state[type] ?? {})
    .filter(([, info]) => info.enabled)
    .map(([slug]) => slug)
}
