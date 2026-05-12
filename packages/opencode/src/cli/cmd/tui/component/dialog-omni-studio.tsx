import path from "path"
import fs from "fs/promises"
import { TextAttributes, type ScrollBoxRenderable } from "@opentui/core"
import { useTheme } from "../context/theme"
import { useDialog, type DialogContext } from "@tui/ui/dialog"
import { useTerminalDimensions } from "@opentui/solid"
import { DialogSelect } from "@tui/ui/dialog-select"
import { DialogAlert } from "../ui/dialog-alert"
import { DialogConfirm } from "../ui/dialog-confirm"
import { DialogPrompt } from "../ui/dialog-prompt"
import { Show, createSignal, createEffect, For, createMemo } from "solid-js"
import { useKeyboard } from "@opentui/solid"
import { Effect } from "effect"
import { Global } from "@opencode-ai/core/global"
import { OmniStudioAuth } from "@/omni-studio/auth"
import { OmniStudioConfig } from "@/omni-studio/config"
import { OmniStudioStore } from "@/omni-studio/store"
import { OmniStudioMarket } from "@/omni-studio/market"

import type { ExtensionType, Extension, PagedResult } from "@/omni-studio/types"

/** 调试日志文件路径 */
const debugLogFile = path.join(Global.Path.home, ".omni_studio", "tui-debug.log")

/**
 * 写入调试日志到文件。
 * 异步执行，失败时静默忽略。
 */
function debugLog(...args: unknown[]) {
  const line =
    `[${new Date().toISOString()}] ` +
    args
      .map((a) => {
        if (typeof a === "object") {
          try {
            return JSON.stringify(a)
          } catch {
            return String(a)
          }
        }
        return String(a)
      })
      .join(" ") +
    "\n"
  void fs.appendFile(debugLogFile, line).catch(() => {})
}

/**
 * 本地扩展状态查询结果。
 */
type StatusResult =
  | { kind: "loading" }
  | { kind: "ok"; config: { api_base: string; user: { username: string } } | null; extensions: Array<{ type: ExtensionType; slug: string; name?: string; version: string; enabled: boolean }> }
  | { kind: "error"; message: string }

/**
 * 远程市场列表查询结果（含分页信息）。
 */
type ListResult =
  | { kind: "loading" }
  | { kind: "ok"; data: Extension[]; pageInfo: PagedResult<Extension>["pageInfo"] }
  | { kind: "error"; message: string }

/**
 * Omni Studio 状态视图。
 * 仅显示登录状态和配置摘要。
 */
function OmniStudioStatusView(props: { dialog: DialogContext; onBack: () => void }) {
  const { theme } = useTheme()
  const [status, setStatus] = createSignal<StatusResult>({ kind: "loading" })

  createEffect(() => {
    debugLog("[OmniStudio] StatusView 挂载，开始刷新")
    void (async () => {
      setStatus({ kind: "loading" })
      try {
        const result = await Effect.runPromise(
          OmniStudioStore.Service.use((svc) => svc.getStatus()).pipe(
            Effect.provide(OmniStudioStore.defaultLayer),
          ),
        )
        setStatus({ kind: "ok", config: result.config, extensions: result.extensions })
      } catch (e) {
        setStatus({ kind: "error", message: String(e) })
      }
    })()
  })

  const headerLines = () => {
    const s = status()
    if (s.kind === "loading") return "加载中..."
    if (s.kind === "error") return `错误: ${s.message}`
    const lines = [
      `登录状态: ${s.config ? "已登录" : "未登录"}`,
      s.config ? `API 地址: ${s.config.api_base}` : "",
      s.config ? `用户名: ${s.config.user.username}` : "",
      `扩展数量: ${s.extensions.length}`,
    ]
    return lines.filter(Boolean).join("\n")
  }

  return (
    <box paddingLeft={2} paddingRight={2} gap={1} paddingBottom={1}>
      <box flexDirection="row" justifyContent="space-between">
        <text fg={theme.text} attributes={TextAttributes.BOLD}>
          Omni Studio Extension 状态
        </text>
        <text fg={theme.textMuted} onMouseUp={() => props.onBack()}>
          esc
        </text>
      </box>
      <box paddingBottom={1}>
        <text fg={theme.textMuted}>{headerLines()}</text>
      </box>
    </box>
  )
}

