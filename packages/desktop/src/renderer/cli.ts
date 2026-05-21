import { initI18n, t } from "./i18n"
import { BRAND } from "../shared/brand"

export async function installCli(): Promise<void> {
  await initI18n()

  try {
    const path = await window.api.installCli()
    window.alert(t("desktop.cli.installed.message", { path, command: BRAND }))
  } catch (e) {
    window.alert(t("desktop.cli.failed.message", { error: String(e) }))
  }
}
