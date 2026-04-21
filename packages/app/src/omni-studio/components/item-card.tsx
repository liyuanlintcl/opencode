import { Show } from "solid-js"
import { Button } from "@opencode-ai/ui/button"
import { Tag } from "@opencode-ai/ui/tag"
import { Spinner } from "@opencode-ai/ui/spinner"
import { useLanguage } from "@/context/language"
import type { ExtensionItem } from "../types"
import { useOmniStudio } from "../context"

export function ItemCard(props: { item: ExtensionItem }) {
  const language = useLanguage()
  const { state, actions, effectiveEnabled } = useOmniStudio()

  const t = (key: string) => language.t(`omniStudio.${key}`)
  const item = () => props.item
  const isSelected = () => state.selectedItemId === item().id
  const isActionLoading = () => state.actionLoading[item().id] ?? false
  const isProjectEnabled = () => state.projectConfig.enabled.includes(item().id)

  return (
    <button
      type="button"
      class="flex flex-col gap-2 p-3 rounded-lg text-left transition-colors w-full border border-transparent hover:bg-surface-raised-base-hover"
      classList={{
        "bg-surface-raised-base border-border-subtle": isSelected(),
      }}
      onClick={() => actions.setSelectedItemId(item().id)}
    >
      <div class="flex items-start justify-between gap-3">
        <div class="flex items-center gap-3 min-w-0">
          <div class="w-10 h-10 rounded-lg bg-surface-raised-base flex items-center justify-center shrink-0">
            <span class="text-20-regular">{item().type === "skill" ? "✨" : item().type === "agent" ? "🤖" : item().type === "command" ? "⌨️" : item().type === "tool" ? "🔧" : "🔌"}</span>
          </div>
          <div class="min-w-0">
            <div class="flex items-center gap-2">
              <span class="text-14-semibold text-text-strong truncate">{item().name}</span>
              {item().installed && (
                <Tag size="normal" class="shrink-0">{t("installed")}</Tag>
              )}
              {effectiveEnabled().has(item().id) && (
                <Tag size="normal" class="shrink-0">{t("enabled")}</Tag>
              )}
            </div>
            <p class="text-12-regular text-text-weak truncate">{item().description}</p>
          </div>
        </div>
      </div>

      <div class="flex items-center justify-between pl-[52px]">
        <div class="flex items-center gap-3 text-11-regular text-text-weak">
          <span class="capitalize">{item().type}</span>
          <span>v{item().version}</span>
          <span class="flex items-center gap-1">
            <span>★</span>
            {item().stars.toLocaleString()}
          </span>
        </div>

        <Show when={!isActionLoading()} fallback={<Spinner size="small" />}>
          <div class="flex items-center gap-1">
            {!item().installed ? (
              <Button
                size="small"
                variant="primary"
                onClick={(e) => {
                  e.stopPropagation()
                  void actions.install(item().id)
                }}
              >
                {t("actions.install")}
              </Button>
            ) : (
              <>
                <Button
                  size="small"
                  variant={item().enabled ? "ghost" : "primary"}
                  onClick={(e) => {
                    e.stopPropagation()
                    void actions.toggleGlobal(item().id)
                  }}
                >
                  {item().enabled ? t("actions.disable") : t("actions.enable")}
                </Button>
                <Button
                  size="small"
                  variant="ghost"
                  icon="trash"
                  onClick={(e) => {
                    e.stopPropagation()
                    void actions.uninstall(item().id)
                  }}
                />
              </>
            )}
          </div>
        </Show>
      </div>
    </button>
  )
}
