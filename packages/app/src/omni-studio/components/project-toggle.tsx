import { Show } from "solid-js"
import { Switch } from "@opencode-ai/ui/switch"
import { useLanguage } from "@/context/language"
import { useOmniStudio } from "../context"

export function ProjectToggle(props: { itemId: string }) {
  const language = useLanguage()
  const { state, actions, effectiveEnabled } = useOmniStudio()

  const t = (key: string) => language.t(`omniStudio.${key}`)

  const isEnabledInProject = () => state.projectConfig.enabled.includes(props.itemId)
  const isEffectivelyEnabled = () => effectiveEnabled().has(props.itemId)

  return (
    <div class="flex flex-col gap-3">
      <Switch
        checked={state.projectConfig.inherit_global}
        onChange={(v) => void actions.setInheritGlobal(v)}
      >
        {t("project.inheritGlobal")}
      </Switch>

      <Show when={!state.projectConfig.inherit_global}>
        <div class="flex items-center gap-3 pl-2">
          <Switch
            checked={isEnabledInProject()}
            onChange={(v) => void actions.toggleProject(props.itemId)}
          >
            <span class="text-14-regular text-text-base">
              {isEffectivelyEnabled() ? t("project.enabled") : t("project.disabled")}
            </span>
          </Switch>
        </div>
      </Show>
    </div>
  )
}
