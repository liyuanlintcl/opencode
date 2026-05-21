import yargs from "yargs"
import { hideBin } from "yargs/helpers"
import { RunCommand } from "./cli/cmd/run"
import { GenerateCommand } from "./cli/cmd/generate"
import * as Log from "@opencode-ai/core/util/log"
import { ConsoleCommand } from "./cli/cmd/account"
import { ProvidersCommand } from "./cli/cmd/providers"
import { AgentCommand } from "./cli/cmd/agent"
import { UpgradeCommand } from "./cli/cmd/upgrade"
import { UninstallCommand } from "./cli/cmd/uninstall"
import { ModelsCommand } from "./cli/cmd/models"
import { UI } from "./cli/ui"
import { Installation } from "./installation"
import { InstallationVersion } from "@opencode-ai/core/installation/version"
import { NamedError } from "@opencode-ai/core/util/error"
import { FormatError } from "./cli/error"
import { ServeCommand } from "./cli/cmd/serve"
import { Filesystem } from "@/util/filesystem"
import { DebugCommand } from "./cli/cmd/debug"
import { StatsCommand } from "./cli/cmd/stats"
import { McpCommand } from "./cli/cmd/mcp"
import { GithubCommand } from "./cli/cmd/github"
import { ExportCommand } from "./cli/cmd/export"
import { ImportCommand } from "./cli/cmd/import"
import { AttachCommand } from "./cli/cmd/tui/attach"
import { TuiThreadCommand } from "./cli/cmd/tui/thread"
import { AcpCommand } from "./cli/cmd/acp"
import { EOL } from "os"
import { WebCommand } from "./cli/cmd/web"
import { PrCommand } from "./cli/cmd/pr"
import { SessionCommand } from "./cli/cmd/session"
import { DbCommand } from "./cli/cmd/db"
import path from "path"
import { Global, BRAND } from "@opencode-ai/core/global"
import { JsonMigration } from "@/storage/json-migration"
import { Database } from "@/storage/db"
import { errorMessage } from "./util/error"
import { PluginCommand } from "./cli/cmd/plug"
import { Heap } from "./cli/heap"
import { drizzle } from "drizzle-orm/bun-sqlite"
import { ensureProcessMetadata } from "@opencode-ai/core/util/opencode-process"
import { isRecord } from "@/util/record"

const processMetadata = ensureProcessMetadata("main")

process.on("unhandledRejection", (e) => {
  Log.Default.error("rejection", {
    e: errorMessage(e),
  })
})

process.on("uncaughtException", (e) => {
  Log.Default.error("exception", {
    e: errorMessage(e),
  })
})

const args = hideBin(process.argv)

function show(out: string) {
  const text = out.trimStart()
  if (!text.startsWith("omni ") && !text.startsWith("opencode ")) {
    process.stderr.write(UI.logo() + EOL + EOL)
    process.stderr.write(text)
    return
  }
  process.stderr.write(out)
}

