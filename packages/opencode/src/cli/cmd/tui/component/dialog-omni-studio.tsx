import { TextAttributes } from "@opentui/core"
import { useTheme } from "../context/theme"
import { useDialog } from "@tui/ui/dialog"
import { DialogSelect } from "@tui/ui/dialog-select"
import { DialogAlert } from "../ui/dialog-alert"
import { createResource, Show, createSignal } from "solid-js"
import { Effect } from "effect"
import { OmniStudioAuth } from "@/omni-studio/auth"
import { OmniStudioStore } from "@/omni-studio/store"
import { OmniStudioMarket } from "@/omni-studio/market"
import { interactiveLogin } from "@/omni-studio/interactive"

/**
 * Omni Studio TUI 对话框。
 * 在终端界面中提供扩展市场管理功能，
 * 支持查看状态、列出扩展、登录和登出。
 */
export function DialogOmniStudio() {
  const dialog = useDialog()
  const { theme } = useTheme()
  const [view, setView] = createSignal<"menu" | "status" | "list">("menu")

  /**
   * 异步获取本地状态：登录信息和已安装扩展列表。
   * 使用 createResource 在 SolidJS 中管理异步数据。
   */
  const [status] = createResource(async () => {
    try {
      const result = await Effect.runPromise(
        OmniStudioStore.Service.use((svc) => svc.getStatus()).pipe(
          Effect.provide(OmniStudioStore.defaultLayer),
        ),
      )
      return { success: true as const, data: result }
    } catch (e) {
      return { success: false as const, error: String(e) }
    }
  })

  /**
   * 异步获取远程市场扩展列表。
   * 若未登录或网络失败，返回错误信息。
   */
  const [marketList] = createResource(async () => {
    try {
      const result = await Effect.runPromise(
        OmniStudioMarket.Service.use((svc) => svc.list()).pipe(
          Effect.provide(OmniStudioMarket.defaultLayer),
        ),
      )
      return { success: true as const, data: result }
    } catch (e) {
      return { success: false as const, error: String(e) }
    }
  })

  /**
   * 处理登录操作。
   * 先关闭当前对话框释放终端控制权，
   * 再调用交互式登录流程（内部使用 @clack/prompts）。
   */
  const handleLogin = async () => {
    dialog.clear()
    try {
      await interactiveLogin()
      DialogAlert.show(dialog, "Omni Studio", "登录成功")
    } catch (e) {
      DialogAlert.show(dialog, "Omni Studio 登录", `登录失败: ${e}`)
    }
  }

  /**
   * 处理登出操作。
   * 调用 Auth 服务清除本地 token。
   */
  const handleLogout = async () => {
    try {
      await Effect.runPromise(
        OmniStudioAuth.Service.use((svc) => svc.logout()).pipe(
          Effect.provide(OmniStudioAuth.defaultLayer),
        ),
      )
      DialogAlert.show(dialog, "Omni Studio", "已登出")
    } catch (e) {
      DialogAlert.show(dialog, "Omni Studio", `登出失败: ${e}`)
    }
  }

  /**
   * 根据状态数据生成展示文本。
   * 包含登录状态、API 地址、用户名和扩展列表。
   */
  const statusMessage = () => {
    const s = status()
    if (!s) return "加载中..."
    if (!s.success) return `错误: ${s.error}`
    const lines = [
      `登录状态: ${s.data.config ? "已登录" : "未登录"}`,
      s.data.config ? `API 地址: ${s.data.config.api_base}` : "",
      s.data.config ? `用户名: ${s.data.config.user.username}` : "",
      `扩展数量: ${s.data.extensions.length}`,
      ...s.data.extensions.map(
        (ext) =>
          `  ${ext.slug} (${ext.type}) v${ext.version} [${ext.enabled ? "已启用" : "已禁用"}]`,
      ),
    ]
    return lines.filter(Boolean).join("\n")
  }

  /**
   * 根据市场数据生成展示文本。
   * 列出远程扩展的名称、类型、版本和作者。
   */
  const listMessage = () => {
    const l = marketList()
    if (!l) return "加载中..."
    if (!l.success) return `错误: ${l.error}`
    if (l.data.length === 0) return "未找到扩展"
    return l.data
      .map((ext) => `${ext.name} (${ext.type}) v${ext.version} - ${ext.author}`)
      .join("\n")
  }

  return (
    <Show
      when={view() === "menu"}
      fallback={
        <box paddingLeft={2} paddingRight={2} gap={1} paddingBottom={1}>
          <box flexDirection="row" justifyContent="space-between">
            <text fg={theme.text} attributes={TextAttributes.BOLD}>
              {view() === "status" ? "Omni Studio 状态" : "Omni Studio 扩展列表"}
            </text>
            <text
              fg={theme.textMuted}
              onMouseUp={() => {
                setView("menu")
              }}
            >
              esc
            </text>
          </box>
          <box paddingBottom={1}>
            <text fg={theme.textMuted} wrapMode="word">
              {view() === "status" ? statusMessage() : listMessage()}
            </text>
          </box>
        </box>
      }
    >
      <DialogSelect
        title="Omni Studio"
        options={[
          {
            title: "状态",
            value: "status",
            description: "查看登录状态和已安装的扩展",
            onSelect: () => setView("status"),
          },
          {
            title: "列表",
            value: "list",
            description: "列出市场中的扩展",
            onSelect: () => setView("list"),
          },
          {
            title: "登录",
            value: "login",
            description: "登录到 Omni Studio 扩展市场",
            onSelect: handleLogin,
          },
          {
            title: "登出",
            value: "logout",
            description: "登出 Omni Studio 扩展市场",
            onSelect: handleLogout,
          },
        ]}
      />
    </Show>
  )
}
