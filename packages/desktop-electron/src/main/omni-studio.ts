import { execFile } from "node:child_process"
import { createWriteStream, promises as fs } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { Readable } from "node:stream"
import { pipeline } from "node:stream/promises"

const OMNI_STUDIO_DIR = join(homedir(), ".omni_studio")

function toPlural(type: string): string {
  const map: Record<string, string> = {
    skill: "skills",
    tool: "tools",
    plugin: "plugins",
    agent: "agents",
  }
  return map[type] ?? type
}

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

async function unzip(zipPath: string, destDir: string) {
  await ensureDir(destDir)
  if (process.platform === "win32") {
    await new Promise<void>((resolve, reject) => {
      execFile(
        "powershell",
        ["-Command", `Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force`],
        (err) => (err ? reject(err) : resolve()),
      )
    })
  } else {
    await new Promise<void>((resolve, reject) => {
      execFile("unzip", ["-o", zipPath, "-d", destDir], (err) => (err ? reject(err) : resolve()))
    })
  }
}

export async function downloadAndInstallExtension(
  type: string,
  slug: string,
  version: string,
  apiBase: string,
  token: string,
) {
  const plural = toPlural(type)
  const downloadUrl = `${apiBase}/packages/${plural}/${slug}/revisions/${version}/download`
  const extDir = join(OMNI_STUDIO_DIR, plural, slug)
  const zipPath = join(OMNI_STUDIO_DIR, plural, `${slug}.zip`)

  await ensureDir(join(OMNI_STUDIO_DIR, plural))

  const response = await fetch(downloadUrl, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!response.ok) {
    throw new Error(`Failed to download extension: ${response.status} ${response.statusText}`)
  }

  const body = response.body
  if (!body) {
    throw new Error("Download response has no body")
  }

  await pipeline(Readable.fromWeb(body as any), createWriteStream(zipPath))
  await unzip(zipPath, extDir)
  await fs.unlink(zipPath).catch(() => undefined)

  const state = (await readJson<Record<string, Record<string, { enabled: boolean; version: string }>>>(
    join(OMNI_STUDIO_DIR, "state.json"),
  )) ?? { skills: {}, tools: {}, plugins: {}, agents: {} }

  state[plural] ??= {}
  state[plural][slug] = { enabled: true, version }

  await writeJson(join(OMNI_STUDIO_DIR, "state.json"), state)
}

export async function removeExtension(type: string, slug: string) {
  const plural = toPlural(type)
  const extDir = join(OMNI_STUDIO_DIR, plural, slug)

  await fs.rm(extDir, { recursive: true, force: true })

  const state = await readJson<Record<string, Record<string, { enabled: boolean; version: string }>>>(
    join(OMNI_STUDIO_DIR, "state.json"),
  )
  if (state && state[plural]) {
    delete state[plural][slug]
    await writeJson(join(OMNI_STUDIO_DIR, "state.json"), state)
  }
}

export async function updateExtensionState(type: string, slug: string, enabled: boolean) {
  const plural = toPlural(type)
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
