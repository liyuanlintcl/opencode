import { TextAttributes } from "@opentui/core"
import { useTheme } from "../context/theme"
import { useDialog, type DialogContext } from "@tui/ui/dialog"
import { DialogSelect } from "@tui/ui/dialog-select"
import { DialogAlert } from "../ui/dialog-alert"
import { DialogConfirm } from "../ui/dialog-confirm"
import { DialogPrompt } from "../ui/dialog-prompt"
import { Show, createSignal, createEffect } from "solid-js"
import { Effect } from "effect"
import { OmniStudioAuth } from "@/omni-studio/auth"
import { OmniStudioConfig } from "@/omni-studio/config"
import { OmniStudioStore } from "@/omni-studio/store"
import { OmniStudioMarket } from "@/omni-studio/market"

import type { ExtensionType, Extension } from "@/omni-studio/types"

/**
 * 通用选择对话框辅助函数。
 * 使用 DialogSelect 展示选项，返回用户选中的值或 null（取消）。
 */
function showSelect<T>(
  dialog: DialogContext,
  title: string,
  options: Array<{ title: string; value: T; description?: string }>,
): Promise<T | null> {
  return new Promise((resolve) => {
    dialog.replace(
      () => (
        <DialogSelect
          title={title}
          options={options.map((opt) => ({
            title: opt.title,
            value: opt.value,
            description: opt.description,
            onSelect: () => {
              dialog.clear()
              resolve(opt.value)
            },
          }))}
        />
      ),
      () => resolve(null),
    )
  })
}

/**
 * 本地扩展状态查询结果。
 */
type StatusResult =
  | { kind: "loading" }
  | { kind: "ok"; config: { api_base: string; user: { username: string } } | null; extensions: Array<{ type: ExtensionType; slug: string; version: string; enabled: boolean }> }
  | { kind: "error"; message: string }

/**
 * 远程市场列表查询结果。
 */
type ListResult =
  | { kind: "loading" }
  | { kind: "ok"; data: Extension[] }
  | { kind: "error"; message: string }

/**
 * Omni Studio TUI 对话框。
 * 在终端界面中提供扩展市场管理功能，
 * 支持查看状态、列出扩展、安装、卸载、启用、禁用、登录和登出。
 */
