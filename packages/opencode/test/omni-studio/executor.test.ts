import { test, expect, describe, beforeEach, afterEach } from "bun:test"
import { Effect } from "effect"
import path from "path"
import fs from "fs/promises"
import os from "os"
import { detectScripts, runScript } from "../../src/omni-studio/executor"

describe("OmniStudioExecutor", () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "omni-studio-executor-"))
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  test("detectScripts finds scripts in lifecycle/ matching OS suffix", async () => {
    await fs.mkdir(path.join(tmpDir, "lifecycle"), { recursive: true })
    await fs.writeFile(path.join(tmpDir, "lifecycle", "install.sh"), "#!/bin/sh\n")
    await fs.writeFile(path.join(tmpDir, "lifecycle", "activate.sh"), "#!/bin/sh\n")

    const scripts = await Effect.runPromise(detectScripts(tmpDir))
    expect(scripts.install).toBe("lifecycle/install.sh")
    expect(scripts.activate).toBe("lifecycle/activate.sh")
    expect(scripts.uninstall).toBeUndefined()
  })

  test("runScript executes lifecycle/install.sh with cwd at extension root", async () => {
    await fs.mkdir(path.join(tmpDir, "lifecycle"), { recursive: true })
    await fs.writeFile(path.join(tmpDir, "lifecycle", "install.sh"), "#!/bin/sh\necho 'hello' > output.txt\n")
    await fs.chmod(path.join(tmpDir, "lifecycle", "install.sh"), 0o755)

    const result = await Effect.runPromise(runScript(tmpDir, "install", { install: "lifecycle/install.sh" }))
    expect(result.exitCode).toBe(0)

    const output = await fs.readFile(path.join(tmpDir, "output.txt"), "utf-8")
    expect(output.trim()).toBe("hello")
  })

  test("runScript with activate sources lifecycle/activate first", async () => {
    await fs.mkdir(path.join(tmpDir, "lifecycle"), { recursive: true })
    await fs.writeFile(path.join(tmpDir, "lifecycle", "activate.sh"), "#!/bin/sh\nexport MY_VAR=activated\n")
    await fs.writeFile(path.join(tmpDir, "lifecycle", "install.sh"), "#!/bin/sh\necho \"$MY_VAR\" > output.txt\n")
    await fs.chmod(path.join(tmpDir, "lifecycle", "activate.sh"), 0o755)
    await fs.chmod(path.join(tmpDir, "lifecycle", "install.sh"), 0o755)

    const result = await Effect.runPromise(runScript(tmpDir, "install", { install: "lifecycle/install.sh", activate: "lifecycle/activate.sh" }))
    expect(result.exitCode).toBe(0)

    const output = await fs.readFile(path.join(tmpDir, "output.txt"), "utf-8")
    expect(output.trim()).toBe("activated")
  })

  test("runScript fails on bad script", async () => {
    await fs.mkdir(path.join(tmpDir, "lifecycle"), { recursive: true })
    await fs.writeFile(path.join(tmpDir, "lifecycle", "install.sh"), "#!/bin/sh\nexit 1\n")
    await fs.chmod(path.join(tmpDir, "lifecycle", "install.sh"), 0o755)

    await expect(Effect.runPromise(runScript(tmpDir, "install", { install: "lifecycle/install.sh" }))).rejects.toBeDefined()
  })
})
