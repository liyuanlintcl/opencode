import { promises as fs } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

const OMNI_STUDIO_DIR = join(homedir(), ".omni_studio")

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true })
}

async function readJson<T>(path: string): Promise<T | null> {
  try {
    const data = await fs.readFile(path, "utf-8")
    return JSON.parse(data) as T
  } catch {
    return null
  }
}

async function writeJson(path: string, data: unknown) {
  await fs.writeFile(path, JSON.stringify(data, null, 2), "utf-8")
}

export async function updateExtensionState(type: string, slug: string, enabled: boolean) {
  const plural = type + "s"
  const state = await readJson<Record<string, Record<string, { enabled: boolean; version: string }>>>(
    join(OMNI_STUDIO_DIR, "state.json"),
  )
  if (!state) return
  if (!state[plural]) return
  if (!state[plural][slug]) return

  state[plural][slug].enabled = enabled
  await writeJson(join(OMNI_STUDIO_DIR, "state.json"), state)
}

export async function syncOmniStudioConfig(apiBase: string, authBase: string, token: { accessToken: string; refreshToken: string }) {
  await ensureDir(OMNI_STUDIO_DIR)
  const configPath = join(OMNI_STUDIO_DIR, "omni-studio.json")
  await writeJson(configPath, { apiBase, authBase, token })
}

export async function removeOmniStudioConfig() {
  const configPath = join(OMNI_STUDIO_DIR, "omni-studio.json")
  await fs.unlink(configPath).catch(() => undefined)
}