/**
 * Omni Studio 本地扩展视图。
 * 显示已安装扩展列表，支持启用/禁用/卸载和前端分页。
 * 操作按钮采用行内确认模式，避免弹出 dialog 导致 onClose 回调回到主菜单。
 */
function OmniStudioLocalView(props: { dialog: DialogContext; onBack: () => void }) {
  const { theme } = useTheme()
  const [status, setStatus] = createSignal<StatusResult>({ kind: "loading" })
  const [currentPage, setCurrentPage] = createSignal(1)
  const [pendingAction, setPendingAction] = createSignal<{ type: "enable" | "disable" | "uninstall"; slug: string } | null>(null)
  const PAGE_SIZE = 10

  createEffect(() => {
    debugLog("[OmniStudio] LocalView 挂载，开始刷新")
    void (async () => {
      setStatus({ kind: "loading" })
      try {
        const result = await Effect.runPromise(
          OmniStudioStore.Service.use((svc) => svc.getStatus()).pipe(
            Effect.provide(OmniStudioStore.defaultLayer),
          ),
        )
        setStatus({ kind: "ok", config: result.config, extensions: result.extensions })
        setCurrentPage(1)
      } catch (e) {
        setStatus({ kind: "error", message: String(e) })
      }
    })()
  })

  /** 刷新状态 */
  const refresh = async () => {
    try {
      const result = await Effect.runPromise(
        OmniStudioStore.Service.use((svc) => svc.getStatus()).pipe(
          Effect.provide(OmniStudioStore.defaultLayer),
        ),
      )
      setStatus({ kind: "ok", config: result.config, extensions: result.extensions })
    } catch (e) {
      setStatus({ kind: "error", message: String(e) })
    }
  }

  /** 启用扩展 */
  const handleEnable = async (ext: { type: ExtensionType; slug: string }) => {
    try {
      await Effect.runPromise(
        OmniStudioStore.Service.use((svc) => svc.setEnabled(ext.type, ext.slug, true)).pipe(
          Effect.provide(OmniStudioStore.defaultLayer),
        ),
      )
      setPendingAction(null)
      await refresh()
    } catch (e) {
      setPendingAction(null)
      await DialogAlert.show(props.dialog, "启用失败", String(e))
    }
  }

  /** 禁用扩展 */
  const handleDisable = async (ext: { type: ExtensionType; slug: string }) => {
    try {
      await Effect.runPromise(
        OmniStudioStore.Service.use((svc) => svc.setEnabled(ext.type, ext.slug, false)).pipe(
          Effect.provide(OmniStudioStore.defaultLayer),
        ),
      )
      setPendingAction(null)
      await refresh()
    } catch (e) {
      setPendingAction(null)
      await DialogAlert.show(props.dialog, "禁用失败", String(e))
    }
  }

  /** 卸载扩展 */
  const handleUninstall = async (ext: { type: ExtensionType; slug: string }) => {
    try {
      await Effect.runPromise(
        OmniStudioStore.Service.use((svc) => svc.uninstall(ext.type, ext.slug)).pipe(
          Effect.provide(OmniStudioStore.defaultLayer),
        ),
      )
      setPendingAction(null)
      await refresh()
    } catch (e) {
      setPendingAction(null)
      await DialogAlert.show(props.dialog, "卸载失败", String(e))
    }
  }

  const pagedExtensions = () => {
    const s = status()
    if (s.kind !== "ok") return []
    const start = (currentPage() - 1) * PAGE_SIZE
    return s.extensions.slice(start, start + PAGE_SIZE)
  }

  const totalPages = () => {
    const s = status()
    if (s.kind !== "ok") return 1
    return Math.max(1, Math.ceil(s.extensions.length / PAGE_SIZE))
  }

  const pageText = () => {
    const s = status()
    if (s.kind !== "ok") return ""
    return `第 ${currentPage()}/${totalPages()} 页`
  }

  const canPrev = () => currentPage() > 1
  const canNext = () => currentPage() < totalPages()

  const dimensions = useTerminalDimensions()
  const scrollHeight = createMemo(() => {
    const itemCount = pagedExtensions().length
    const contentHeight = Math.max(itemCount * 2 + 1, 3)
    const maxH = Math.max(3, Math.floor(dimensions().height * 0.4))
    return Math.min(contentHeight, maxH)
  })

  return (
    <box paddingLeft={2} paddingRight={2} gap={1} paddingBottom={1}>
      <box flexDirection="row" justifyContent="space-between">
        <text fg={theme.text} attributes={TextAttributes.BOLD}>
          本地扩展
        </text>
        <text fg={theme.textMuted} onMouseUp={() => props.onBack()}>
          esc
        </text>
      </box>
      <Show when={status().kind === "ok" && (status() as Extract<StatusResult, { kind: "ok" }>).extensions.length > 0}>
        <scrollbox maxHeight={scrollHeight()} scrollbarOptions={{ visible: true }}>
          <box gap={1}>
            <For each={pagedExtensions()}>
              {(ext) => (
                <box flexDirection="row" justifyContent="space-between">
                  <text fg={theme.textMuted} wrapMode="none" overflow="hidden">
                    {`${ext.name || ext.slug} (${ext.type}) v${ext.version}`}
                  </text>
                  <box flexDirection="row" gap={2}>
                    <text fg={theme.textMuted}>|</text>
                    <Show when={pendingAction()?.slug === ext.slug && pendingAction()?.type === "enable"}>
                      <text
                        fg={theme.primary}
                        attributes={TextAttributes.BOLD}
                        onMouseUp={() => handleEnable(ext)}
                      >
                        [确认启用]
                      </text>
                      <text fg={theme.textMuted} onMouseUp={() => setPendingAction(null)}>
                        [取消]
                      </text>
                    </Show>
                    <Show when={pendingAction()?.slug === ext.slug && pendingAction()?.type === "disable"}>
                      <text
                        fg={theme.primary}
                        attributes={TextAttributes.BOLD}
                        onMouseUp={() => handleDisable(ext)}
                      >
                        [确认禁用]
                      </text>
                      <text fg={theme.textMuted} onMouseUp={() => setPendingAction(null)}>
                        [取消]
                      </text>
                    </Show>
                    <Show when={pendingAction()?.slug === ext.slug && pendingAction()?.type === "uninstall"}>
                      <text
                        fg={theme.error}
                        attributes={TextAttributes.BOLD}
                        onMouseUp={() => handleUninstall(ext)}
                      >
                        [确认卸载]
                      </text>
                      <text fg={theme.textMuted} onMouseUp={() => setPendingAction(null)}>
                        [取消]
                      </text>
                    </Show>
                    <Show when={pendingAction()?.slug !== ext.slug}>
                      <Show when={!ext.enabled}>
                        <text
                          fg={theme.primary}
                          onMouseUp={() => setPendingAction({ type: "enable", slug: ext.slug })}
                        >
                          [启用]
                        </text>
                      </Show>
                      <Show when={ext.enabled}>
                        <text
                          fg={theme.primary}
                          onMouseUp={() => setPendingAction({ type: "disable", slug: ext.slug })}
                        >
                          [禁用]
                        </text>
                      </Show>
                      <text
                        fg={theme.textMuted}
                        onMouseUp={() => setPendingAction({ type: "uninstall", slug: ext.slug })}
                      >
                        [卸载]
                      </text>
                    </Show>
                  </box>
                </box>
              )}
            </For>
          </box>
        </scrollbox>
        <Show when={totalPages() > 1}>
          <box flexDirection="row" justifyContent="space-between" paddingTop={1}>
            <text
              fg={canPrev() ? theme.primary : theme.textMuted}
              attributes={canPrev() ? TextAttributes.BOLD : undefined}
              onMouseUp={() => canPrev() && setCurrentPage((p) => p - 1)}
            >
              ◀ 上一页
            </text>
            <text fg={theme.textMuted}>{pageText()}</text>
            <text
              fg={canNext() ? theme.primary : theme.textMuted}
              attributes={canNext() ? TextAttributes.BOLD : undefined}
              onMouseUp={() => canNext() && setCurrentPage((p) => p + 1)}
            >
              下一页 ▶
            </text>
          </box>
        </Show>
      </Show>
    </box>
  )
}

