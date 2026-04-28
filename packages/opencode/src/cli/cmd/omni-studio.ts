import { cmd } from "./cmd"
import * as prompts from "@clack/prompts"
import { UI } from "../ui"
import path from "path"
import os from "os"
import { execFile } from "node:child_process"
import { createWriteStream, promises as fs } from "node:fs"
import { Readable } from "node:stream"
import { pipeline } from "node:stream/promises"

const OMNI_STUDIO_DIR = path.join(os.homedir(), ".omni_studio")
const CONFIG_PATH = path.join(OMNI_STUDIO_DIR, "omni-studio.json")
const STATE_PATH = path.join(OMNI_STUDIO_DIR, "state.json")

const DEFAULT_API_BASE = "http://192.88.1.63:18000/api/v1"
const DEFAULT_AUTH_BASE = "http://10.17.174.2:18079"

type ExtensionType = "skill" | "tool" | "plugin" | "agent"

function toPlural(type: string): string {
  const map: Record<string, string> = {
    skill: "skills",
    tool: "tools",
    plugin: "plugins",
    agent: "agents",
  }
  return map[type] ?? type
}

function fromPlural(plural: string): ExtensionType | null {
  const map: Record<string, ExtensionType> = {
    skills: "skill",
    tools: "tool",
    plugins: "plugin",
    agents: "agent",
  }
  return map[plural] ?? null
}

interface OmniStudioConfig {
  apiBase: string
  authBase: string
  token: { accessToken: string; refreshToken: string }
  user?: { userId: number; username: string; nickname: string; openid: string }
}

interface OmniStudioState {
  skills: Record<string, { enabled: boolean; version: string }>
  tools: Record<string, { enabled: boolean; version: string }>
  plugins: Record<string, { enabled: boolean; version: string }>
  agents: Record<string, { enabled: boolean; version: string }>
}

async function readConfig(): Promise<OmniStudioConfig | null> {
  try {
    const data = await fs.readFile(CONFIG_PATH, "utf-8")
    return JSON.parse(data)
  } catch {
    return null
  }
}

async function writeConfig(config: OmniStudioConfig) {
  await fs.mkdir(OMNI_STUDIO_DIR, { recursive: true })
  await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8")
}

async function removeConfig() {
  await fs.unlink(CONFIG_PATH).catch(() => undefined)
}

async function readState(): Promise<OmniStudioState> {
  try {
    const data = await fs.readFile(STATE_PATH, "utf-8")
    return JSON.parse(data)
  } catch {
    return { skills: {}, tools: {}, plugins: {}, agents: {} }
  }
}

async function writeState(state: OmniStudioState) {
  await fs.mkdir(OMNI_STUDIO_DIR, { recursive: true })
  await fs.writeFile(STATE_PATH, JSON.stringify(state, null, 2), "utf-8")
}

async function apiFetch<T>(url: string, options?: RequestInit, token?: string): Promise<T> {
  const headers = new Headers(options?.headers)
  if (!headers.has("Content-Type") && !(options?.body instanceof FormData)) {
    headers.set("Content-Type", "application/json")
  }
  if (token) headers.set("Authorization", `Bearer ${token}`)

  const resp = await fetch(url, { ...options, headers })
  const result = await resp.json()
  if (result.code !== 200) throw new Error(`${result.message ?? "API error"} (code: ${result.code})`)
  return result.data as T
}