async function selfInstall() {
  const fsPromises = await import("fs/promises")
  const fsSync = await import("fs")
  const os = await import("os")
  const path = await import("path")

  const source = process.execPath
  const platform = os.platform()

  let targetDir: string
  let targetFile: string

  if (platform === "win32") {
    targetDir = path.join(os.homedir(), "AppData", "Local", "Microsoft", "WindowsApps")
    targetFile = path.join(targetDir, "omni.exe")
  } else {
    const candidates = [path.join(os.homedir(), ".local", "bin"), path.join(os.homedir(), "bin")]
    targetDir = candidates.find((d) => {
      try {
        fsSync.accessSync(d)
        return true
      } catch {
        return false
      }
    }) ?? candidates[0]
    targetFile = path.join(targetDir, "omni")
  }

  try {
    await fsPromises.mkdir(targetDir, { recursive: true })
    await fsPromises.copyFile(source, targetFile)
    if (platform !== "win32") {
      await fsPromises.chmod(targetFile, 0o755)
    }
  } catch (e) {
    process.stderr.write(`Failed to install: ${e instanceof Error ? e.message : String(e)}${EOL}`)
    process.exit(1)
  }

  const pathEnv = process.env.PATH ?? ""
  const pathDirs = pathEnv.split(platform === "win32" ? ";" : ":")
  const inPath = pathDirs.some((d) => d.trim().toLowerCase() === targetDir.toLowerCase())

  process.stderr.write(`Installed to ${targetFile}${EOL}`)
  if (!inPath) {
    if (platform === "win32") {
      try {
        const { execSync } = await import("child_process")
        execSync(
          `powershell.exe -Command "[Environment]::SetEnvironmentVariable('Path', [Environment]::GetEnvironmentVariable('Path', 'User') + ';${targetDir}', 'User')"`,
          { stdio: "ignore" },
        )
        process.stderr.write(EOL)
        process.stderr.write(`Added ${targetDir} to your user PATH.${EOL}`)
        process.stderr.write(`Restart your terminal for the change to take effect.${EOL}`)
      } catch {
        process.stderr.write(EOL)
        process.stderr.write(`WARNING: Could not add ${targetDir} to PATH automatically.${EOL}`)
        process.stderr.write(`Add it manually via System Settings.${EOL}`)
      }
    } else {
      const shell = process.env.SHELL ?? "/bin/bash"
      const profileFile = shell.includes("zsh")
        ? path.join(os.homedir(), ".zshrc")
        : path.join(os.homedir(), ".bashrc")
      try {
        let existing = ""
        try {
          existing = await fsPromises.readFile(profileFile, "utf-8")
        } catch {
          // profile may not exist yet
        }
        const exportLine = `export PATH="${targetDir}:\$PATH"`
        if (!existing.includes(exportLine)) {
          const prefix = existing === "" || existing.endsWith("\n") ? "" : "\n"
          await fsPromises.appendFile(profileFile, prefix + exportLine + "\n")
        }
        process.stderr.write(EOL)
        process.stderr.write(`Added ${targetDir} to your PATH via ${path.basename(profileFile)}.${EOL}`)
        process.stderr.write(`Run the following to apply the change in the current terminal:${EOL}`)
        process.stderr.write(`  source ${profileFile}${EOL}`)
      } catch {
        process.stderr.write(EOL)
        process.stderr.write(`WARNING: Could not update ${profileFile} automatically.${EOL}`)
        process.stderr.write(`Add the following manually:${EOL}`)
        process.stderr.write(`  export PATH="${targetDir}:\$PATH"${EOL}`)
      }
    }
  } else {
    process.stderr.write(`Run 'omni --help' to get started.${EOL}`)
  }
  process.exit(0)
}

