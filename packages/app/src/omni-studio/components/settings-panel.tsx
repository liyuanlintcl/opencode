import { Button } from "@opencode-ai/ui/button"
import { TextField } from "@opencode-ai/ui/text-field"
import { useLanguage } from "@/context/language"
import { useOmniStudio } from "../context"
import { getApiBase, getAuthBase, setApiBase, setAuthBase } from "../api"

export function SettingsPanel() {
  const language = useLanguage()
  const { state, actions } = useOmniStudio()

  const t = (key: string) => language.t(`omniStudio.${key}`)

  return (
    <div class="flex flex-col gap-3 p-4 bg-surface-raised-base rounded-xl border border-border-subtle m-2">
      <div class="flex items-center justify-between">
        <span class="text-12-medium text-text-weak uppercase tracking-wider">Backend</span>
        <Button
          variant="ghost"
          size="small"
          icon="close-small"
          onClick={() => actions.toggleSettings()}
        />
      </div>

      <div class="flex flex-col gap-2">
        <label class="text-11-regular text-text-weak">API URL</label>
        <TextField
          placeholder="http://127.0.0.1:18000/api/v1"
          value={getApiBase()}
          onChange={(v) => {
            setApiBase(v)
            void actions.refresh()
          }}
          variant="ghost"
          class="w-full"
        />
      </div>

      <div class="flex flex-col gap-2">
        <label class="text-11-regular text-text-weak">Auth URL</label>
        <TextField
          placeholder="http://127.0.0.1:18000/api/v1"
          value={getAuthBase()}
          onChange={(v) => {
            setAuthBase(v)
          }}
          variant="ghost"
          class="w-full"
        />
      </div>

      {state.userToken && (
        <div class="border-t border-border-subtle pt-3 flex flex-col gap-2">
          <span class="text-12-medium text-text-weak uppercase tracking-wider">Account</span>
          {state.userInfo && (
            <div class="flex items-center justify-between px-1">
              <span class="text-14-regular text-text-base">{state.userInfo.fullName || state.userInfo.username}</span>
            </div>
          )}
          <Button
            variant="ghost"
            size="small"
            class="justify-start w-full"
            onClick={() => void actions.logout()}
          >
            {t("actions.logout")}
          </Button>
        </div>
      )}
    </div>
  )
}