async function unzip(zipPath: string, destDir: string) {
  await fs.mkdir(destDir, { recursive: true })
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

function requireConfig(): Promise<OmniStudioConfig> {
  return readConfig().then((cfg) => {
    if (!cfg) {
      prompts.log.error("Not logged in. Run `opencode omni-studio login` first.")
      process.exit(1)
    }
    return cfg
  })
}

function requireType(type: string): ExtensionType {
  const valid: ExtensionType[] = ["skill", "tool", "plugin", "agent"]
  if (!valid.includes(type as ExtensionType)) {
    prompts.log.error(`Invalid type "${type}". Must be one of: ${valid.join(", ")}`)
    process.exit(1)
  }
  return type as ExtensionType
}

export const OmniStudioCommand = cmd({
  command: "omni-studio",
  aliases: ["marketplace"],
  describe: "manage Omni Studio marketplace extensions",
  builder: (yargs) =>
    yargs
      .command(OmniStudioLoginCommand)
      .command(OmniStudioLogoutCommand)
      .command(OmniStudioListCommand)
      .command(OmniStudioInstallCommand)
      .command(OmniStudioUninstallCommand)
      .command(OmniStudioEnableCommand)
      .command(OmniStudioDisableCommand)
      .command(OmniStudioStatusCommand)
      .demandCommand(),
  async handler() {},
})

export const OmniStudioLoginCommand = cmd({
  command: "login",
  describe: "log in to the Omni Studio marketplace",
  async handler() {
    UI.empty()
    prompts.intro("Omni Studio Login")

    const apiBase =
      (await prompts.text({
        message: "API Base URL",
        placeholder: DEFAULT_API_BASE,
        initialValue: DEFAULT_API_BASE,
      })) ?? DEFAULT_API_BASE
    if (prompts.isCancel(apiBase)) throw new UI.CancelledError()

    const authBase =
      (await prompts.text({
        message: "Auth Base URL",
        placeholder: DEFAULT_AUTH_BASE,
        initialValue: DEFAULT_AUTH_BASE,
      })) ?? DEFAULT_AUTH_BASE
    if (prompts.isCancel(authBase)) throw new UI.CancelledError()

    const username = await prompts.text({
      message: "Username",
      validate: (v) => (v && v.length > 0 ? undefined : "Required"),
    })
    if (prompts.isCancel(username)) throw new UI.CancelledError()

    const password = await prompts.password({
      message: "Password",
      validate: (v) => (v && v.length > 0 ? undefined : "Required"),
    })
    if (prompts.isCancel(password)) throw new UI.CancelledError()

    const spinner = prompts.spinner()
    spinner.start("Logging in...")

    try {
      const normalizedAuthBase = authBase.replace(/\/auth\/auth\/login\/?$/, "").replace(/\/$/, "")
      const data = await apiFetch<{
        accessToken: string
        refreshToken: string
        userId: number
        username: string
        nickname: string
        openid: string
      }>(`${normalizedAuthBase}/auth/auth/login`, {
        method: "POST",
        body: JSON.stringify({ username, password }),
      })

      await writeConfig({
        apiBase: apiBase.replace(/\/$/, ""),
        authBase: normalizedAuthBase,
        token: { accessToken: data.accessToken, refreshToken: data.refreshToken },
        user: {
          userId: data.userId,
          username: data.username,
          nickname: data.nickname,
          openid: data.openid,
        },
      })

      spinner.stop("Login successful")
      prompts.outro(`Welcome, ${data.nickname || data.username}!`)
    } catch (e: any) {
      spinner.stop("Login failed", 1)
      prompts.log.error(e.message ?? "Unknown error")
      process.exit(1)
    }
  },
})

export const OmniStudioLogoutCommand = cmd({
  command: "logout",
  describe: "log out from the Omni Studio marketplace",
  async handler() {
    UI.empty()
    prompts.intro("Omni Studio Logout")

    const cfg = await readConfig()
    if (cfg?.token.accessToken) {
      try {
        await apiFetch(`${cfg.authBase}/auth/auth/logout`, {
          method: "POST",
          headers: { Authorization: `Bearer ${cfg.token.accessToken}` },
        })
      } catch {
        // ignore
      }
    }

    await removeConfig()
    prompts.outro("Logged out")
  },
})

export const OmniStudioListCommand = cmd({
  command: "list [type]",
  describe: "list marketplace extensions",
  builder: (yargs) =>
    yargs.positional("type", {
      describe: "extension type filter",
      type: "string",
      choices: ["skill", "tool", "plugin", "agent"],
    }),
  async handler(args) {
    UI.empty()
    const cfg = await requireConfig()
    const spinner = prompts.spinner()
    spinner.start("Loading marketplace...")

    try {
      const types = args.type ? [toPlural(args.type as string)] : ["skills", "tools", "plugins", "agents"]
      const state = await readState()
      const rows: string[] = []

      for (const et of types) {
        try {
          const data = await apiFetch<{ records: any[] }>(
            `${cfg.apiBase}/packages/${et}?size=1000`,
            undefined,
            cfg.token.accessToken,
          )
          const localMap = state[et as keyof OmniStudioState] ?? {}
          for (const r of data.records) {
            const local = localMap[r.slug]
            const status = local ? (local.enabled ? "enabled" : "disabled") : "not installed"
            rows.push(`${et.slice(0, -1).padEnd(6)}  ${r.slug.padEnd(24)}  ${(r.displayName ?? r.slug).padEnd(30)}  ${status}`)
          }
        } catch {
          // ignore per type
        }
      }

      spinner.stop("Done")
      if (rows.length === 0) {
        prompts.log.info("No extensions found")
        return
      }

      prompts.log.info("TYPE    SLUG                      NAME                            STATUS")
      prompts.log.info("-".repeat(80))
      for (const row of rows) prompts.log.info(row)
    } catch (e: any) {
      spinner.stop("Failed", 1)
      prompts.log.error(e.message ?? "Unknown error")
      process.exit(1)
    }
  },
})

export const OmniStudioInstallCommand = cmd({
  command: "install <type> <slug> [version]",
  describe: "download and install an extension from the marketplace",
  builder: (yargs) =>
    yargs
      .positional("type", { describe: "extension type", type: "string", demandOption: true })
      .positional("slug", { describe: "extension slug", type: "string", demandOption: true })
      .positional("version", { describe: "version to install (default: latest)", type: "string" }),
  async handler(args) {
    UI.empty()
    const cfg = await requireConfig()
    const type = requireType(args.type as string)
    const slug = args.slug as string
    const version = (args.version as string) ?? "latest"
    const plural = toPlural(type)

    const spinner = prompts.spinner()
    spinner.start(`Installing ${slug}...`)

    try {
      // Register on backend
      await apiFetch(
        `${cfg.apiBase}/packages/${plural}/my`,
        {
          method: "POST",
          body: JSON.stringify({ slug, version: null, enabled: true }),
        },
        cfg.token.accessToken,
      )

      // Download
      const downloadUrl = `${cfg.apiBase}/packages/${plural}/${slug}/revisions/${version}/download`
      const extDir = path.join(OMNI_STUDIO_DIR, plural, slug)
      const zipPath = path.join(OMNI_STUDIO_DIR, plural, `${slug}.zip`)

      await fs.mkdir(path.join(OMNI_STUDIO_DIR, plural), { recursive: true })

      const response = await fetch(downloadUrl, {
        headers: { Authorization: `Bearer ${cfg.token.accessToken}` },
      })

      if (!response.ok) {
        throw new Error(`Download failed: ${response.status} ${response.statusText}`)
      }

      const body = response.body
      if (!body) throw new Error("Download response has no body")

      await pipeline(Readable.fromWeb(body as any), createWriteStream(zipPath))
      await unzip(zipPath, extDir)
      await fs.unlink(zipPath).catch(() => undefined)

      // Update state
      const state = await readState()
      state[plural as keyof OmniStudioState] ??= {}
      state[plural as keyof OmniStudioState][slug] = { enabled: true, version }
      await writeState(state)

      spinner.stop(`Installed ${slug}`)
      prompts.outro(`Extension installed to ${extDir}`)
    } catch (e: any) {
      spinner.stop("Installation failed", 1)
      prompts.log.error(e.message ?? "Unknown error")
      process.exit(1)
    }
  },
})

export const OmniStudioUninstallCommand = cmd({
  command: "uninstall <type> <slug>",
  describe: "uninstall an extension",
  builder: (yargs) =>
    yargs
      .positional("type", { describe: "extension type", type: "string", demandOption: true })
      .positional("slug", { describe: "extension slug", type: "string", demandOption: true }),
  async handler(args) {
    UI.empty()
    const cfg = await requireConfig()
    const type = requireType(args.type as string)
    const slug = args.slug as string
    const plural = toPlural(type)

    const spinner = prompts.spinner()
    spinner.start(`Uninstalling ${slug}...`)

    try {
      await apiFetch(
        `${cfg.apiBase}/packages/${plural}/my/${slug}`,
        { method: "DELETE" },
        cfg.token.accessToken,
      )
    } catch {
      // ignore backend errors
    }

    const extDir = path.join(OMNI_STUDIO_DIR, plural, slug)
    await fs.rm(extDir, { recursive: true, force: true })

    const state = await readState()
    if (state[plural as keyof OmniStudioState]) {
      delete state[plural as keyof OmniStudioState][slug]
      await writeState(state)
    }

    spinner.stop(`Uninstalled ${slug}`)
  },
})

export const OmniStudioEnableCommand = cmd({
  command: "enable <type> <slug>",
  describe: "enable an installed extension",
  builder: (yargs) =>
    yargs
      .positional("type", { describe: "extension type", type: "string", demandOption: true })
      .positional("slug", { describe: "extension slug", type: "string", demandOption: true }),
  async handler(args) {
    UI.empty()
    const cfg = await requireConfig()
    const type = requireType(args.type as string)
    const slug = args.slug as string
    const plural = toPlural(type)

    try {
      await apiFetch(
        `${cfg.apiBase}/packages/${plural}/my/${slug}`,
        { method: "PATCH", body: JSON.stringify({ enabled: true }) },
        cfg.token.accessToken,
      )
    } catch (e: any) {
      prompts.log.error(e.message ?? "Backend update failed")
    }

    const state = await readState()
    state[plural as keyof OmniStudioState] ??= {}
    if (state[plural as keyof OmniStudioState][slug]) {
      state[plural as keyof OmniStudioState][slug].enabled = true
      await writeState(state)
    }

    prompts.outro(`Enabled ${slug}`)
  },
})

export const OmniStudioDisableCommand = cmd({
  command: "disable <type> <slug>",
  describe: "disable an installed extension",
  builder: (yargs) =>
    yargs
      .positional("type", { describe: "extension type", type: "string", demandOption: true })
      .positional("slug", { describe: "extension slug", type: "string", demandOption: true }),
  async handler(args) {
    UI.empty()
    const cfg = await requireConfig()
    const type = requireType(args.type as string)
    const slug = args.slug as string
    const plural = toPlural(type)

    try {
      await apiFetch(
        `${cfg.apiBase}/packages/${plural}/my/${slug}`,
        { method: "PATCH", body: JSON.stringify({ enabled: false }) },
        cfg.token.accessToken,
      )
    } catch (e: any) {
      prompts.log.error(e.message ?? "Backend update failed")
    }

    const state = await readState()
    state[plural as keyof OmniStudioState] ??= {}
    if (state[plural as keyof OmniStudioState][slug]) {
      state[plural as keyof OmniStudioState][slug].enabled = false
      await writeState(state)
    }

    prompts.outro(`Disabled ${slug}`)
  },
})

export const OmniStudioStatusCommand = cmd({
  command: "status",
  describe: "show locally installed extensions",
  async handler() {
    UI.empty()
    const state = await readState()
    const cfg = await readConfig()

    const rows: string[] = []
    for (const plural of ["skills", "tools", "plugins", "agents"] as const) {
      const map = state[plural]
      if (!map) continue
      for (const [slug, info] of Object.entries(map)) {
        const type = fromPlural(plural) ?? plural
        rows.push(`${type.padEnd(6)}  ${slug.padEnd(24)}  ${info.version.padEnd(12)}  ${info.enabled ? "enabled" : "disabled"}`)
      }
    }

    if (cfg) {
      prompts.log.info(`Logged in as ${cfg.user?.nickname || cfg.user?.username || "unknown"}`)
      prompts.log.info(`API: ${cfg.apiBase}`)
      prompts.log.info(`Auth: ${cfg.authBase}`)
    } else {
      prompts.log.info("Not logged in")
    }

    UI.empty()
    if (rows.length === 0) {
      prompts.log.info("No locally installed extensions")
      return
    }

    prompts.log.info("TYPE    SLUG                      VERSION       STATUS")
    prompts.log.info("-".repeat(70))
    for (const row of rows) prompts.log.info(row)
  },
})