const cli = yargs(args)
  .parserConfiguration({ "populate--": true })
  .scriptName("omni")
  .wrap(100)
  .help("help", "show help")
  .alias("help", "h")
  .version("version", "show version number", InstallationVersion)
  .alias("version", "v")
  .option("print-logs", {
    describe: "print logs to stderr",
    type: "boolean",
  })
  .option("log-level", {
    describe: "log level",
    type: "string",
    choices: ["DEBUG", "INFO", "WARN", "ERROR"],
  })
  .option("pure", {
    describe: "run without external plugins",
    type: "boolean",
  })
  .option("install", {
    describe: "install omni to PATH",
    type: "boolean",
  })
  .middleware(async (opts) => {
    if (opts.install) {
      await selfInstall()
      return
    }

    if (opts.pure) {
      process.env.OPENCODE_PURE = "1"
    }

    await Log.init({
      print: process.argv.includes("--print-logs"),
      dev: Installation.isLocal(),
      level: (() => {
        if (opts.logLevel) return opts.logLevel as Log.Level
        if (Installation.isLocal()) return "DEBUG"
        return "INFO"
      })(),
    })

    Heap.start()

    process.env.AGENT = "1"
    process.env.OPENCODE = "1"
    process.env.OPENCODE_PID = String(process.pid)

    Log.Default.info("opencode", {
      version: InstallationVersion,
      args: process.argv.slice(2),
      process_role: processMetadata.processRole,
      run_id: processMetadata.runID,
    })

    const marker = path.join(Global.Path.data, `${BRAND}.db`)
    if (!(await Filesystem.exists(marker))) {
      const tty = process.stderr.isTTY
      process.stderr.write("Performing one time database migration, may take a few minutes..." + EOL)
      const width = 36
      const orange = "\x1b[38;5;214m"
      const muted = "\x1b[0;2m"
      const reset = "\x1b[0m"
      let last = -1
      if (tty) process.stderr.write("\x1b[?25l")
      try {
        await JsonMigration.run(drizzle({ client: Database.Client().$client }), {
          progress: (event) => {
            const percent = Math.floor((event.current / event.total) * 100)
            if (percent === last && event.current !== event.total) return
            last = percent
            if (tty) {
              const fill = Math.round((percent / 100) * width)
              const bar = `${"■".repeat(fill)}${"･".repeat(width - fill)}`
              process.stderr.write(
                `\r${orange}${bar} ${percent.toString().padStart(3)}%${reset} ${muted}${event.label.padEnd(12)} ${event.current}/${event.total}${reset}`,
              )
              if (event.current === event.total) process.stderr.write("\n")
            } else {
              process.stderr.write(`sqlite-migration:${percent}${EOL}`)
            }
          },
        })
      } finally {
        if (tty) process.stderr.write("\x1b[?25h")
        else {
          process.stderr.write(`sqlite-migration:done${EOL}`)
        }
      }
      await Filesystem.write(marker, "")
      process.stderr.write("Database migration complete." + EOL)
    }
  })
  .usage("")
  .completion("completion", "generate shell completion script")
  .command(AcpCommand)
  .command(McpCommand)
  .command(TuiThreadCommand)
  .command(AttachCommand)
  .command(RunCommand)
  .command(GenerateCommand)
  .command(DebugCommand)
  .command(ConsoleCommand)
  .command(ProvidersCommand)
  .command(AgentCommand)
  .command(UpgradeCommand)
  .command(UninstallCommand)
  .command(ServeCommand)
  .command(WebCommand)
  .command(ModelsCommand)
  .command(StatsCommand)
  .command(ExportCommand)
  .command(ImportCommand)
  .command(GithubCommand)
  .command(PrCommand)
  .command(SessionCommand)
  .command(PluginCommand)
  .command(DbCommand)
  .fail((msg, err) => {
    if (
      msg?.startsWith("Unknown argument") ||
      msg?.startsWith("Not enough non-option arguments") ||
      msg?.startsWith("Invalid values:")
    ) {
      if (err) throw err
      cli.showHelp(show)
    }
    if (err) throw err
    process.exit(1)
  })
  .strict()

try {
  if (args.includes("-h") || args.includes("--help")) {
    await cli.parse(args, (err: Error | undefined, _argv: unknown, out: string) => {
      if (err) throw err
      if (!out) return
      show(out)
    })
  } else {
    await cli.parse()
  }
} catch (e) {
  let data: Record<string, any> = {}
  if (e instanceof Error) {
    Object.assign(data, {
      name: e.name,
      message: e.message,
      cause: e.cause?.toString(),
      stack: e.stack,
    })
  }

  if (e instanceof NamedError) {
    const obj = e.toObject()
    if (isRecord(obj.data)) {
      for (const [key, value] of Object.entries(obj.data)) {
        if (key === "name" || key === "stack" || key === "cause") continue
        data[key] = value
      }
    }
  }

  if (e instanceof ResolveMessage) {
    Object.assign(data, {
      name: e.name,
      message: e.message,
      code: e.code,
      specifier: e.specifier,
      referrer: e.referrer,
      position: e.position,
      importKind: e.importKind,
    })
  }
  Log.Default.error("fatal", data)
  const formatted = FormatError(e)
  if (formatted) UI.error(formatted)
  if (formatted === undefined) {
    UI.error("Unexpected error, check log file at " + Log.file() + " for more details" + EOL)
    process.stderr.write(errorMessage(e) + EOL)
  }
  process.exitCode = 1
} finally {
  // Some subprocesses don't react properly to SIGTERM and similar signals.
  // Most notably, some docker-container-based MCP servers don't handle such signals unless
  // run using `docker run --init`.
  // Explicitly exit to avoid any hanging subprocesses.
  process.exit()
}
