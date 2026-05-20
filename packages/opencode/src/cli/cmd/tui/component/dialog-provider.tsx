import { createMemo, createSignal, onMount, Show } from "solid-js"
import { useSync } from "@tui/context/sync"
import { map, pipe, sortBy } from "remeda"
import { DialogSelect } from "@tui/ui/dialog-select"
import { useDialog } from "@tui/ui/dialog"
import { useSDK } from "../context/sdk"
import { DialogPrompt } from "../ui/dialog-prompt"
import { Link } from "../ui/link"
import { useTheme } from "../context/theme"
import { TextAttributes } from "@opentui/core"
import type { ProviderAuthAuthorization, ProviderAuthMethod } from "@opencode-ai/sdk/v2"
import { DialogModel } from "./dialog-model"
import * as Clipboard from "@tui/util/clipboard"
import { useToast } from "../ui/toast"
import { isConsoleManagedProvider } from "@tui/util/provider-origin"
import { useConnected } from "./use-connected"
import { useBindings } from "../keymap"

const PROVIDER_PRIORITY: Record<string, number> = {
  opencode: 0,
  "opencode-go": 1,
  openai: 2,
  "github-copilot": 3,
  anthropic: 4,
  google: 5,
}

const CUSTOM_PROVIDER_OPTION_VALUE = "__opencode_custom_provider__"
const CUSTOM_PROVIDER_ID = /^[a-z0-9][a-z0-9-_]*$/

type ProviderOptionBase = {
  title: string
  value: string
  description?: string
  category: string
}

type ProviderOption =
  | (ProviderOptionBase & {
      type: "provider"
      providerID: string
    })
  | (ProviderOptionBase & {
      type: "custom"
    })

export function providerOptions(list: { id: string; name: string }[]): ProviderOption[] {
  return [
    ...pipe(
      list,
      sortBy((x) => PROVIDER_PRIORITY[x.id] ?? 99),
      map((provider) => ({
        type: "provider" as const,
        title: provider.name,
        value: provider.id,
        providerID: provider.id,
        description: {
          opencode: "(Recommended)",
          anthropic: "(API key)",
          openai: "(ChatGPT Plus/Pro or API key)",
          "opencode-go": "Low cost subscription for everyone",
        }[provider.id],
        category: provider.id in PROVIDER_PRIORITY ? "Popular" : "Providers",
      })),
    ),
    {
      type: "custom",
      title: "Other",
      value: CUSTOM_PROVIDER_OPTION_VALUE,
      description: "Custom provider",
      category: "Providers",
    },
  ]
}

