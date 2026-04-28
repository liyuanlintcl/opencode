import { For, Show } from "solid-js"
import { Spinner } from "@opencode-ai/ui/spinner"
import { useLanguage } from "@/context/language"
import { useOmniStudio } from "../context"
import { ItemCard } from "./item-card"

export function MarketplaceList() {
  const language = useLanguage()
  const { state, actions } = useOmniStudio()

  const t = (key: string) => language.t(`omniStudio.${key}`)

  const filteredItems = () => {
    let items = state.items
    if (state.activeCategory === "installed") {
      items = items.filter((i) => i.installed)
    }
    if (state.activeCategory === "enabled") {
      const enabled = new Set(state.items.filter((i) => i.enabled).map((i) => i.id))
      items = items.filter((i) => enabled.has(i.id))
    }
    return items
  }

  return (
    <div class="flex flex-col h-full bg-background-base">
      <div class="px-4 py-3 border-b border-border-subtle">
        <div class="flex items-center justify-between">
          <span class="text-14-medium text-text-base">
            {filteredItems().length} {t("results")}
          </span>
          <Show when={state.loading}>
            <Spinner class="w-4 h-4" />
          </Show>
        </div>
      </div>

      <div class="flex-1 overflow-y-auto px-2 py-2">
        <Show
          when={!state.loading || filteredItems().length > 0}
          fallback={
            <div class="flex items-center justify-center h-full">
              <Spinner class="w-6 h-6" />
            </div>
          }
        >
          <Show
            when={filteredItems().length > 0}
            fallback={
              <div class="flex flex-col items-center justify-center h-full gap-3 text-text-weak">
                <span class="text-24-regular">📦</span>
                <span class="text-14-regular">{t("emptyState")}</span>
              </div>
            }
          >
            <div class="flex flex-col gap-1">
              <For each={filteredItems()}>
                {(item) => <ItemCard item={item} />}
              </For>
            </div>
          </Show>
        </Show>
      </div>
    </div>
  )
}
