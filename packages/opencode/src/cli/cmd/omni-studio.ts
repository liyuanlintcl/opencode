import { cmd } from "./cmd"
import * as prompts from "@clack/prompts"
import { UI } from "../ui"
import { Effect } from "effect"
import { interactiveLogin } from "../../omni-studio/interactive"
import { OmniStudioAuth } from "../../omni-studio/auth"
import { OmniStudioMarket } from "../../omni-studio/market"
import { OmniStudioStore } from "../../omni-studio/store"
import type { ExtensionType } from "../../omni-studio/types"

/**
 * 使用 OmniStudioStore 默认 Layer 运行 Effect。
 * 自动注入 Market、Config 和 FileSystem 依赖。
 */
async function runEffect<A, E>(eff: Effect.Effect<A, E, OmniStudioStore.Service>) {
  return Effect.runPromise(eff.pipe(Effect.provide(OmniStudioStore.defaultLayer)))
}

/**
 * 使用 OmniStudioAuth 默认 Layer 运行 Effect。
 * 仅用于登出等纯认证操作。
 */
async function runAuth<A, E>(eff: Effect.Effect<A, E, OmniStudioAuth.Service>) {
  return Effect.runPromise(eff.pipe(Effect.provide(OmniStudioAuth.defaultLayer)))
}

/**
 * 使用 OmniStudioMarket 默认 Layer 运行 Effect。
 * 自动注入 Auth 和 Config 依赖。
 */
async function runMarket<A, E>(eff: Effect.Effect<A, E, OmniStudioMarket.Service>) {
  return Effect.runPromise(eff.pipe(Effect.provide(OmniStudioMarket.defaultLayer)))
}

