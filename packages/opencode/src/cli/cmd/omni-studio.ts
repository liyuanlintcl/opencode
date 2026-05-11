import { cmd } from "./cmd"
import * as prompts from "@clack/prompts"
import { UI } from "../ui"
import { Effect } from "effect"
import { OmniStudioAuth } from "../../omni-studio/auth"
import { OmniStudioConfig } from "../../omni-studio/config"
import { OmniStudioMarket } from "../../omni-studio/market"
import { OmniStudioStore } from "../../omni-studio/store"
import type { ExtensionType, Extension } from "../../omni-studio/types"

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
      .command(OmniStudioSetupCommand)
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

/** 设置命令：配置 Omni Studio 认证地址和 API 地址 */
export const OmniStudioSetupCommand = cmd({
  command: "setup",
  describe: "configure Omni Studio auth and API base URLs",
  async handler() {
    try {
      UI.empty()
      prompts.intro("Omni Studio Setup")

      const authUrl = await prompts.text({
        message: "Enter Omni Studio auth base URL",
        placeholder: "http://127.0.0.1:18000/api/",
        initialValue: "http://127.0.0.1:18000/api/",
      })
      if (prompts.isCancel(authUrl)) throw new UI.CancelledError()

      const apiUrl = await prompts.text({
        message: "Enter Omni Studio API base URL (press Enter to use same as auth)",
        placeholder: authUrl,
        initialValue: authUrl,
      })
      if (prompts.isCancel(apiUrl)) throw new UI.CancelledError()

      await Effect.runPromise(
        OmniStudioConfig.Service.use((svc) => svc.setEndpoints(authUrl, apiUrl || authUrl)).pipe(
          Effect.provide(OmniStudioConfig.defaultLayer),
        ),
      )

      prompts.log.success("Endpoints configured successfully")
      prompts.outro("Done")
    } catch (error) {
      if (error instanceof UI.CancelledError) {
        prompts.outro("Cancelled")
        return
      }
      prompts.log.error(error instanceof Error ? error.message : String(error))
      prompts.outro("Failed")
    }
  },
})

