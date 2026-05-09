import * as prompts from "@clack/prompts"
import { Effect } from "effect"
import { UI } from "@/cli/ui"
import * as OmniStudioAuth from "./auth"

/**
 * Launch an interactive Omni Studio login flow.
 *
 * Prompts the user for API base URL, username and password,
 * then authenticates against the Omni Studio backend and
 * persists the returned tokens locally.
 *
 * @param apiBase - Optional API base URL. If omitted the user is prompted.
 */
export async function interactiveLogin(apiBase?: string): Promise<void> {
  UI.empty()
  prompts.intro("Omni Studio Login")

  const alreadyLoggedIn = await Effect.runPromise(
    OmniStudioAuth.Service.use((svc) => svc.isLoggedIn()).pipe(
      Effect.provide(OmniStudioAuth.defaultLayer),
    ),
  )

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

  let base = apiBase
  if (!base) {
    const url = await prompts.text({
      message: "Enter Omni Studio API base URL",
      placeholder: "http://127.0.0.1:18000/api/v1",
      initialValue: "http://127.0.0.1:18000/api/v1",
    })
    if (prompts.isCancel(url)) throw new UI.CancelledError()
    base = url
  }

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

  try {
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
