import * as prompts from "@clack/prompts"
import { Effect } from "effect"
import { UI } from "@/cli/ui"
import * as OmniStudioAuth from "./auth"

/**
 * 启动交互式 Omni Studio 登录流程。
 *
 * 依次提示用户输入 API 基础地址、用户名和密码，
 * 然后调用后端认证 API 并将返回的 token 持久化到本地。
 *
 * @param apiBase - 可选的 API 基础地址。如未提供，将交互式询问用户。
 */
export async function interactiveLogin(apiBase?: string): Promise<void> {
  UI.empty()
  prompts.intro("Omni Studio Login")

  /** 检查当前是否已登录 */
  const alreadyLoggedIn = await Effect.runPromise(
    OmniStudioAuth.Service.use((svc) => svc.isLoggedIn()).pipe(
      Effect.provide(OmniStudioAuth.defaultLayer),
    ),
  )

  /** 如已登录，询问是否重新认证 */
  if (alreadyLoggedIn) {
    const shouldReauth = await prompts.confirm({
      message: "Already logged in. Re-authenticate?",
      initialValue: false,
    })

    if (prompts.isCancel(shouldReauth) || !shouldReauth) {
      prompts.outro("Cancelled")
      return
    }
  }

  /** 如未通过参数传入 API 地址，交互式询问 */
  let base = apiBase
  if (!base) {
    const url = await prompts.text({
      message: "Enter Omni Studio service base URL (used for both auth and API)",
      placeholder: "http://127.0.0.1:18000/api/",
      initialValue: "http://127.0.0.1:18000/api/",
    })
    if (prompts.isCancel(url)) throw new UI.CancelledError()
    base = url
  }

  /** 交互式输入用户名 */
  const username = await prompts.text({
    message: "Enter username",
    validate: (x) => (x && x.length > 0 ? undefined : "Required"),
  })
  if (prompts.isCancel(username)) throw new UI.CancelledError()

  /** 交互式输入密码（输入内容隐藏） */
  const password = await prompts.password({
    message: "Enter password",
  })
  if (prompts.isCancel(password)) throw new UI.CancelledError()

  /** 显示认证进度 spinner */
  const spinner = prompts.spinner()
  spinner.start("Authenticating...")

  try {
    /** 调用认证服务完成登录 */
    const config = await Effect.runPromise(
      OmniStudioAuth.Service.use((svc) =>
        svc.login({ username, password }, base!),
      ).pipe(Effect.provide(OmniStudioAuth.defaultLayer)),
    )
    spinner.stop("Authentication successful!")
    prompts.log.success(`Logged in as ${config.user.username}`)
    prompts.outro("Done")
  } catch (error) {
    spinner.stop("Authentication failed", 1)
    prompts.log.error(error instanceof Error ? error.message : String(error))
    prompts.outro("Failed")
  }
}