export function DialogOmniStudio() {
  const dialog = useDialog()
  const { theme } = useTheme()
  const [view, setView] = createSignal<"menu" | "status" | "list">("menu")
  createEffect(() => console.log("[OmniStudio] view changed:", view()))

  const [status, setStatus] = createSignal<StatusResult>({ kind: "loading" })
  const [marketList, setMarketList] = createSignal<ListResult>({ kind: "loading" })

  createEffect(() => console.log("[OmniStudio] marketList changed:", marketList()))
  createEffect(() => console.log("[OmniStudio] status changed:", status()))

  /**
   * 重新获取本地状态（登录信息 + 已安装扩展）。
   */
  const refreshStatus = async () => {
    console.log("[OmniStudio] refreshStatus start")
    setStatus({ kind: "loading" })
    try {
      const result = await Effect.runPromise(
        OmniStudioStore.Service.use((svc) => svc.getStatus()).pipe(
          Effect.provide(OmniStudioStore.defaultLayer),
        ),
      )
      console.log("[OmniStudio] refreshStatus success:", result)
      setStatus({ kind: "ok", config: result.config, extensions: result.extensions })
    } catch (e) {
      console.log("[OmniStudio] refreshStatus error:", e)
      setStatus({ kind: "error", message: String(e) })
    }
  }

  /**
   * 重新获取远程市场扩展列表。
   */
  const refreshMarketList = async () => {
    console.log("[OmniStudio] refreshMarketList start")
    setMarketList({ kind: "loading" })
    try {
      const result = await Effect.runPromise(
        OmniStudioMarket.Service.use((svc) => svc.list()).pipe(
          Effect.provide(OmniStudioMarket.defaultLayer),
        ),
      )
      console.log("[OmniStudio] refreshMarketList success, count:", result.length)
      setMarketList({ kind: "ok", data: result })
    } catch (e) {
      console.log("[OmniStudio] refreshMarketList error:", e)
      setMarketList({ kind: "error", message: String(e) })
    }
  }

  /**
   * 显示操作结果提示，确认后返回 Omni Studio 菜单。
   * 不修改通用 DialogAlert 组件，利用 await 后 dialog 已被 clear 的特性重新打开菜单。
   */
  const showResult = async (title: string, message: string) => {
    console.log("[OmniStudio] showResult:", title, message)
    await DialogAlert.show(dialog, title, message)
    console.log("[OmniStudio] dialog.replace after alert")
    dialog.replace(() => <DialogOmniStudio />)
  }

  /**
   * 处理登录操作。
   * 仅输入 username / password，api_base 从配置读取。
   */
  const handleLogin = async () => {
    const username = await DialogPrompt.show(dialog, "用户名", {
      placeholder: "admin",
    })
    if (!username) return

    const password = await DialogPrompt.show(dialog, "密码（输入内容可见）", {
      placeholder: "输入密码",
    })
    if (!password) return

    try {
      const config = await Effect.runPromise(
        OmniStudioAuth.Service.use((svc) =>
          svc.login({ username, password }),
        ).pipe(Effect.provide(OmniStudioAuth.defaultLayer)),
      )
      await showResult("登录成功", `已以 ${config.user.username} 身份登录`)
    } catch (e) {
      await showResult("登录失败", String(e))
    }
  }

  /**
   * 处理地址配置操作。
   * 设置 api_base，认证和 API 调用使用同一地址。
   */
  const handleSetup = async () => {
    const apiBase = await DialogPrompt.show(dialog, "Omni Studio API 地址", {
      placeholder: "http://192.88.1.63:3008",
      value: "http://192.88.1.63:3008",
    })
    if (!apiBase) return

    try {
      await Effect.runPromise(
        OmniStudioConfig.Service.use((svc) =>
          svc.setEndpoints(apiBase),
        ).pipe(Effect.provide(OmniStudioConfig.defaultLayer)),
      )
      await showResult("配置成功", `API 地址: ${apiBase}`)
    } catch (e) {
      await showResult("配置失败", String(e))
    }
  }

  /**
   * 处理登出操作。
   */
  const handleLogout = async () => {
    try {
      await Effect.runPromise(
        OmniStudioAuth.Service.use((svc) => svc.logout()).pipe(
          Effect.provide(OmniStudioAuth.defaultLayer),
        ),
      )
      await showResult("Omni Studio", "已登出")
    } catch (e) {
      await showResult("Omni Studio", `登出失败: ${e}`)
    }
  }

  /**
   * 处理安装操作。
   * 流程：选择类型 → 输入 slug → 获取元数据 → 确认 → 安装。
   */
  const handleInstall = async () => {
    const type = await showSelect<ExtensionType>(dialog, "选择扩展类型", [
      { title: "Skill", value: "skill" },
      { title: "Tool", value: "tool" },
      { title: "Plugin", value: "plugin" },
      { title: "Agent", value: "agent" },
    ])
    if (!type) return

    const slug = await DialogPrompt.show(dialog, "输入扩展标识符", {
      placeholder: "例如: my-extension",
    })
    if (!slug) return

    try {
      const ext = await Effect.runPromise(
        OmniStudioMarket.Service.use((svc) => svc.getMeta(type, slug)).pipe(
          Effect.provide(OmniStudioMarket.defaultLayer),
        ),
      )
      const confirmed = await DialogConfirm.show(
        dialog,
        "确认安装",
        `安装 ${ext.name} (${ext.type}) v${ext.version}?`,
      )
      if (!confirmed) return

      await Effect.runPromise(
        OmniStudioStore.Service.use((svc) => svc.install(ext)).pipe(
          Effect.provide(OmniStudioStore.defaultLayer),
        ),
      )
      await showResult("安装成功", `${ext.name} 已安装并启用`)
    } catch (e) {
      await showResult("安装失败", String(e))
    }
  }

  /**
   * 获取本地扩展列表并让用户选择。
   * @param filterFn 过滤函数，用于 enable/disable 时筛选特定状态的扩展
   */
  const selectLocalExtension = async (
    filterFn?: (ext: { type: ExtensionType; slug: string; version: string; enabled: boolean }) => boolean,
  ): Promise<{ type: ExtensionType; slug: string } | null> => {
    try {
      const result = await Effect.runPromise(
        OmniStudioStore.Service.use((svc) => svc.getStatus()).pipe(
          Effect.provide(OmniStudioStore.defaultLayer),
        ),
      )
      const extensions = filterFn ? result.extensions.filter(filterFn) : result.extensions
      if (extensions.length === 0) {
        await showResult("Omni Studio", "没有符合条件的扩展")
        return null
      }
      return await showSelect(dialog, "选择扩展",
        extensions.map((ext) => ({
          title: `${ext.slug} (${ext.type}) v${ext.version}`,
          value: { type: ext.type, slug: ext.slug },
          description: ext.enabled ? "已启用" : "已禁用",
        })),
      )
    } catch (e) {
      await showResult("错误", String(e))
      return null
    }
  }

  /**
   * 处理卸载操作。
   */
  const handleUninstall = async () => {
    const selected = await selectLocalExtension()
    if (!selected) return

    const confirmed = await DialogConfirm.show(
      dialog,
      "确认卸载",
      `卸载 ${selected.slug} (${selected.type})? 此操作不可恢复。`,
      "卸载",
    )
    if (!confirmed) return

    try {
      await Effect.runPromise(
        OmniStudioStore.Service.use((svc) => svc.uninstall(selected.type, selected.slug)).pipe(
          Effect.provide(OmniStudioStore.defaultLayer),
        ),
      )
      await showResult("卸载成功", `${selected.slug} 已卸载`)
    } catch (e) {
      await showResult("卸载失败", String(e))
    }
  }

  /**
   * 处理启用操作。
   */
  const handleEnable = async () => {
    const selected = await selectLocalExtension((ext) => !ext.enabled)
    if (!selected) return

    const confirmed = await DialogConfirm.show(dialog, "确认启用", `启用 ${selected.slug} (${selected.type})?`)
    if (!confirmed) return

    try {
      await Effect.runPromise(
        OmniStudioStore.Service.use((svc) => svc.setEnabled(selected.type, selected.slug, true)).pipe(
          Effect.provide(OmniStudioStore.defaultLayer),
        ),
      )
      await showResult("启用成功", `${selected.slug} 已启用`)
    } catch (e) {
      await showResult("启用失败", String(e))
    }
  }

  /**
   * 处理禁用操作。
   */
  const handleDisable = async () => {
    const selected = await selectLocalExtension((ext) => ext.enabled)
    if (!selected) return

    const confirmed = await DialogConfirm.show(dialog, "确认禁用", `禁用 ${selected.slug} (${selected.type})?`)
    if (!confirmed) return

    try {
      await Effect.runPromise(
        OmniStudioStore.Service.use((svc) => svc.setEnabled(selected.type, selected.slug, false)).pipe(
          Effect.provide(OmniStudioStore.defaultLayer),
        ),
      )
      await showResult("禁用成功", `${selected.slug} 已禁用`)
    } catch (e) {
      await showResult("禁用失败", String(e))
    }
  }

  /**
   * 根据状态数据生成展示文本。
   */
  const statusMessage = () => {
    const s = status()
    console.log("[OmniStudio] statusMessage called, status:", s)
    if (s.kind === "loading") return "加载中..."
    if (s.kind === "error") return `错误: ${s.message}`
    const lines = [
      `登录状态: ${s.config ? "已登录" : "未登录"}`,
      s.config ? `API 地址: ${s.config.api_base}` : "",
      s.config ? `用户名: ${s.config.user.username}` : "",
      `扩展数量: ${s.extensions.length}`,
      ...s.extensions.map(
        (ext) =>
          `  ${ext.slug} (${ext.type}) v${ext.version} [${ext.enabled ? "已启用" : "已禁用"}]`,
      ),
    ]
    const msg = lines.filter(Boolean).join("\n")
    console.log("[OmniStudio] statusMessage result:", msg)
    return msg
  }

  /**
   * 根据市场数据生成展示文本。
   */
  const listMessage = () => {
    const l = marketList()
    console.log("[OmniStudio] listMessage called, marketList:", l)
    if (l.kind === "loading") return "加载中..."
    if (l.kind === "error") return `错误: ${l.message}`
    if (!Array.isArray(l.data) || l.data.length === 0) return "未找到扩展"
    const msg = l.data
      .map((ext) => `${ext.name} (${ext.type}) v${ext.version} - ${ext.author}`)
      .join("\n")
    console.log("[OmniStudio] listMessage result:", msg)
    return msg
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
            onSelect: () => {
              setView("status")
              void refreshStatus()
            },
          },
          {
            title: "列表",
            value: "list",
            description: "列出市场中的扩展",
            onSelect: () => {
              setView("list")
              void refreshMarketList()
            },
          },
          {
            title: "安装",
            value: "install",
            description: "从市场安装扩展",
            onSelect: handleInstall,
          },
          {
            title: "卸载",
            value: "uninstall",
            description: "卸载本地扩展",
            onSelect: handleUninstall,
          },
          {
            title: "启用",
            value: "enable",
            description: "启用已禁用的扩展",
            onSelect: handleEnable,
          },
          {
            title: "禁用",
            value: "disable",
            description: "禁用已启用的扩展",
            onSelect: handleDisable,
          },
          {
            title: "配置",
            value: "setup",
            description: "设置 API 地址",
            onSelect: handleSetup,
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