/**
 * Omni Studio 列表视图。
 * 支持 type 切换和分页浏览，底部显示页码和翻页按钮。
 * 按 ESC 键盘返回主菜单。
 */
function OmniStudioListView(props: { dialog: DialogContext; onBack: () => void }) {
  const { theme } = useTheme()
  const [marketList, setMarketList] = createSignal<ListResult>({ kind: "loading" })
  const [currentPage, setCurrentPage] = createSignal(1)
  const [selectedType, setSelectedType] = createSignal<ExtensionType>("skill")

  const typeOptions: ExtensionType[] = ["skill", "tool", "plugin", "agent"]



  /**
   * 加载指定 type 和页码的数据。
   * currentPage 或 selectedType 变化时自动触发。
   */
  createEffect(() => {
    const page = currentPage()
    const type = selectedType()
    debugLog("[OmniStudio] ListView 加载", type, "第", page, "页")
    void (async () => {
      setMarketList({ kind: "loading" })
      try {
        const result = await Effect.runPromise(
          OmniStudioMarket.Service.use((svc) => svc.listPaged(type, page)).pipe(
            Effect.provide(OmniStudioMarket.defaultLayer),
          ),
        )
        setMarketList({ kind: "ok", data: result.records, pageInfo: result.pageInfo })
      } catch (e) {
        setMarketList({ kind: "error", message: String(e) })
      }
    })()
  })

  /**
   * 切换扩展类型，重置到第 1 页。
   */
  const switchType = (type: ExtensionType) => {
    if (type === selectedType()) return
    setSelectedType(type)
    setCurrentPage(1)
  }

  /**
   * 点击安装扩展。
   * 先调用 getMeta 获取完整信息（含 version 和 download_url），再确认安装。
   */
  const handleInstallExt = async (ext: Extension) => {
    try {
      const meta = await Effect.runPromise(
        OmniStudioMarket.Service.use((svc) => svc.getMeta(selectedType(), ext.slug)).pipe(
          Effect.provide(OmniStudioMarket.defaultLayer),
        ),
      )
      const confirmed = await DialogConfirm.show(
        props.dialog,
        "确认安装",
        `安装 ${meta.name} (${meta.type})${meta.version ? ` v${meta.version}` : ""}?`,
      )
      if (!confirmed) return

      await Effect.runPromise(
        OmniStudioStore.Service.use((svc) => svc.install(meta)).pipe(
          Effect.provide(OmniStudioStore.defaultLayer),
        ),
      )
      await DialogAlert.show(props.dialog, "安装成功", `${meta.name} 已安装并启用`)
    } catch (e) {
      await DialogAlert.show(props.dialog, "安装失败", String(e))
    }
  }

  const pageText = () => {
    const l = marketList()
    if (l.kind !== "ok") return ""
    return `第 ${l.pageInfo.currentPage}/${l.pageInfo.totalPages} 页 (共 ${l.pageInfo.totalElements} 条)`
  }

  const canPrev = () => {
    const l = marketList()
    return l.kind === "ok" && l.pageInfo.hasPrevious
  }

  const canNext = () => {
    const l = marketList()
    return l.kind === "ok" && l.pageInfo.hasNext
  }

  const dimensions = useTerminalDimensions()
  const scrollHeight = createMemo(() => {
    const l = marketList()
    const itemCount = l.kind === "ok" ? l.data.length : 0
    const contentHeight = Math.max(itemCount * 2 + 1, 3)
    const maxH = Math.max(3, Math.floor(dimensions().height * 0.4))
    return Math.min(contentHeight, maxH)
  })

  return (
    <box paddingLeft={2} paddingRight={2} gap={1} paddingBottom={1}>
      <box flexDirection="row" justifyContent="space-between">
        <text fg={theme.text} attributes={TextAttributes.BOLD}>
          Omni Studio Extension 列表
        </text>
        <text
          fg={theme.textMuted}
          onMouseUp={() => props.onBack()}
        >
          esc
        </text>
      </box>
      <box flexDirection="row" gap={2} paddingTop={1} paddingBottom={1}>
        {typeOptions.map((type) => {
          const active = selectedType() === type
          return (
            <text
              fg={active ? theme.primary : theme.textMuted}
              attributes={active ? TextAttributes.BOLD : undefined}
              onMouseUp={() => switchType(type)}
            >
              {active ? `[${type}]` : ` ${type} `}
            </text>
          )
        })}
      </box>
      <Show
        when={marketList().kind === "ok" && (marketList() as Extract<ListResult, { kind: "ok" }>).data.length > 0}
        fallback={
          <box paddingBottom={1}>
            <text fg={theme.textMuted}>
              {marketList().kind === "loading"
                ? "加载中..."
                : marketList().kind === "error"
                  ? `错误: ${(marketList() as Extract<ListResult, { kind: "error" }>).message}`
                  : "未找到扩展"}
            </text>
          </box>
        }
      >
        <scrollbox maxHeight={scrollHeight()} scrollbarOptions={{ visible: true }}>
          <box gap={1}>
            <For each={(marketList() as Extract<ListResult, { kind: "ok" }>).data}>
              {(ext) => (
                <box flexDirection="row" justifyContent="space-between">
                  <text fg={theme.textMuted} wrapMode="none" overflow="hidden">
                    {`${ext.name} (${ext.type})${ext.version ? ` v${ext.version}` : ""}${ext.author ? ` - ${ext.author}` : ""}`}
                  </text>
                  <box flexDirection="row" gap={2}>
                    <text fg={theme.textMuted}>|</text>
                    <text
                      fg={theme.primary}
                      attributes={TextAttributes.BOLD}
                      onMouseUp={() => handleInstallExt(ext)}
                    >
                      [安装]
                    </text>
                  </box>
                </box>
              )}
            </For>
          </box>
        </scrollbox>
        <box flexDirection="row" justifyContent="space-between" paddingTop={1}>
          <text
            fg={canPrev() ? theme.primary : theme.textMuted}
            attributes={canPrev() ? TextAttributes.BOLD : undefined}
            onMouseUp={() => canPrev() && setCurrentPage((p) => p - 1)}
          >
            ◀ 上一页
          </text>
          <text fg={theme.textMuted}>{pageText()}</text>
          <text
            fg={canNext() ? theme.primary : theme.textMuted}
            attributes={canNext() ? TextAttributes.BOLD : undefined}
            onMouseUp={() => canNext() && setCurrentPage((p) => p + 1)}
          >
            下一页 ▶
          </text>
        </box>
      </Show>
    </box>
  )
}

