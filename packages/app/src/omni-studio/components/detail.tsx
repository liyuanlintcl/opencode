import { Show } from "solid-js"
import { Button } from "@opencode-ai/ui/button"
import { Tag } from "@opencode-ai/ui/tag"
import { Spinner } from "@opencode-ai/ui/spinner"
import { useLanguage } from "@/context/language"
import { useOmniStudio } from "../context"
import { ProjectToggle } from "./project-toggle"

export function MarketplaceDetail() {
  const language = useLanguage()
  const { state, actions, effectiveEnabled } = useOmniStudio()

  const t = (key: string) => language.t(`omniStudio.${key}`)
  const item = () => state.items.find((i) => i.id === state.selectedItemId)
  const isActionLoading = () => (item() ? state.actionLoading[item()!.id] ?? false : false)

  return (
    <Show
      when={item()}
      fallback={
        <div class="flex flex-col items-center justify-center h-full text-text-weak gap-3">
          <span class="text-32-regular">📦</span>
          <span class="text-14-regular">{t("selectItem")}</span>
        </div>
      }
    >
      {(ext) => (
        <div class="flex flex-col h-full bg-surface-base border-l border-border-subtle">
          <div class="flex-1 overflow-y-auto p-5">
            <div class="flex items-start gap-4 mb-4">
              <div class="w-16 h-16 rounded-xl bg-surface-raised-base flex items-center justify-center shrink-0 text-28-regular">
                {ext().type === "skill" ? "✨" : ext().type === "agent" ? "🤖" : ext().type === "command" ? "⌨️" : ext().type === "tool" ? "🔧" : "🔌"}
              </div>
              <div class="min-w-0">
                <h3 class="text-18-semibold text-text-strong">{ext().name}</h3>
                <div class="flex items-center gap-2 mt-1 flex-wrap">
                  <Tag size="normal" class="capitalize">{ext().type}</Tag>
                  <span class="text-12-regular text-text-weak">v{ext().version}</span>
                  <span class="text-12-regular text-text-weak">by {ext().author}</span>
                  <span class="text-12-regular text-text-weak flex items-center gap-1">
                    <span>★</span>
                    {ext().stars.toLocaleString()}
                  </span>
                </div>
              </div>
            </div>

            <Show when={!isActionLoading()} fallback={<Spinner size="normal" class="my-4" />}>
              <div class="flex items-center gap-2 mb-6">
                {!ext().installed ? (
                  <Button
                    variant="primary"
                    size="normal"
                    onClick={() => void actions.install(ext().id)}
                  >
                    {t("actions.install")}
                  </Button>
                ) : (
                  <>
                    <Button
                      variant={ext().enabled ? "ghost" : "primary"}
                      size="normal"
                      onClick={() => void actions.toggleGlobal(ext().id)}
                    >
                      {ext().enabled ? t("actions.disable") : t("actions.enable")}
                    </Button>
                    <Button
                      variant="ghost"
                      size="normal"
                      icon="trash"
                      onClick={() => void actions.uninstall(ext().id)}
                    >
                      {t("actions.uninstall")}
                    </Button>
                  </>
                )}
              </div>
            </Show>

            <div class="space-y-4">
              <div>
                <h4 class="text-12-medium text-text-weak uppercase tracking-wider mb-2">{t("detail.description")}</h4>
                <p class="text-14-regular text-text-base leading-relaxed">{ext().description}</p>
              </div>

              <Show when={ext().installed}>
                <div class="border-t border-border-subtle pt-4">
                  <h4 class="text-12-medium text-text-weak uppercase tracking-wider mb-3">{t("project.overrideTitle")}</h4>
                  <ProjectToggle itemId={ext().id} />
                </div>
              </Show>
            </div>
          </div>
        </div>
      )}
    </Show>
  )
}
