import { createSignal } from "solid-js"
import { Button } from "@opencode-ai/ui/button"
import { type IconProps } from "@opencode-ai/ui/icon"
import { TextField } from "@opencode-ai/ui/text-field"
import { useLanguage } from "@/context/language"
import { useOmniStudio } from "../context"
import { SettingsPanel } from "./settings-panel"

export function LoginPage() {
  const language = useLanguage()
  const { state, actions } = useOmniStudio()
  const [username, setUsername] = createSignal("")
  const [password, setPassword] = createSignal("")
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)

  const t = (key: string) => language.t(`omniStudio.${key}`)

  const handleSubmit = async () => {
    if (!username().trim() || !password().trim()) return
    setLoading(true)
    setError(null)
    try {
      await actions.login(username().trim(), password().trim())
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div class="h-full w-full flex items-center justify-center bg-background-base">
      <div class="flex flex-col gap-4">
        <div class="w-[360px] flex flex-col gap-5 p-6 bg-surface-base rounded-2xl border border-border-subtle shadow-sm">
          <div class="flex flex-col items-center gap-2">
            <div class="w-12 h-12 rounded-xl bg-surface-raised-base flex items-center justify-center text-24-regular">
              🛒
            </div>
            <h2 class="text-18-semibold text-text-strong">{t("title")}</h2>
            <p class="text-12-regular text-text-weak text-center">{t("login.subtitle")}</p>
          </div>

          <div class="flex flex-col gap-3">
            <TextField
              placeholder={t("login.username")}
              value={username()}
              onChange={(v) => {
                setUsername(v)
                setError(null)
              }}
              variant="ghost"
              class="w-full"
            />
            <TextField
              placeholder={t("login.password")}
              type="password"
              value={password()}
              onChange={(v) => {
                setPassword(v)
                setError(null)
              }}
              variant="ghost"
              class="w-full"
            />
            {error() && (
              <span class="text-12-regular text-text-error px-1">{error()}</span>
            )}
          </div>

          <Button
            variant="primary"
            size="normal"
            class="w-full"
            onClick={() => void handleSubmit()}
            disabled={loading()}
          >
            {loading() ? t("login.loading") : t("login.submit")}
          </Button>

          <Button
            variant="ghost"
            size="small"
            icon={(state.showSettings ? "close-small" : "settings-gear") as IconProps["name"]}
            class="w-full justify-center"
            onClick={() => actions.toggleSettings()}
          >
            {state.showSettings ? t("settings.hide") : t("settings.show")}
          </Button>
        </div>

        {state.showSettings && <SettingsPanel />}
      </div>
    </div>
  )
}
