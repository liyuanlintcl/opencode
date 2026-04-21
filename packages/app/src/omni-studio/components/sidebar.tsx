import { Button } from "@opencode-ai/ui/button"
import { Icon } from "@opencode-ai/ui/icon"
import { TextField } from "@opencode-ai/ui/text-field"
import { useLanguage } from "@/context/language"
import type { Category } from "../types"
import { useOmniStudio } from "../context"

const CATEGORIES: { key: Category; icon: string }[] = [
  { key: "all", icon: "grid" },
  { key: "skill", icon: "sparkles" },
  { key: "agent", icon: "bot" },
  { key: "command", icon: "terminal" },
  { key: "tool", icon: "wrench" },
  { key: "plugin", icon: "plug" },
]

export function MarketplaceSidebar() {
  const language = useLanguage()
  const { state, actions } = useOmniStudio()

  const t = (key: string) => language.t(`omniStudio.${key}`)

  return (
    <div class="flex flex-col h-full w-full bg-surface-base border-r border-border-subtle">
      <div class="px-4 pt-4 pb-2">
        <h2 class="text-16-semibold text-text-strong mb-3">{t("title")}</h2>
        <TextField
          placeholder={t("searchPlaceholder")}
          value={state.searchQuery}
          onChange={(v) => actions.setSearchQuery(v)}
          variant="ghost"
          class="w-full"
        />
      </div>

      <div class="flex-1 overflow-y-auto px-2 py-2">
        <div class="flex flex-col gap-0.5">
          {CATEGORIES.map((cat) => (
            <Button
              variant={state.activeCategory === cat.key ? "primary" : "ghost"}
              size="small"
              icon={cat.icon}
              class="justify-start w-full"
              onClick={() => actions.setActiveCategory(cat.key)}
            >
              <span class="capitalize">{t(`categories.${cat.key}`)}</span>
            </Button>
          ))}
        </div>

        <div class="mt-4 mb-2 px-2">
          <span class="text-11-medium text-text-weak uppercase tracking-wider">{t("filters.title")}</span>
        </div>
        <div class="flex flex-col gap-0.5">
          <Button
            variant={state.activeCategory === "installed" ? "primary" : "ghost"}
            size="small"
            icon="download"
            class="justify-start w-full"
            onClick={() => actions.setActiveCategory("installed")}
          >
            {t("installed")}
          </Button>
          <Button
            variant={state.activeCategory === "enabled" ? "primary" : "ghost"}
            size="small"
            icon="check-circle"
            class="justify-start w-full"
            onClick={() => actions.setActiveCategory("enabled")}
          >
            {t("enabled")}
          </Button>
        </div>
      </div>
    </div>
  )
}
