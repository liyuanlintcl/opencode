import path from "path"
import fs from "fs/promises"
import { TextAttributes, RGBA, type ScrollBoxRenderable } from "@opentui/core"
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

import type { ExtensionType, Extension, ExtensionEntry, PagedResult } from "@/omni-studio/types"

/** 当子视图中弹出 DialogAlert 时，阻止 backToMenu 被 dialog.replace 触发，避免 Alert 闪退。 */
let suppressBackToMenu = false

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
 * 类型切换条组件。
 * 在列表和本地扩展视图顶部共享，支持 skill / tool / plugin / agent 切换。
 */
function TypeSwitchBar(props: {
  selectedType: () => ExtensionType
  onSwitch: (type: ExtensionType) => void
}) {
  const { theme } = useTheme()
  const typeOptions: ExtensionType[] = ["skill", "tool", "plugin", "agent"]
  return (
    <box flexDirection="row" gap={2} paddingTop={1} paddingBottom={1}>
      {typeOptions.map((type) => {
        const active = props.selectedType() === type
        return (
          <text
            fg={active ? theme.primary : theme.textMuted}
            attributes={active ? TextAttributes.BOLD : undefined}
            selectable={false}
            onMouseUp={() => props.onSwitch(type)}
          >
            {active ? `[${type}]` : ` ${type} `}
          </text>
        )
      })}
    </box>
  )
}

/**
 * 带条件 scrollbox 的列表容器。
 * 当内容高度超过 maxHeight 时启用 scrollbox；否则直接渲染内容。
 * maxHeight 调整为行高的整数倍，避免最后一行被部分截断出现灰色横条。
 */
function ScrollableList(props: { maxHeight: number; itemCount: number; selectedIndex?: number; children: any }) {
  let scroll: ScrollBoxRenderable | undefined
  const needsScroll = () => Math.max(props.itemCount * 2 + 1, 3) > props.maxHeight
  createEffect(() => {
    const idx = props.selectedIndex
    if (idx === undefined || idx < 0 || !scroll) return
    const itemY = idx * 2
    if (itemY < scroll.scrollTop) {
      scroll.scrollTo(itemY)
    } else if (itemY + 2 > scroll.scrollTop + scroll.height) {
      scroll.scrollTo(itemY + 2 - scroll.height)
    }
  })
  return (
    <Show when={needsScroll()} fallback={<box gap={1} maxHeight={props.maxHeight}>{props.children}</box>}>
      <scrollbox maxHeight={props.maxHeight} ref={(r: ScrollBoxRenderable) => { scroll = r }}>
        <box gap={1} paddingBottom={1}>{props.children}</box>
      </scrollbox>
    </Show>
  )
}

/**
 * 分页控件组件。
 * 在列表和本地扩展视图底部分享，支持上一页/下一页和页码显示。
 */
