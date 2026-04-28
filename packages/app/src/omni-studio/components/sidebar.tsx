import { Button } from "@opencode-ai/ui/button"
import { Icon, type IconProps } from "@opencode-ai/ui/icon"
import { TextField } from "@opencode-ai/ui/text-field"
import { useLanguage } from "@/context/language"
import type { Category } from "../types"
import { useOmniStudio } from "../context"
import { SettingsPanel } from "./settings-panel"

const CATEGORIES: { key: Category; icon: IconProps["name"] }[] = [
  { key: "all", icon: "grid" as IconProps["name"] },
  { key: "skill", icon: "sparkles" as IconProps["name"] },
  { key: "agent", icon: "bot" as IconProps["name"] },
  { key: "tool", icon: "wrench" as IconProps["name"] },
  { key: "plugin", icon: "plug" as IconProps["name"] },
]

export function MarketplaceSidebar() {
  const language = useLanguage()
  const { state, actions } = useOmniStudio()

  const t = (key: string) => language.t(`omniStudio.${key}`)

  return (
    <div class="flex flex-col h-full w-full bg-surface-base border-r border-border-subtle">
      <div class="px-4 pt-4 pb-2 flex items-center justify-between gap-2">
        <h2 class="text-16-semibold text-text-strong">{t("title")}</h2>
        <Button
          variant={state.showSettings ? "primary" : "ghost"}
          size="small"
          icon={"settings-gear" as IconProps["name"]}
          onClick={() => actions.toggleSettings()}
        />
      </div>

      <div class="px-4 pb-2">
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
            icon={"download" as IconProps["name"]}
            class="justify-start w-full"
            onClick={() => actions.setActiveCategory("installed")}
          >
            {t("installed")}
          </Button>
          <Button
            variant={state.activeCategory === "enabled" ? "primary" : "ghost"}
            size="small"
            icon={"circle-check" as IconProps["name"]}
            class="justify-start w-full"
            onClick={() => actions.setActiveCategory("enabled")}
          >
            {t("enabled")}
          </Button>
        </div>
      </div>

      {state.showSettings && <SettingsPanel />}
    </div>
  )
}