export function normalizeCustomProviderID(value: string) {
  const providerID = value.trim().replace(/^@ai-sdk\//, "")
  if (!CUSTOM_PROVIDER_ID.test(providerID)) return
  return providerID
}

export function createDialogProviderOptions() {
  const sync = useSync()
  const dialog = useDialog()
  const sdk = useSDK()
  const toast = useToast()
  const { theme } = useTheme()
  const onboarded = useConnected()

  async function promptCustomProviderID(): Promise<string | undefined> {
    const value = await DialogPrompt.show(dialog, "Other", {
      placeholder: "Provider id",
      description: () => (
        <text fg={theme.textMuted}>
          Custom provider using OpenAI-compatible API. Enter a unique id (e.g. my-provider).
        </text>
      ),
    })
    if (value === null) return

    const providerID = normalizeCustomProviderID(value)
    if (providerID) return providerID

    toast.show({
      variant: "error",
      message:
        "Provider ids must start with a lowercase letter or number and only use lowercase letters, numbers, hyphens, and underscores",
    })
    return promptCustomProviderID()
  }

  async function showProviderConfigMenu(
    providerID: string,
    initial?: { baseURL: string; models: Array<{ id: string; name: string }>; hasKey: boolean },
  ): Promise<{ baseURL: string; models: Array<{ id: string; name: string }>; apiKey: string | null } | null> {
    let baseURL = initial?.baseURL ?? ""
    const models = initial?.models ? [...initial.models] : []
    let apiKey: string | null = null

    while (true) {
      const menuOptions: Array<{
        title: string
        value: string
        category: string
      }> = [
        { title: `Base URL: ${baseURL || "(not set)"}`, value: "baseURL", category: "Configuration" },
        {
          title: `API Key: ${apiKey !== null ? "(will update)" : initial?.hasKey ? "(set)" : "(not set)"}`,
          value: "apiKey",
          category: "Configuration",
        },
        ...models.map((m) => ({ title: `${m.name} (${m.id})`, value: `model:${m.id}`, category: "Models" })),
        { title: "+ Add Model", value: "addModel", category: "Actions" },
        { title: "Save & Close", value: "save", category: "Actions" },
        { title: "Cancel", value: "cancel", category: "Actions" },
      ]

      const selected = await new Promise<string | null>((resolve) => {
        dialog.replace(
          () => (
            <DialogSelect
              title={`Configure ${providerID}`}
              options={menuOptions}
              onSelect={(option) => resolve(String(option.value))}
            />
          ),
          () => resolve(null),
        )
      })

      if (selected === null || selected === "cancel") return null

      if (selected === "save") {
        return { baseURL, models, apiKey }
      }

      if (selected === "baseURL") {
        const value = await DialogPrompt.show(dialog, "Base URL", {
          placeholder: "https://api.example.com/v1",
          description: () => <text fg={theme.textMuted}>The API endpoint URL for this provider.</text>,
          value: baseURL,
        })
        if (value !== null) baseURL = value.trim()
        continue
      }

      if (selected === "apiKey") {
        const value = await DialogPrompt.show(dialog, "API Key", {
          placeholder: initial?.hasKey ? "Leave empty to keep current key" : "sk-...",
          description: () => <text fg={theme.textMuted}>Your API key for this provider.</text>,
        })
        if (value !== null) apiKey = value.trim() || null
        continue
      }

      if (selected === "addModel") {
        const id = await DialogPrompt.show(dialog, "Model ID", {
          placeholder: "e.g. gpt-4, claude-sonnet-4-5",
          description: () => <text fg={theme.textMuted}>The model identifier used in API requests.</text>,
        })
        if (!id) continue
        const name = await DialogPrompt.show(dialog, "Model Name", {
          placeholder: id,
          description: () => <text fg={theme.textMuted}>Display name for this model (optional).</text>,
        })
        if (name === null) continue
        models.push({ id: id.trim(), name: name.trim() || id.trim() })
        continue
      }

      if (selected.startsWith("model:")) {
        const modelId = selected.slice(6)
        const index = models.findIndex((m) => m.id === modelId)
        if (index === -1) continue

        const action = await new Promise<string | null>((resolve) => {
          dialog.replace(
            () => (
              <DialogSelect
                title={models[index].name}
                options={[
                  { title: "Edit", value: "edit", category: "Action" },
                  { title: "Delete", value: "delete", category: "Action" },
                  { title: "Cancel", value: "cancel", category: "Action" },
                ]}
                onSelect={(option) => resolve(String(option.value))}
              />
            ),
            () => resolve(null),
          )
        })

        if (action === null || action === "cancel") continue

        if (action === "edit") {
          const id = await DialogPrompt.show(dialog, "Model ID", {
            placeholder: "e.g. gpt-4",
            description: () => <text fg={theme.textMuted}>The model identifier used in API requests.</text>,
            value: models[index].id,
          })
          if (!id) continue
          const name = await DialogPrompt.show(dialog, "Model Name", {
            placeholder: id,
            description: () => <text fg={theme.textMuted}>Display name for this model (optional).</text>,
            value: models[index].name,
          })
          if (name === null) continue
          models[index] = { id: id.trim(), name: name.trim() || id.trim() }
        }

        if (action === "delete") {
          models.splice(index, 1)
        }
      }
    }
  }

  async function setupCustomProvider(providerID: string) {
    const result = await showProviderConfigMenu(providerID)
    if (!result) return
    if (result.models.length === 0) {
      toast.show({ variant: "error", message: "At least one model is required" })
      return
    }
    if (!result.baseURL) {
      toast.show({ variant: "error", message: "Base URL is required" })
      return
    }
    if (!result.apiKey) {
      toast.show({ variant: "error", message: "API Key is required" })
      return
    }

    const modelsConfig: Record<string, { name: string; provider: { npm: string; api: string } }> = {}
    for (const m of result.models) {
      modelsConfig[m.id] = {
        name: m.name,
        provider: { npm: "@ai-sdk/openai-compatible", api: "openai-compatible" },
      }
    }

    await sdk.client.config.update({
      config: {
        provider: {
          [providerID]: {
            name: providerID,
            options: { baseURL: result.baseURL },
            models: modelsConfig,
          },
        },
      },
    })

    await sdk.client.auth.set({
      providerID,
      auth: { type: "api", key: result.apiKey },
    })

    await sdk.client.instance.dispose()
    await sync.bootstrap()
    dialog.replace(() => <DialogModel providerID={providerID} />)
  }

  async function editCustomProvider(providerID: string) {
    const providerInfo = sync.data.provider_next.all.find((p) => p.id === providerID)
    if (!providerInfo) return

    const existingBaseURL = typeof providerInfo.options.baseURL === "string" ? providerInfo.options.baseURL : ""
    const existingModels = Object.entries(providerInfo.models).map(([id, m]) => ({
      id,
      name: m.name,
    }))
    const hasKey = sync.data.provider_next.connected.includes(providerID)

    const result = await showProviderConfigMenu(providerID, {
      baseURL: existingBaseURL,
      models: existingModels,
      hasKey,
    })
    if (!result) return
    if (result.models.length === 0) {
      toast.show({ variant: "error", message: "At least one model is required" })
      return
    }
    if (!result.baseURL) {
      toast.show({ variant: "error", message: "Base URL is required" })
      return
    }

    const modelsConfig: Record<string, { name: string; provider: { npm: string; api: string } }> = {}
    for (const m of result.models) {
      modelsConfig[m.id] = {
        name: m.name,
        provider: { npm: "@ai-sdk/openai-compatible", api: "openai-compatible" },
      }
    }

    await sdk.client.config.update({
      config: {
        provider: {
          [providerID]: {
            name: providerID,
            options: { baseURL: result.baseURL },
            models: modelsConfig,
          },
        },
      },
    })

    if (result.apiKey) {
      await sdk.client.auth.set({
        providerID,
        auth: { type: "api", key: result.apiKey },
      })
    }

    await sdk.client.instance.dispose()
    await sync.bootstrap()
    toast.show({ variant: "success", message: `Updated ${providerID}` })
    dialog.clear()
  }

  const options = createMemo(() => {
    return pipe(
      providerOptions(sync.data.provider_next.all),
      map((provider) => {
        if (provider.type === "custom") {
          return {
            title: provider.title,
            value: provider.value,
            description: provider.description,
            category: provider.category,
            async onSelect() {
              const providerID = await promptCustomProviderID()
              if (!providerID) return
              await setupCustomProvider(providerID)
            },
          }
        }

        const providerID = provider.providerID
        const consoleManaged = isConsoleManagedProvider(sync.data.console_state.consoleManagedProviders, providerID)
        const connected = sync.data.provider_next.connected.includes(providerID)
        const providerInfo = sync.data.provider_next.all.find((p) => p.id === providerID)
        const isCustom = providerInfo && (providerInfo.source === "config" || providerInfo.source === "custom")

        return {
          title: provider.title,
          value: provider.value,
          description: provider.description,
          footer: consoleManaged ? sync.data.console_state.activeOrgName : undefined,
          category: provider.category,
          gutter: connected && onboarded() ? () => <text fg={theme.success}>✓</text> : undefined,
          async onSelect() {
            if (consoleManaged) return

            if (isCustom && connected) {
              const action = await new Promise<string | null>((resolve) => {
                dialog.replace(
                  () => (
                    <DialogSelect
                      title={provider.title}
                      options={[
                        { title: "Edit configuration", value: "edit", category: "Action" },
                        { title: "Reconnect", value: "reconnect", category: "Action" },
                      ]}
                      onSelect={(option) => resolve(option.value as string)}
                    />
                  ),
                  () => resolve(null),
                )
              })
              if (action === null) return
              if (action === "edit") {
                await editCustomProvider(providerID)
                return
              }
              if (action === "reconnect") {
                return dialog.replace(() => <ApiMethod providerID={providerID} title="API key" custom />)
              }
              return
            }

            const methods = sync.data.provider_auth[providerID] ?? [
              {
                type: "api",
                label: "API key",
              },
            ]
            let index: number | null = 0
            if (methods.length > 1) {
              index = await new Promise<number | null>((resolve) => {
                dialog.replace(
                  () => (
                    <DialogSelect
                      title="Select auth method"
                      options={methods.map((x, index) => ({
                        title: x.label,
                        value: index,
                      }))}
                      onSelect={(option) => resolve(option.value)}
                    />
                  ),
                  () => resolve(null),
                )
              })
            }
            if (index == null) return
            const method = methods[index]
            if (method.type === "oauth") {
              let inputs: Record<string, string> | undefined
              if (method.prompts?.length) {
                const value = await PromptsMethod({
                  dialog,
                  prompts: method.prompts,
                })
                if (!value) return
                inputs = value
              }

              const result = await sdk.client.provider.oauth.authorize({
                providerID,
                method: index,
                inputs,
              })
              if (result.error) {
                toast.show({
                  variant: "error",
                  message: JSON.stringify(result.error),
                })
                dialog.clear()
                return
              }
              if (result.data?.method === "code") {
                dialog.replace(() => (
                  <CodeMethod providerID={providerID} title={method.label} index={index} authorization={result.data!} />
                ))
              }
              if (result.data?.method === "auto") {
                dialog.replace(() => (
                  <AutoMethod providerID={providerID} title={method.label} index={index} authorization={result.data!} />
                ))
              }
            }
            if (method.type === "api") {
              let metadata: Record<string, string> | undefined
              if (method.prompts?.length) {
                const value = await PromptsMethod({ dialog, prompts: method.prompts })
                if (!value) return
                metadata = value
              }
              return dialog.replace(() => (
                <ApiMethod providerID={providerID} title={method.label} metadata={metadata} />
              ))
            }
          },
        }
      }),
    )
  })
  return options
}

export function DialogProvider() {
  const options = createDialogProviderOptions()
  return <DialogSelect title="Connect a provider" options={options()} />
}

interface AutoMethodProps {
  index: number
  providerID: string
  title: string
  authorization: ProviderAuthAuthorization
}
function AutoMethod(props: AutoMethodProps) {
  const { theme } = useTheme()
  const sdk = useSDK()
  const dialog = useDialog()
  const sync = useSync()
  const toast = useToast()

  useBindings(() => ({
    bindings: [
      {
        key: "c",
        desc: "Copy provider code",
        group: "Dialog",
        cmd: () => {
          const code =
            props.authorization.instructions.match(/[A-Z0-9]{4}-[A-Z0-9]{4,5}/)?.[0] ?? props.authorization.url
          Clipboard.copy(code)
            .then(() => toast.show({ message: "Copied to clipboard", variant: "info" }))
            .catch(toast.error)
        },
      },
    ],
  }))

  onMount(async () => {
    const result = await sdk.client.provider.oauth.callback({
      providerID: props.providerID,
      method: props.index,
    })
    if (result.error) {
      dialog.clear()
      return
    }
    await sdk.client.instance.dispose()
    await sync.bootstrap()
    dialog.replace(() => <DialogModel providerID={props.providerID} />)
  })

  return (
    <box paddingLeft={2} paddingRight={2} gap={1} paddingBottom={1}>
      <box flexDirection="row" justifyContent="space-between">
        <text attributes={TextAttributes.BOLD} fg={theme.text}>
          {props.title}
        </text>
        <text fg={theme.textMuted} onMouseUp={() => dialog.clear()}>
          esc
        </text>
      </box>
      <box gap={1}>
        <Link href={props.authorization.url} fg={theme.primary} />
        <text fg={theme.textMuted}>{props.authorization.instructions}</text>
      </box>
      <text fg={theme.textMuted}>Waiting for authorization...</text>
      <text fg={theme.text}>
        c <span style={{ fg: theme.textMuted }}>copy</span>
      </text>
    </box>
  )
}

interface CodeMethodProps {
  index: number
  title: string
  providerID: string
  authorization: ProviderAuthAuthorization
}
function CodeMethod(props: CodeMethodProps) {
  const { theme } = useTheme()
  const sdk = useSDK()
  const sync = useSync()
  const dialog = useDialog()
  const [error, setError] = createSignal(false)

  return (
    <DialogPrompt
      title={props.title}
      placeholder="Authorization code"
      onConfirm={async (value) => {
        const { error } = await sdk.client.provider.oauth.callback({
          providerID: props.providerID,
          method: props.index,
          code: value,
        })
        if (!error) {
          await sdk.client.instance.dispose()
          await sync.bootstrap()
          dialog.replace(() => <DialogModel providerID={props.providerID} />)
          return
        }
        setError(true)
      }}
      description={() => (
        <box gap={1}>
          <text fg={theme.textMuted}>{props.authorization.instructions}</text>
          <Link href={props.authorization.url} fg={theme.primary} />
          <Show when={error()}>
            <text fg={theme.error}>Invalid code</text>
          </Show>
        </box>
      )}
    />
  )
}

interface ApiMethodProps {
  providerID: string
  title: string
  metadata?: Record<string, string>
  custom?: boolean
}
function ApiMethod(props: ApiMethodProps) {
  const dialog = useDialog()
  const sdk = useSDK()
  const sync = useSync()
  const toast = useToast()
  const { theme } = useTheme()

  return (
    <DialogPrompt
      title={props.title}
      placeholder="API key"
      description={
        {
          opencode: (
            <box gap={1}>
              <text fg={theme.textMuted}>
                OpenCode Zen gives you access to all the best coding models at the cheapest prices with a single API
                key.
              </text>
              <text fg={theme.text}>
                Go to <span style={{ fg: theme.primary }}>https://opencode.ai/zen</span> to get a key
              </text>
            </box>
          ),
          "opencode-go": (
            <box gap={1}>
              <text fg={theme.textMuted}>
                OpenCode Go is a $10 per month subscription that provides reliable access to popular open coding models
                with generous usage limits.
              </text>
              <text fg={theme.text}>
                Go to <span style={{ fg: theme.primary }}>https://opencode.ai/zen</span> and enable OpenCode Go
              </text>
            </box>
          ),
        }[props.providerID] ?? undefined
      }
      onConfirm={async (value) => {
        if (!value) return
        await sdk.client.auth.set({
          providerID: props.providerID,
          auth: {
            type: "api",
            key: value,
            ...(props.metadata ? { metadata: props.metadata } : {}),
          },
        })
        await sdk.client.instance.dispose()
        await sync.bootstrap()
        if (props.custom && !sync.data.provider_next.all.some((provider) => provider.id === props.providerID)) {
          toast.show({
            variant: "info",
            message: `Saved credential for ${props.providerID}. Configure it in opencode.json to use it.`,
          })
          dialog.clear()
          return
        }
        dialog.replace(() => <DialogModel providerID={props.providerID} />)
      }}
    />
  )
}

interface PromptsMethodProps {
  dialog: ReturnType<typeof useDialog>
  prompts: NonNullable<ProviderAuthMethod["prompts"]>[number][]
}
async function PromptsMethod(props: PromptsMethodProps) {
  const inputs: Record<string, string> = {}
  for (const prompt of props.prompts) {
    if (prompt.when) {
      const value = inputs[prompt.when.key]
      if (value === undefined) continue
      const matches = prompt.when.op === "eq" ? value === prompt.when.value : value !== prompt.when.value
      if (!matches) continue
    }

    if (prompt.type === "select") {
      const value = await new Promise<string | null>((resolve) => {
        props.dialog.replace(
          () => (
            <DialogSelect
              title={prompt.message}
              options={prompt.options.map((x) => ({
                title: x.label,
                value: x.value,
                description: x.hint,
              }))}
              onSelect={(option) => resolve(option.value)}
            />
          ),
          () => resolve(null),
        )
      })
      if (value === null) return null
      inputs[prompt.key] = value
      continue
    }

    const value = await new Promise<string | null>((resolve) => {
      props.dialog.replace(
        () => (
          <DialogPrompt title={prompt.message} placeholder={prompt.placeholder} onConfirm={(value) => resolve(value)} />
        ),
        () => resolve(null),
      )
    })
    if (value === null) return null
    inputs[prompt.key] = value
  }
  return inputs
}