/**
 * Omni Studio TUI 对话框。
 * 在终端界面中提供扩展市场管理功能，
 * 支持查看状态、管理本地扩展、浏览市场列表、配置 API 地址、登录和登出。
 * 安装/卸载/启用/禁用等操作已在列表视图和本地扩展视图中提供，主菜单不再重复。
 */
export function DialogOmniStudio() {
  const dialog = useDialog()
  const { theme } = useTheme()

  debugLog("[OmniStudio] DialogOmniStudio 挂载")

  /**
   * 显示操作结果提示，确认后返回 Omni Studio 菜单。
   */
  const showResult = async (title: string, message: string) => {
    debugLog("[OmniStudio] showResult:", title, message)
    await DialogAlert.show(dialog, title, message)
    debugLog("[OmniStudio] dialog.replace after alert")
    dialog.replace(() => <DialogOmniStudio />)
  }

  /**
   * 返回菜单。
   * 使用 setTimeout 避免与 dialog 系统的 onClose 回调产生递归。
   */
  const backToMenu = () => {
    debugLog("[OmniStudio] backToMenu")
    setTimeout(() => {
      dialog.replace(() => <DialogOmniStudio />)
    }, 0)
  }

  /**
   * 处理登录操作。
   */
  const handleLogin = async () => {
    const username = await DialogPrompt.show(dialog, "用户名", { placeholder: "admin" })
    if (!username) return
    const password = await DialogPrompt.show(dialog, "密码（输入内容可见）", { placeholder: "输入密码" })
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
   */
  const handleSetup = async () => {
    const apiBase = await DialogPrompt.show(dialog, "Omni Studio Extension API 地址", {
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
      await showResult("Omni Studio Extension", "已登出")
    } catch (e) {
      await showResult("Omni Studio Extension", `登出失败: ${e}`)
    }
  }

  return (
    <DialogSelect
      title="Omni Studio Extension"
      options={[
        {
          title: "状态",
          value: "status",
          description: "查看登录状态和 API 配置",
          onSelect: () => {
            debugLog("[OmniStudio] 点击状态")
            dialog.replace(() => <OmniStudioStatusView dialog={dialog} onBack={backToMenu} />, backToMenu)
          },
        },
        {
          title: "本地扩展",
          value: "local",
          description: "查看和管理已安装的扩展",
          onSelect: () => {
            debugLog("[OmniStudio] 点击本地扩展")
            dialog.replace(() => <OmniStudioLocalView dialog={dialog} onBack={backToMenu} />, backToMenu)
          },
        },
        {
          title: "列表",
          value: "list",
          description: "浏览市场扩展并安装",
          onSelect: () => {
            debugLog("[OmniStudio] 点击列表")
            dialog.replace(() => <OmniStudioListView dialog={dialog} onBack={backToMenu} />, backToMenu)
          },
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
  )
}