/** 登录命令：交互式登录到 Omni Studio Marketplace */
export const OmniStudioLoginCommand = cmd({
  command: "login",
  describe: "log in to Omni Studio Marketplace",
  async handler() {
    try {
      UI.empty()
      prompts.intro("Omni Studio Login")

      const username = await prompts.text({
        message: "Enter username",
        validate: (x) => (x && x.length > 0 ? undefined : "Required"),
      })
      if (prompts.isCancel(username)) throw new UI.CancelledError()

      const password = await prompts.password({
        message: "Enter password",
      })
      if (prompts.isCancel(password)) throw new UI.CancelledError()

      const spinner = prompts.spinner()
      spinner.start("Authenticating...")

      const config = await Effect.runPromise(
        OmniStudioAuth.Service.use((svc) => svc.login({ username, password })).pipe(
          Effect.provide(OmniStudioAuth.defaultLayer),
        ),
      )

      spinner.stop("Authentication successful!")
      prompts.log.success(`Logged in as ${config.user.username}`)
      prompts.outro("Done")
    } catch (error) {
      if (error instanceof UI.CancelledError) {
        prompts.outro("Cancelled")
        return
      }
      prompts.log.error(error instanceof Error ? error.message : String(error))
      prompts.outro("Failed")
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

/** 列表命令：交互式查看远程 Marketplace 扩展列表，支持直接安装 */
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

      const { extensions: localExtensions } = await runEffect(
        OmniStudioStore.Service.use((svc) => svc.getStatus()),
      )
      const localMap = new Map(localExtensions.map((e) => [`${e.type}:${e.slug}`, e]))

      while (true) {
        const options: Array<{ label: string; value: string; hint: string }> = extensions.map((ext) => {
          const local = localMap.get(`${ext.type}:${ext.slug}`)
          const installedTag = local ? " [已安装]" : " [未安装]"
          return {
            label: `${ext.name} (v${ext.version})${installedTag}`,
            value: ext.slug,
            hint: `${ext.type} by ${ext.author}`,
          }
        })
        options.push({ label: "退出", value: "__exit__", hint: "" })

        const selected = await prompts.select({
          message: "选择扩展（显示本地安装状态）",
          options,
        })

        if (prompts.isCancel(selected)) break
        if (selected === "__exit__") break

        const ext = extensions.find((e) => e.slug === selected)
        if (!ext) {
          prompts.log.error("扩展未找到")
          continue
        }

        const local = localMap.get(`${ext.type}:${ext.slug}`)
        if (local) {
          prompts.log.info("该扩展已安装")
          continue
        }

        const confirmed = await prompts.confirm({
          message: `安装 ${ext.slug}?`,
        })
        if (prompts.isCancel(confirmed) || !confirmed) continue

        const spinner = prompts.spinner()
        spinner.start(`Installing ${ext.slug}@${ext.version}...`)

        try {
          await runEffect(OmniStudioStore.Service.use((svc) => svc.install(ext)))
          spinner.stop(`Installed ${ext.slug}@${ext.version}`)
          prompts.log.success(`扩展 "${ext.name}" 安装成功`)
          localMap.set(`${ext.type}:${ext.slug}`, {
            type: ext.type,
            slug: ext.slug,
            version: ext.version,
            enabled: true,
            installed_at: new Date().toISOString(),
          })
        } catch (error) {
          spinner.stop(`Install failed`, 1)
          prompts.log.error(error instanceof Error ? error.message : String(error))
        }
      }

      prompts.outro("Done")
    } catch (error) {
      if (error instanceof UI.CancelledError) {
        prompts.outro("Cancelled")
        return
      }
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

/** 状态命令：交互式查看本地已安装扩展并支持启用/禁用/卸载 */
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
        prompts.log.warn("No extensions installed")
        prompts.outro("Done")
        return
      }

      while (true) {
        const options: Array<{ label: string; value: string; hint: string }> = extensions.map((ext) => {
          const statusText = ext.enabled ? "enabled" : "disabled"
          return {
            label: `${ext.slug} (v${ext.version}) [${statusText}]`,
            value: `${ext.type}:${ext.slug}`,
            hint: ext.type,
          }
        })
        options.push({ label: "退出", value: "__exit__", hint: "" })

        const selected = await prompts.select({
          message: "选择本地扩展进行管理",
          options,
        })

        if (prompts.isCancel(selected)) break
        if (selected === "__exit__") break

        const [type, slug] = selected.split(":") as [ExtensionType, string]
        const ext = extensions.find((e) => e.type === type && e.slug === slug)
        if (!ext) {
          prompts.log.error("扩展未找到")
          continue
        }

        const action = await prompts.select({
          message: `对 ${slug} 执行操作`,
          options: [
            { label: "启用", value: "enable" },
            { label: "禁用", value: "disable" },
            { label: "卸载", value: "uninstall" },
            { label: "返回", value: "back" },
          ],
        })

        if (prompts.isCancel(action) || action === "back") continue

        if (action === "enable") {
          try {
            await runEffect(OmniStudioStore.Service.use((svc) => svc.setEnabled(type, slug, true)))
            prompts.log.success(`扩展 "${slug}" 已启用`)
            ext.enabled = true
          } catch (error) {
            prompts.log.error(error instanceof Error ? error.message : String(error))
          }
        } else if (action === "disable") {
          try {
            await runEffect(OmniStudioStore.Service.use((svc) => svc.setEnabled(type, slug, false)))
            prompts.log.success(`扩展 "${slug}" 已禁用`)
            ext.enabled = false
          } catch (error) {
            prompts.log.error(error instanceof Error ? error.message : String(error))
          }
        } else if (action === "uninstall") {
          try {
            await runEffect(OmniStudioStore.Service.use((svc) => svc.uninstall(type, slug)))
            prompts.log.success(`扩展 "${slug}" 已卸载`)
            const idx = extensions.findIndex((e) => e.type === type && e.slug === slug)
            if (idx !== -1) extensions.splice(idx, 1)
          } catch (error) {
            prompts.log.error(error instanceof Error ? error.message : String(error))
          }
        }
      }

      prompts.outro("Done")
    } catch (error) {
      if (error instanceof UI.CancelledError) {
        prompts.outro("Cancelled")
        return
      }
      prompts.log.error(error instanceof Error ? error.message : String(error))
      prompts.outro("Failed")
    }
  },
})
