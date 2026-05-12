import path from "path"
import { Effect } from "effect"
import type { ExtensionScripts } from "./types"

/** 获取当前操作系统对应的脚本后缀 */
function getScriptSuffix(): ".sh" | ".bat" | ".ps1" {
  if (process.platform === "win32") return ".bat"
  return ".sh"
}

/**
 * 检测扩展目录中存在的生命周期脚本（按当前 OS 匹配后缀）。
 * 返回匹配到的脚本文件名（不含路径）或 undefined。
 */
export function detectScripts(extensionDir: string): Effect.Effect<ExtensionScripts, never> {
  return Effect.gen(function* () {
    const primarySuffix = getScriptSuffix()
    const fallbackSuffix: ".ps1" | undefined = process.platform === "win32" ? ".ps1" : undefined
    const scripts: ExtensionScripts = {}

    for (const name of ["install", "start", "stop", "uninstall", "activate"] as const) {
      const primaryPath = path.join(extensionDir, "lifecycle", `${name}${primarySuffix}`)
      const exists = yield* Effect.tryPromise({
        try: () => Bun.file(primaryPath).exists(),
        catch: () => false,
      }).pipe(Effect.orElseSucceed(() => false))

      if (exists) {
        scripts[name] = path.join("lifecycle", `${name}${primarySuffix}`)
      } else if (fallbackSuffix) {
        const fallbackPath = path.join(extensionDir, "lifecycle", `${name}${fallbackSuffix}`)
        const fallbackExists = yield* Effect.tryPromise({
          try: () => Bun.file(fallbackPath).exists(),
          catch: () => false,
        }).pipe(Effect.orElseSucceed(() => false))

        if (fallbackExists) {
          scripts[name] = path.join("lifecycle", `${name}${fallbackSuffix}`)
        }
      }
    }

    return scripts
  })
}

/**
 * 执行单个生命周期脚本。
 * 如存在 activate 脚本，先 source/调用 activate 再执行目标脚本。
 */
export function runScript(
  extensionDir: string,
  scriptName: "install" | "start" | "stop" | "uninstall",
  scripts: ExtensionScripts,
): Effect.Effect<{ exitCode: number; stdout: string; stderr: string }, string> {
  const scriptFile = scripts[scriptName]
  if (!scriptFile) {
    return Effect.succeed({ exitCode: 0, stdout: "", stderr: "" })
  }

  const activateFile = scripts.activate
  const scriptPath = path.join(extensionDir, scriptFile)
  const activatePath = activateFile ? path.join(extensionDir, activateFile) : undefined

  return Effect.tryPromise({
    try: async () => {
      const suffix = path.extname(scriptFile) as ".sh" | ".bat" | ".ps1"
      let cmd: string[]

      if (suffix === ".sh") {
        const script = activatePath
          ? `. "${activatePath}" && "${scriptPath}"`
          : `"${scriptPath}"`
        cmd = ["/bin/sh", "-c", script]
      } else if (suffix === ".bat") {
        const script = activatePath
          ? `"${activatePath}" && "${scriptPath}"`
          : `"${scriptPath}"`
        cmd = ["cmd", "/c", script]
      } else {
        const script = activatePath
          ? `. "${activatePath}"; "${scriptPath}"`
          : `"${scriptPath}"`
        cmd = ["pwsh", "-Command", script]
      }

      const proc = Bun.spawn(cmd, {
        cwd: extensionDir,
        timeout: 5 * 60 * 1000,
        stdout: "pipe",
        stderr: "pipe",
      })

      const stdout = await new Response(proc.stdout).text()
      const stderr = await new Response(proc.stderr).text()
      const exitCode = await proc.exited

      if (exitCode !== 0) {
        throw new Error(`Script ${scriptName} failed (exit ${exitCode}): ${stderr || stdout}`)
      }

      return { exitCode, stdout, stderr }
    },
    catch: (error) => (error instanceof Error ? error.message : String(error)),
  })
}