function PaginationBar(props: {
  canPrev: () => boolean
  canNext: () => boolean
  pageText: () => string
  onPrev: () => void
  onNext: () => void
}) {
  const { theme } = useTheme()
  return (
    <box flexDirection="row" justifyContent="space-between" paddingTop={1}>
      <text
        fg={props.canPrev() ? theme.primary : theme.textMuted}
        attributes={props.canPrev() ? TextAttributes.BOLD : undefined}
        selectable={false}
        onMouseUp={() => props.canPrev() && props.onPrev()}
      >
        ◀ 上一页
      </text>
      <text fg={theme.textMuted}>{props.pageText()}</text>
      <text
        fg={props.canNext() ? theme.primary : theme.textMuted}
        attributes={props.canNext() ? TextAttributes.BOLD : undefined}
        selectable={false}
        onMouseUp={() => props.canNext() && props.onNext()}
      >
        下一页 ▶
      </text>
    </box>
  )
}

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
        <text fg={theme.textMuted} selectable={false} onMouseUp={() => props.onBack()}>
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
  const [selectedType, setSelectedType] = createSignal<ExtensionType>("skill")
  const [pendingAction, setPendingAction] = createSignal<{ type: "enable" | "disable" | "uninstall"; slug: string } | null>(null)
  const [selectedIndex, setSelectedIndex] = createSignal(0)
  const [selectedButtonIndex, setSelectedButtonIndex] = createSignal(0)
  const typeOptions: ExtensionType[] = ["skill", "tool", "plugin", "agent"]
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
      suppressBackToMenu = true
      try {
        await DialogAlert.show(props.dialog, "启用失败", String(e))
      } finally {
        suppressBackToMenu = false
      }
      props.dialog.replace(() => <OmniStudioLocalView dialog={props.dialog} onBack={props.onBack} />, props.onBack)
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
      suppressBackToMenu = true
      try {
        await DialogAlert.show(props.dialog, "禁用失败", String(e))
      } finally {
        suppressBackToMenu = false
      }
      props.dialog.replace(() => <OmniStudioLocalView dialog={props.dialog} onBack={props.onBack} />, props.onBack)
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
      suppressBackToMenu = true
      try {
        await DialogAlert.show(props.dialog, "卸载失败", String(e))
      } finally {
        suppressBackToMenu = false
      }
      props.dialog.replace(() => <OmniStudioLocalView dialog={props.dialog} onBack={props.onBack} />, props.onBack)
    }
  }

  /** 切换类型时重置到第 1 页和选中索引。 */
  const switchType = (type: ExtensionType) => {
    debugLog("[OmniStudio][LocalView] switchType called:", type, "current:", selectedType())
    if (type === selectedType()) {
      debugLog("[OmniStudio][LocalView] switchType early return (same type)")
      return
    }
    setSelectedType(type)
    setCurrentPage(1)
    setSelectedIndex(0)
    debugLog("[OmniStudio][LocalView] switchType done:", type)
  }

  createEffect(() => {
    selectedIndex() // track
    setSelectedButtonIndex(0)
  })

  /** 键盘导航：↑↓ 移动选中，←→ 在行内按钮间切换，PgUp/PgDn 翻页，Tab 切换类型，Enter 执行操作，ESC 取消 pending。 */
  useKeyboard((evt) => {
    if (evt.name === "escape") {
      if (pendingAction()) {
        setPendingAction(null)
        evt.preventDefault()
        evt.stopPropagation()
        return
      }
    }

    const items = pagedExtensions()
    const maxIdx = items.length - 1
    if (maxIdx < 0) return

    if (evt.name === "up" || evt.name === "k") {
      evt.preventDefault()
      evt.stopPropagation()
      setSelectedIndex((i) => (i <= 0 ? maxIdx : i - 1))
    } else if (evt.name === "down" || evt.name === "j") {
      evt.preventDefault()
      evt.stopPropagation()
      setSelectedIndex((i) => (i >= maxIdx ? 0 : i + 1))
    } else if (evt.name === "left" || evt.name === "h") {
      evt.preventDefault()
      evt.stopPropagation()
      const ext = items[selectedIndex()]
      if (!ext) return
      const pending = pendingAction()
      const btnCount = pending?.slug === ext.slug ? 2 : 2
      if (btnCount <= 1) return
      setSelectedButtonIndex((i) => (i <= 0 ? btnCount - 1 : i - 1))
    } else if (evt.name === "right" || evt.name === "l") {
      evt.preventDefault()
      evt.stopPropagation()
      const ext = items[selectedIndex()]
      if (!ext) return
      const pending = pendingAction()
      const btnCount = pending?.slug === ext.slug ? 2 : 2
      if (btnCount <= 1) return
      setSelectedButtonIndex((i) => (i >= btnCount - 1 ? 0 : i + 1))
    } else if (evt.name === "pageup") {
      if (canPrev()) {
        evt.preventDefault()
        evt.stopPropagation()
        setCurrentPage((p) => p - 1)
        setSelectedIndex(0)
      }
    } else if (evt.name === "pagedown") {
      if (canNext()) {
        evt.preventDefault()
        evt.stopPropagation()
        setCurrentPage((p) => p + 1)
        setSelectedIndex(0)
      }
    } else if (evt.name === "tab") {
      evt.preventDefault()
      evt.stopPropagation()
      const currentIdx = typeOptions.indexOf(selectedType())
      const nextType = typeOptions[(currentIdx + 1) % typeOptions.length]
      debugLog("[OmniStudio][LocalView] Tab pressed, currentIdx:", currentIdx, "nextType:", nextType, "typeOptions:", typeOptions, "selectedType:", selectedType())
      switchType(nextType)
      setSelectedIndex(0)
    } else if (evt.name === "return") {
      evt.preventDefault()
      evt.stopPropagation()
      const ext = items[selectedIndex()]
      if (!ext) return
      const pending = pendingAction()
      const btnIdx = selectedButtonIndex()
      if (pending?.slug === ext.slug) {
        if (btnIdx === 0) {
          if (pending.type === "enable") handleEnable(ext)
          else if (pending.type === "disable") handleDisable(ext)
          else if (pending.type === "uninstall") handleUninstall(ext)
        } else {
          setPendingAction(null)
        }
      } else if (!ext.enabled) {
        if (btnIdx === 0) setPendingAction({ type: "enable", slug: ext.slug })
        else setPendingAction({ type: "uninstall", slug: ext.slug })
      } else {
        if (btnIdx === 0) setPendingAction({ type: "disable", slug: ext.slug })
        else setPendingAction({ type: "uninstall", slug: ext.slug })
      }
    }
  })

  /** 按当前选中类型过滤的本地扩展列表。 */
  const filteredExtensions = () => {
    const s = status()
    if (s.kind !== "ok") return []
    return s.extensions.filter((e) => e.type === selectedType())
  }

  /** 过滤后分页的本地扩展列表。 */
  const pagedExtensions = () => {
    const list = filteredExtensions()
    const start = (currentPage() - 1) * PAGE_SIZE
    return list.slice(start, start + PAGE_SIZE)
  }

  const totalPages = () => {
    const count = filteredExtensions().length
    return Math.max(1, Math.ceil(count / PAGE_SIZE))
  }

  const pageText = () => `第 ${currentPage()}/${totalPages()} 页`

  const canPrev = () => currentPage() > 1
  const canNext = () => currentPage() < totalPages()

  const dimensions = useTerminalDimensions()
  const scrollHeight = createMemo(() => {
    const itemCount = pagedExtensions().length
    const contentHeight = Math.max(itemCount * 2 + 1, 3)
    /** 限制为终端高度的 40%，为标题、切换条、分页等固定元素留出空间 */
    const maxH = Math.max(3, Math.floor(dimensions().height * 0.4))
    /** 调整为行高的整数倍（每行占2单位 + 1单位gap），避免最后一行被部分截断出现灰色横条。 */
    const adjustedMaxH = Math.floor((maxH - 1) / 2) * 2 + 1
    return Math.min(contentHeight, adjustedMaxH)
  })

  /** 渲染单行本地扩展条目，包含名称和行内操作按钮。选中行和聚焦按钮高亮显示。 */
  const LocalExtensionRow = (ext: { type: ExtensionType; slug: string; name?: string; version: string; enabled: boolean }, index: () => number) => {
    const isRowSelected = () => selectedIndex() === index()
    const rowFg = () => isRowSelected() ? theme.primary : theme.textMuted
    const rowAttrs = () => isRowSelected() ? TextAttributes.BOLD : undefined
    const btnFg = (position: number, defaultFg: string | RGBA) => {
      if (!isRowSelected()) return defaultFg
      return selectedButtonIndex() === position ? theme.primary : theme.textMuted
    }
    const btnAttrs = (position: number) => {
      if (!isRowSelected()) return undefined
      return selectedButtonIndex() === position ? TextAttributes.BOLD : undefined
    }
    return (
      <box flexDirection="row" justifyContent="space-between">
        <text fg={rowFg()} attributes={rowAttrs()} wrapMode="none" overflow="hidden">
          {ext.name || ext.slug}
        </text>
        <box flexDirection="row" gap={2}>
          <text fg={rowFg()} attributes={rowAttrs()}>|</text>
          <Show when={pendingAction()?.slug === ext.slug && pendingAction()?.type === "enable"}>
            <text fg={btnFg(0, theme.primary)} attributes={btnAttrs(0)} selectable={false} onMouseUp={() => handleEnable(ext)}>
              [确认启用]
            </text>
            <text fg={btnFg(1, theme.textMuted)} attributes={btnAttrs(1)} selectable={false} onMouseUp={() => setPendingAction(null)}>
              [取消]
            </text>
          </Show>
          <Show when={pendingAction()?.slug === ext.slug && pendingAction()?.type === "disable"}>
            <text fg={btnFg(0, theme.primary)} attributes={btnAttrs(0)} selectable={false} onMouseUp={() => handleDisable(ext)}>
              [确认禁用]
            </text>
            <text fg={btnFg(1, theme.textMuted)} attributes={btnAttrs(1)} selectable={false} onMouseUp={() => setPendingAction(null)}>
              [取消]
            </text>
          </Show>
          <Show when={pendingAction()?.slug === ext.slug && pendingAction()?.type === "uninstall"}>
            <text fg={btnFg(0, theme.error)} attributes={btnAttrs(0)} selectable={false} onMouseUp={() => handleUninstall(ext)}>
              [确认卸载]
            </text>
            <text fg={btnFg(1, theme.textMuted)} attributes={btnAttrs(1)} selectable={false} onMouseUp={() => setPendingAction(null)}>
              [取消]
            </text>
          </Show>
          <Show when={pendingAction()?.slug !== ext.slug}>
            <Show when={!ext.enabled}>
              <text fg={btnFg(0, theme.primary)} attributes={btnAttrs(0)} selectable={false} onMouseUp={() => setPendingAction({ type: "enable", slug: ext.slug })}>
                [启用]
              </text>
            </Show>
            <Show when={ext.enabled}>
              <text fg={btnFg(0, theme.primary)} attributes={btnAttrs(0)} selectable={false} onMouseUp={() => setPendingAction({ type: "disable", slug: ext.slug })}>
                [禁用]
              </text>
            </Show>
            <text fg={btnFg(1, theme.textMuted)} attributes={btnAttrs(1)} selectable={false} onMouseUp={() => setPendingAction({ type: "uninstall", slug: ext.slug })}>
              [卸载]
            </text>
          </Show>
        </box>
      </box>
    )
  }

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
      <TypeSwitchBar selectedType={selectedType} onSwitch={switchType} />
      <Show when={status().kind === "ok" && filteredExtensions().length > 0}>
        <ScrollableList maxHeight={scrollHeight()} itemCount={pagedExtensions().length} selectedIndex={selectedIndex()}>
          <For each={pagedExtensions()}>{LocalExtensionRow}</For>
        </ScrollableList>
        <Show when={totalPages() > 1}>
          <PaginationBar
            canPrev={canPrev}
            canNext={canNext}
            pageText={pageText}
            onPrev={() => { setCurrentPage((p) => p - 1); setSelectedIndex(0) }}
            onNext={() => { setCurrentPage((p) => p + 1); setSelectedIndex(0) }}
          />
        </Show>
      </Show>
      <Show when={status().kind === "ok" && filteredExtensions().length === 0}>
        <box paddingBottom={1}>
          <text fg={theme.textMuted}>该类型下没有已安装的扩展</text>
        </box>
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
  const [pendingSlug, setPendingSlug] = createSignal<string | null>(null)
  const [installingSlug, setInstallingSlug] = createSignal<string | null>(null)
  const [installResult, setInstallResult] = createSignal<{ slug: string; ok: boolean; msg: string } | null>(null)
  const [localSlugs, setLocalSlugs] = createSignal<Set<string>>(new Set())
  const [selectedIndex, setSelectedIndex] = createSignal(0)
  const [selectedButtonIndex, setSelectedButtonIndex] = createSignal(0)

  const typeOptions: ExtensionType[] = ["skill", "tool", "plugin", "agent"]

  /**
   * 加载指定 type 和页码的远程数据，同时刷新本地已安装扩展列表。
   * currentPage 或 selectedType 变化时自动触发。
   */
  createEffect(() => {
    const page = currentPage()
    const type = selectedType()
    debugLog("[OmniStudio] ListView 加载", type, "第", page, "页")
    void (async () => {
      setMarketList({ kind: "loading" })
      try {
        const [result, status] = await Promise.all([
          Effect.runPromise(
            OmniStudioMarket.Service.use((svc) => svc.listPaged(type, page)).pipe(
              Effect.provide(OmniStudioMarket.defaultLayer),
            ),
          ),
          Effect.runPromise(
            OmniStudioStore.Service.use((svc) => svc.getStatus()).pipe(
              Effect.provide(OmniStudioStore.defaultLayer),
            ),
          ).catch(() => ({ extensions: [] as ExtensionEntry[] })),
        ])
        setMarketList({ kind: "ok", data: result.records, pageInfo: result.pageInfo })
        setLocalSlugs(new Set(status.extensions.map((e) => `${e.type}:${e.slug}`)))
      } catch (e) {
        setMarketList({ kind: "error", message: String(e) })
      }
    })()
  })

  /**
   * 切换扩展类型，重置到第 1 页和选中索引。
   */
  const switchType = (type: ExtensionType) => {
    debugLog("[OmniStudio][ListView] switchType called:", type, "current:", selectedType())
    if (type === selectedType()) {
      debugLog("[OmniStudio][ListView] switchType early return (same type)")
      return
    }
    setSelectedType(type)
    setCurrentPage(1)
    setSelectedIndex(0)
    debugLog("[OmniStudio][ListView] switchType done:", type)
  }

  createEffect(() => {
    selectedIndex() // track
    setSelectedButtonIndex(0)
  })

  /** 键盘导航：↑↓ 移动选中，←→ 在行内按钮间切换，PgUp/PgDn 翻页，Tab 切换类型，Enter 执行操作，ESC 取消 pending。 */
  useKeyboard((evt) => {
    if (evt.name === "escape") {
      if (pendingSlug()) {
        setPendingSlug(null)
        evt.preventDefault()
        evt.stopPropagation()
        return
      }
      if (installResult()) {
        setInstallResult(null)
        evt.preventDefault()
        evt.stopPropagation()
        return
      }
    }

    const l = marketList()
    if (l.kind !== "ok") return
    const items = l.data
    const maxIdx = items.length - 1
    if (maxIdx < 0) return

    if (evt.name === "up" || evt.name === "k") {
      evt.preventDefault()
      evt.stopPropagation()
      setSelectedIndex((i) => (i <= 0 ? maxIdx : i - 1))
    } else if (evt.name === "down" || evt.name === "j") {
      evt.preventDefault()
      evt.stopPropagation()
      setSelectedIndex((i) => (i >= maxIdx ? 0 : i + 1))
    } else if (evt.name === "left" || evt.name === "h") {
      evt.preventDefault()
      evt.stopPropagation()
      const ext = items[selectedIndex()]
      if (!ext) return
      let btnCount = 0
      if (installResult()?.slug === ext.slug || installingSlug() === ext.slug) btnCount = 0
      else if (pendingSlug() === ext.slug) btnCount = 2
      else if (!isInstalled(ext)) btnCount = 1
      if (btnCount <= 1) return
      setSelectedButtonIndex((i) => (i <= 0 ? btnCount - 1 : i - 1))
    } else if (evt.name === "right" || evt.name === "l") {
      evt.preventDefault()
      evt.stopPropagation()
      const ext = items[selectedIndex()]
      if (!ext) return
      let btnCount = 0
      if (installResult()?.slug === ext.slug || installingSlug() === ext.slug) btnCount = 0
      else if (pendingSlug() === ext.slug) btnCount = 2
      else if (!isInstalled(ext)) btnCount = 1
      if (btnCount <= 1) return
      setSelectedButtonIndex((i) => (i >= btnCount - 1 ? 0 : i + 1))
    } else if (evt.name === "pageup") {
      if (canPrev()) {
        evt.preventDefault()
        evt.stopPropagation()
        setCurrentPage((p) => p - 1)
        setSelectedIndex(0)
      }
    } else if (evt.name === "pagedown") {
      if (canNext()) {
        evt.preventDefault()
        evt.stopPropagation()
        setCurrentPage((p) => p + 1)
        setSelectedIndex(0)
      }
    } else if (evt.name === "tab") {
      evt.preventDefault()
      evt.stopPropagation()
      const currentIdx = typeOptions.indexOf(selectedType())
      const nextType = typeOptions[(currentIdx + 1) % typeOptions.length]
      debugLog("[OmniStudio][ListView] Tab pressed, currentIdx:", currentIdx, "nextType:", nextType, "typeOptions:", typeOptions, "selectedType:", selectedType())
      switchType(nextType)
      setSelectedIndex(0)
    } else if (evt.name === "return") {
      evt.preventDefault()
      evt.stopPropagation()
      const ext = items[selectedIndex()]
      if (!ext) return
      const btnIdx = selectedButtonIndex()
      if (pendingSlug() === ext.slug) {
        if (btnIdx === 0) handleInstallExt(ext)
        else setPendingSlug(null)
      } else if (!isInstalled(ext) && installingSlug() !== ext.slug && installResult()?.slug !== ext.slug) {
        setPendingSlug(ext.slug)
      }
    }
  })

  /**
   * 点击确认安装扩展。
   * 直接执行 getMeta 和 install，不使用 DialogConfirm 避免触发 backToMenu。
   * 安装结果通过行内状态显示，3 秒后自动清除。
   */
  const handleInstallExt = async (ext: Extension) => {
    setPendingSlug(null)
    setInstallingSlug(ext.slug)
    try {
      const meta = await Effect.runPromise(
        OmniStudioMarket.Service.use((svc) => svc.getMeta(selectedType(), ext.slug)).pipe(
          Effect.provide(OmniStudioMarket.defaultLayer),
        ),
      )
      await Effect.runPromise(
        OmniStudioStore.Service.use((svc) => svc.install(meta)).pipe(
          Effect.provide(OmniStudioStore.defaultLayer),
        ),
      )
      setInstallingSlug(null)
      /** 直接更新本地已安装集合，按钮会立即显示灰色 [已安装]，无黄色过渡。 */
      setLocalSlugs((prev) => {
        const next = new Set(prev)
        next.add(`${ext.type}:${ext.slug}`)
        return next
      })
    } catch (e) {
      setInstallingSlug(null)
      suppressBackToMenu = true
      try {
        await DialogAlert.show(props.dialog, "安装失败", String(e))
      } finally {
        suppressBackToMenu = false
      }
      props.dialog.replace(() => <OmniStudioListView dialog={props.dialog} onBack={props.onBack} />, props.onBack)
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
    /** 调整为行高的整数倍（每行占2单位 + 1单位gap），避免最后一行被部分截断出现灰色横条。 */
    const adjustedMaxH = Math.floor((maxH - 1) / 2) * 2 + 1
    return Math.min(contentHeight, adjustedMaxH)
  })

  /** 判断远程扩展是否已在本地安装。 */
  const isInstalled = (ext: Extension) => localSlugs().has(`${ext.type}:${ext.slug}`)

  /** 渲染单行市场扩展条目，包含名称和行内安装按钮。选中行和聚焦按钮高亮显示。 */
  const MarketExtensionRow = (ext: Extension, index: () => number) => {
    const isRowSelected = () => selectedIndex() === index()
    const rowFg = () => isRowSelected() ? theme.primary : theme.textMuted
    const rowAttrs = () => isRowSelected() ? TextAttributes.BOLD : undefined
    const btnFg = (position: number, defaultFg: string | RGBA) => {
      if (!isRowSelected()) return defaultFg
      return selectedButtonIndex() === position ? theme.primary : theme.textMuted
    }
    const btnAttrs = (position: number) => {
      if (!isRowSelected()) return undefined
      return selectedButtonIndex() === position ? TextAttributes.BOLD : undefined
    }
    return (
      <box flexDirection="row" justifyContent="space-between">
        <text fg={rowFg()} attributes={rowAttrs()} wrapMode="none" overflow="hidden">
          {`${ext.name}${ext.author ? ` - ${ext.author}` : ""}`}
        </text>
        <box flexDirection="row" gap={2}>
          <text fg={rowFg()} attributes={rowAttrs()}>|</text>
          <Show when={installResult()?.slug === ext.slug}>
            <text fg={installResult()!.ok ? theme.primary : theme.error}>
              {installResult()!.msg}
            </text>
          </Show>
          <Show when={installingSlug() === ext.slug}>
            <text fg={theme.textMuted}>安装中...</text>
          </Show>
          <Show when={pendingSlug() === ext.slug && installingSlug() !== ext.slug && installResult()?.slug !== ext.slug}>
            <text fg={btnFg(0, theme.primary)} attributes={btnAttrs(0)} selectable={false} onMouseUp={() => handleInstallExt(ext)}>
              [确认安装]
            </text>
            <text fg={btnFg(1, theme.textMuted)} attributes={btnAttrs(1)} selectable={false} onMouseUp={() => setPendingSlug(null)}>
              [取消]
            </text>
          </Show>
          <Show when={pendingSlug() !== ext.slug && installingSlug() !== ext.slug && installResult()?.slug !== ext.slug}>
            <Show when={isInstalled(ext)}>
              <text fg={theme.textMuted}>[已安装]</text>
            </Show>
            <Show when={!isInstalled(ext)}>
              <text fg={btnFg(0, theme.primary)} attributes={btnAttrs(0)} selectable={false} onMouseUp={() => setPendingSlug(ext.slug)}>
                [ 安装 ]
              </text>
            </Show>
          </Show>
        </box>
      </box>
    )
  }

  return (
    <box paddingLeft={2} paddingRight={2} gap={1} paddingBottom={1}>
      <box flexDirection="row" justifyContent="space-between">
        <text fg={theme.text} attributes={TextAttributes.BOLD}>
          Omni Studio Extension 列表
        </text>
        <text fg={theme.textMuted} onMouseUp={() => props.onBack()}>
          esc
        </text>
      </box>
      <TypeSwitchBar selectedType={selectedType} onSwitch={switchType} />
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
        <ScrollableList maxHeight={scrollHeight()} itemCount={(marketList() as Extract<ListResult, { kind: "ok" }>).data.length} selectedIndex={selectedIndex()}>
          <For each={(marketList() as Extract<ListResult, { kind: "ok" }>).data}>{MarketExtensionRow}</For>
        </ScrollableList>
        <PaginationBar
          canPrev={canPrev}
          canNext={canNext}
          pageText={pageText}
          onPrev={() => { setCurrentPage((p) => p - 1); setSelectedIndex(0) }}
          onNext={() => { setCurrentPage((p) => p + 1); setSelectedIndex(0) }}
        />
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
    if (suppressBackToMenu) {
      debugLog("[OmniStudio] backToMenu suppressed (Alert active)")
      return
    }
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