/** Omni Studio 主命令：管理 Marketplace 扩展 */
export const OmniStudioCommand = cmd({
  command: "omni-studio",
  aliases: ["omni"],
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

/** 登录命令：交互式登录到 Omni Studio Marketplace */
export const OmniStudioLoginCommand = cmd({
  command: "login [apiBase]",
  describe: "log in to Omni Studio Marketplace",
  builder: (yargs) =>
    yargs.positional("apiBase", {
      describe: "Omni Studio API base URL",
      type: "string",
    }),
  async handler(args) {
    try {
      await interactiveLogin(args.apiBase)
    } catch (error) {
      if (error instanceof UI.CancelledError) return
      prompts.log.error(error instanceof Error ? error.message : String(error))
    }
  },
})

/** 登出命令：清除本地 Omni Studio 登录凭证 */
export const OmniStudioLogoutCommand = cmd({
  command: "logout",
  describe: "log out from Omni Studio Marketplace",
  async handler() {
    try {
      await runAuth(OmniStudioAuth.Service.use((svc) => svc.logout()))
      prompts.log.success("Logged out successfully")
    } catch (error) {
      prompts.log.error(error instanceof Error ? error.message : String(error))
    }
  },
})

/** 列表命令：查看远程 Marketplace 扩展列表 */
export const OmniStudioListCommand = cmd({
  command: "list [type]",
  aliases: ["ls"],
  describe: "list marketplace extensions",
  builder: (yargs) =>
    yargs.positional("type", {
      describe: "extension type filter",
      type: "string",
      choices: ["skill", "tool", "plugin", "agent"] as ExtensionType[],
    }),
  async handler(args) {
    UI.empty()
    prompts.intro("Omni Studio Extensions")

    try {
      const extensions = await runMarket(
        OmniStudioMarket.Service.use((svc) => svc.list(args.type as ExtensionType)),
      )

      if (extensions.length === 0) {
        prompts.log.warn("No extensions found")
        prompts.outro("Done")
        return
      }

      for (const ext of extensions) {
        prompts.log.info(
          `${ext.name} (${ext.slug}) ${UI.Style.TEXT_DIM}v${ext.version} — ${ext.type} by ${ext.author}`,
        )
      }

      prompts.outro(`${extensions.length} extension(s)`)
    } catch (error) {
      prompts.log.error(error instanceof Error ? error.message : String(error))
      prompts.outro("Failed")
    }
  },
})

/** 安装命令：从 Marketplace 安装指定扩展 */
export const OmniStudioInstallCommand = cmd({
  command: "install <type> <slug> [version]",
  describe: "install a marketplace extension",
  builder: (yargs) =>
    yargs
      .positional("type", {
        describe: "extension type",
        type: "string",
        demandOption: true,
        choices: ["skill", "tool", "plugin", "agent"] as ExtensionType[],
      })
      .positional("slug", {
        describe: "extension slug",
        type: "string",
        demandOption: true,
      })
      .positional("version", {
        describe: "extension version",
        type: "string",
        default: "latest",
      }),
  async handler(args) {
    UI.empty()
    prompts.intro("Omni Studio Install")

    try {
      const meta = await runMarket(
        OmniStudioMarket.Service.use((svc) => svc.getMeta(args.type as ExtensionType, args.slug)),
      )

      const version = args.version === "latest" ? meta.version : args.version
      const ext = { ...meta, version }

      const spinner = prompts.spinner()
      spinner.start(`Installing ${ext.slug}@${ext.version}...`)

      await runEffect(OmniStudioStore.Service.use((svc) => svc.install(ext)))

      spinner.stop(`Installed ${ext.slug}@${ext.version}`)
      prompts.log.success(`Extension "${ext.name}" installed successfully`)
      prompts.outro("Done")
    } catch (error) {
      prompts.log.error(error instanceof Error ? error.message : String(error))
      prompts.outro("Failed")
    }
  },
})

/** 卸载命令：移除本地已安装的扩展 */
export const OmniStudioUninstallCommand = cmd({
  command: "uninstall <type> <slug>",
  aliases: ["rm"],
  describe: "uninstall a local extension",
  builder: (yargs) =>
    yargs
      .positional("type", {
        describe: "extension type",
        type: "string",
        demandOption: true,
        choices: ["skill", "tool", "plugin", "agent"] as ExtensionType[],
      })
      .positional("slug", {
        describe: "extension slug",
        type: "string",
        demandOption: true,
      }),
  async handler(args) {
    UI.empty()
    prompts.intro("Omni Studio Uninstall")

    try {
      await runEffect(
        OmniStudioStore.Service.use((svc) => svc.uninstall(args.type as ExtensionType, args.slug)),
      )
      prompts.log.success(`Extension "${args.slug}" uninstalled successfully`)
      prompts.outro("Done")
    } catch (error) {
      prompts.log.error(error instanceof Error ? error.message : String(error))
      prompts.outro("Failed")
    }
  },
})

/** 启用命令：启用本地已安装的扩展 */
export const OmniStudioEnableCommand = cmd({
  command: "enable <type> <slug>",
  describe: "enable a local extension",
  builder: (yargs) =>
    yargs
      .positional("type", {
        describe: "extension type",
        type: "string",
        demandOption: true,
        choices: ["skill", "tool", "plugin", "agent"] as ExtensionType[],
      })
      .positional("slug", {
        describe: "extension slug",
        type: "string",
        demandOption: true,
      }),
  async handler(args) {
    UI.empty()
    prompts.intro("Omni Studio Enable")

    try {
      await runEffect(
        OmniStudioStore.Service.use((svc) => svc.setEnabled(args.type as ExtensionType, args.slug, true)),
      )
      prompts.log.success(`Extension "${args.slug}" enabled successfully`)
      prompts.outro("Done")
    } catch (error) {
      prompts.log.error(error instanceof Error ? error.message : String(error))
      prompts.outro("Failed")
    }
  },
})

/** 禁用命令：禁用本地已安装的扩展 */
export const OmniStudioDisableCommand = cmd({
  command: "disable <type> <slug>",
  describe: "disable a local extension",
  builder: (yargs) =>
    yargs
      .positional("type", {
        describe: "extension type",
        type: "string",
        demandOption: true,
        choices: ["skill", "tool", "plugin", "agent"] as ExtensionType[],
      })
      .positional("slug", {
        describe: "extension slug",
        type: "string",
        demandOption: true,
      }),
  async handler(args) {
    UI.empty()
    prompts.intro("Omni Studio Disable")

    try {
      await runEffect(
        OmniStudioStore.Service.use((svc) => svc.setEnabled(args.type as ExtensionType, args.slug, false)),
      )
      prompts.log.success(`Extension "${args.slug}" disabled successfully`)
      prompts.outro("Done")
    } catch (error) {
      prompts.log.error(error instanceof Error ? error.message : String(error))
      prompts.outro("Failed")
    }
  },
})

/** 状态命令：查看登录状态和本地扩展列表 */
export const OmniStudioStatusCommand = cmd({
  command: "status",
  describe: "show login status and installed extensions",
  async handler() {
    UI.empty()
    prompts.intro("Omni Studio Status")

    try {
      const { config, extensions } = await runEffect(
        OmniStudioStore.Service.use((svc) => svc.getStatus()),
      )

      if (config) {
        prompts.log.success(`Logged in as ${config.user.username}`)
      } else {
        prompts.log.warn("Not logged in")
      }

      if (extensions.length === 0) {
        prompts.log.info("No extensions installed")
      } else {
        prompts.log.info("Installed extensions:")
        for (const ext of extensions) {
          const status = ext.enabled ? "enabled" : "disabled"
          prompts.log.info(
            `  ${ext.type} / ${ext.slug} ${UI.Style.TEXT_DIM}v${ext.version} — ${status}`,
          )
        }
      }

      prompts.outro("Done")
    } catch (error) {
      prompts.log.error(error instanceof Error ? error.message : String(error))
      prompts.outro("Failed")
    }
  },
})
