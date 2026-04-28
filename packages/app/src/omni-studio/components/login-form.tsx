import { createSignal } from "solid-js"
import { Button } from "@opencode-ai/ui/button"
import { TextField } from "@opencode-ai/ui/text-field"
import { useLanguage } from "@/context/language"
import { useOmniStudio } from "../context"

export function LoginForm() {
  const language = useLanguage()
  const { actions } = useOmniStudio()
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
      setUsername("")
      setPassword("")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div class="flex flex-col gap-3 p-4 bg-surface-raised-base rounded-lg border border-border-subtle">
      <h3 class="text-14-semibold text-text-strong">{t("login.title")}</h3>
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
        <span class="text-12-regular text-text-error">{error()}</span>
      )}
      <div class="flex items-center gap-2">
        <Button
          variant="primary"
          size="small"
          class="flex-1"
          onClick={() => void handleSubmit()}
          disabled={loading()}
        >
          {loading() ? t("login.loading") : t("login.submit")}
        </Button>
        <Button
          variant="ghost"
          size="small"
          onClick={() => actions.setShowLoginForm(false)}
        >
          {t("login.cancel")}
        </Button>
      </div>
    </div>
  )
}
