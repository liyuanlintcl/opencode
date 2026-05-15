import path from "path"
import fs from "fs/promises"
import { TextAttributes, RGBA, type ScrollBoxRenderable, type TextareaRenderable } from "@opentui/core"
import { useTheme } from "../context/theme"
import { useDialog, type DialogContext } from "@tui/ui/dialog"
import { useTerminalDimensions } from "@opentui/solid"
import { DialogSelect } from "@tui/ui/dialog-select"
import { DialogAlert } from "../ui/dialog-alert"
import { DialogConfirm } from "../ui/dialog-confirm"
import { DialogPrompt } from "../ui/dialog-prompt"
import { Show, createSignal, createEffect, For, createMemo, onMount, type Accessor } from "solid-js"
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

/**
 * 调试日志辅助函数，追加写入到 ~/.omni_studio/debug-search.log。
 * 用于定位 T31 搜索功能的键盘事件和 dialog 生命周期问题。
 */
function debugLog(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}\n`
  void fs.appendFile(path.join(Global.Path.home, ".omni_studio", "debug-search.log"), line).catch(() => {})
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
 * 内联搜索输入框组件。
 * 在当前视图内直接渲染 textarea，避免 dialog.replace() 导致组件实例重建、状态丢失。
 */
function InlineSearch(props: {
  initialValue: string
  onConfirm: (keyword: string) => void
}) {
  const { theme } = useTheme()
  let textarea: TextareaRenderable | undefined

  onMount(() => {
    setTimeout(() => {
      if (textarea && !textarea.isDestroyed) {
        textarea.focus()
      }
    }, 10)
  })

  return (
    <box flexDirection="row" gap={2} paddingBottom={1}>
      <text fg={theme.textMuted}>搜索:</text>
      <textarea
        onSubmit={() => props.onConfirm(textarea?.plainText ?? "")}
        height={1}
        ref={(val: TextareaRenderable) => { textarea = val }}
        initialValue={props.initialValue}
        placeholder="输入关键词"
        placeholderColor={theme.textMuted}
        textColor={theme.text}
        focusedTextColor={theme.text}
        cursorColor={theme.text}
      />
    </box>
  )
}

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
 * 扩展列表行外壳组件。
 * 封装左侧名称和右侧按钮容器的高亮逻辑。
 */
function ExtensionRowShell(props: {
  name?: string
  slug: string
  version: string
  isSelected: Accessor<boolean>
  children: any
}) {
  const { theme } = useTheme()
  const rowFg = () => (props.isSelected() ? theme.primary : theme.textMuted)
  const rowAttrs = () => (props.isSelected() ? TextAttributes.BOLD : undefined)
  const displayName = () => {
    const base = props.name || props.slug
    if (!props.version) return base
    return `${base}@${props.version}`
  }
  return (
    <box flexDirection="row" justifyContent="space-between">
      <text fg={rowFg()} attributes={rowAttrs()} wrapMode="none" overflow="hidden">
        {displayName()}
      </text>
      <box flexDirection="row" gap={2}>
        <text fg={rowFg()} attributes={rowAttrs()}>|</text>
        {props.children}
      </box>
    </box>
  )
}

/**
 * 扩展列表行内操作按钮组件。
 * 根据行选中状态和按钮焦点位置高亮显示。
 */
function ActionButton(props: {
  position: number
  defaultFg: string | RGBA
  isRowSelected: Accessor<boolean>
  selectedButtonIndex: Accessor<number>
  onClick: () => void
  children: any
}) {
  const { theme } = useTheme()
  const fg = () => {
    if (!props.isRowSelected()) return props.defaultFg
    return props.selectedButtonIndex() === props.position ? theme.primary : theme.textMuted
  }
  const attrs = () => {
    if (!props.isRowSelected()) return undefined
    return props.selectedButtonIndex() === props.position ? TextAttributes.BOLD : undefined
  }
  return (
    <text fg={fg()} attributes={attrs()} selectable={false} onMouseUp={props.onClick}>
      {props.children}
    </text>
  )
}

/**
 * 扩展列表共享键盘导航 hook。
 * 管理选中索引和按钮焦点，处理 ↑↓←→PgUp/PgDn/Tab/Enter/ESC。
 */
function useExtensionKeyboard(props: {
  items: () => any[]
  typeOptions: ExtensionType[]
  selectedType: () => ExtensionType
  setSelectedType: (type: ExtensionType) => void
  setCurrentPage: (fn: (p: number) => number) => void
  getButtonCount: (item: any) => number
  canPrev: () => boolean
  canNext: () => boolean
  onEnter: (item: any, buttonIndex: number) => void
  onEsc?: () => boolean
}) {
  const [selectedIndex, setSelectedIndex] = createSignal(0)
  const [selectedButtonIndex, setSelectedButtonIndex] = createSignal(0)

  createEffect(() => {
    selectedIndex()
    setSelectedButtonIndex(() => 0)
  })

  useKeyboard((evt) => {
    if (evt.name === "escape") {
      if (props.onEsc?.()) {
        evt.preventDefault()
        evt.stopPropagation()
        return
      }
    }

    if (evt.name === "tab") {
      evt.preventDefault()
      evt.stopPropagation()
      const currentIdx = props.typeOptions.indexOf(props.selectedType())
      const nextType = props.typeOptions[(currentIdx + 1) % props.typeOptions.length]
      props.setSelectedType(nextType)
      props.setCurrentPage(() => 1)
      setSelectedIndex(() => 0)
      return
    }

    const items = props.items()
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
      const btnCount = props.getButtonCount(ext)
      if (btnCount <= 1) return
      setSelectedButtonIndex((i) => (i <= 0 ? btnCount - 1 : i - 1))
    } else if (evt.name === "right" || evt.name === "l") {
      evt.preventDefault()
      evt.stopPropagation()
      const ext = items[selectedIndex()]
      if (!ext) return
      const btnCount = props.getButtonCount(ext)
      if (btnCount <= 1) return
      setSelectedButtonIndex((i) => (i >= btnCount - 1 ? 0 : i + 1))
    } else if (evt.name === "pageup") {
      if (props.canPrev()) {
        evt.preventDefault()
        evt.stopPropagation()
        props.setCurrentPage((p) => p - 1)
        setSelectedIndex(() => 0)
      }
    } else if (evt.name === "pagedown") {
      if (props.canNext()) {
        evt.preventDefault()
        evt.stopPropagation()
        props.setCurrentPage((p) => p + 1)
        setSelectedIndex(() => 0)
      }
    } else if (evt.name === "return") {
      evt.preventDefault()
      evt.stopPropagation()
      const ext = items[selectedIndex()]
      if (!ext) return
      props.onEnter(ext, selectedButtonIndex())
    }
  })

  return { selectedIndex, selectedButtonIndex, setSelectedIndex }
}

/**
 * Omni Studio 状态视图。
 * 仅显示登录状态和配置摘要。
 */
function OmniStudioStatusView(props: { dialog: DialogContext; onBack: () => void }) {
  const { theme } = useTheme()
  const [status, setStatus] = createSignal<StatusResult>({ kind: "loading" })

  createEffect(() => {
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
  const [searchKeyword, setSearchKeyword] = createSignal("")
  const [isSearchMode, setIsSearchMode] = createSignal(false)
  const [pendingAction, setPendingAction] = createSignal<{ type: "enable" | "disable" | "uninstall"; slug: string } | null>(null)
  const typeOptions: ExtensionType[] = ["skill", "tool", "plugin", "agent"]
  const PAGE_SIZE = 10

  createEffect(() => {
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

  const { selectedIndex, selectedButtonIndex, setSelectedIndex } = useExtensionKeyboard({
    items: () => pagedExtensions(),
    typeOptions,
    selectedType,
    setSelectedType,
    setCurrentPage,
    canPrev: () => canPrev(),
    canNext: () => canNext(),
    onEsc: () => {
      if (isSearchMode()) {
        setIsSearchMode(false)
        return true
      }
      if (pendingAction()) {
        setPendingAction(null)
        return true
      }
      return false
    },
    onEnter: (ext, btnIdx) => {
      const pending = pendingAction()
      if (pending && pending.slug === ext.slug) {
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
    },
    getButtonCount: (ext) => {
      const pending = pendingAction()
      return pending?.slug === ext.slug ? 2 : 2
    },
  })

  /** 按 / 键进入搜索模式 */
  useKeyboard((evt) => {
    debugLog(`[LocalView] useKeyboard: evt.name=${evt.name}, isSearchMode=${isSearchMode()}, pendingAction=${pendingAction()}`)
    if (evt.name === "/" && !isSearchMode() && !pendingAction()) {
      evt.preventDefault()
      evt.stopPropagation()
      debugLog("[LocalView] / key matched, entering search mode")
      setIsSearchMode(true)
    }
  })

  /** 切换类型时重置到第 1 页和选中索引，保留搜索词。 */
  const switchType = (type: ExtensionType) => {
    if (type === selectedType()) {
      return
    }
    setSelectedType(type)
    setCurrentPage(1)
    setSelectedIndex(0)
  }

  /**
   * 确认搜索：应用搜索词并关闭搜索模式。
   */
  const confirmSearch = (keyword: string) => {
    debugLog(`[LocalView] confirmSearch: keyword=${keyword}`)
    setIsSearchMode(false)
    setSearchKeyword(keyword.trim())
    setCurrentPage(1)
    setSelectedIndex(0)
  }

  /**
   * 清除当前搜索词，恢复完整列表。
   */
  const clearSearch = () => {
    setSearchKeyword("")
    setCurrentPage(1)
    setSelectedIndex(0)
  }

  /** 按当前选中类型和搜索词过滤的本地扩展列表。 */
  const filteredExtensions = () => {
    const s = status()
    if (s.kind !== "ok") return []
    const keyword = searchKeyword().toLowerCase()
    return s.extensions.filter((e) => {
      if (e.type !== selectedType()) return false
      if (!keyword) return true
      return (
        e.slug.toLowerCase().includes(keyword) ||
        (e.name?.toLowerCase().includes(keyword) ?? false)
      )
    })
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

    const buttons = () => {
      const pending = pendingAction()
      if (pending && pending.slug === ext.slug && pending.type === "enable") {
        return [
          <ActionButton defaultFg={theme.primary} position={0} onClick={() => handleEnable(ext)} isRowSelected={isRowSelected} selectedButtonIndex={selectedButtonIndex}>[确认启用]</ActionButton>,
          <ActionButton defaultFg={theme.textMuted} position={1} onClick={() => setPendingAction(null)} isRowSelected={isRowSelected} selectedButtonIndex={selectedButtonIndex}>[取消]</ActionButton>,
        ]
      }
      if (pending && pending.slug === ext.slug && pending.type === "disable") {
        return [
          <ActionButton defaultFg={theme.primary} position={0} onClick={() => handleDisable(ext)} isRowSelected={isRowSelected} selectedButtonIndex={selectedButtonIndex}>[确认禁用]</ActionButton>,
          <ActionButton defaultFg={theme.textMuted} position={1} onClick={() => setPendingAction(null)} isRowSelected={isRowSelected} selectedButtonIndex={selectedButtonIndex}>[取消]</ActionButton>,
        ]
      }
      if (pending && pending.slug === ext.slug && pending.type === "uninstall") {
        return [
          <ActionButton defaultFg={theme.error} position={0} onClick={() => handleUninstall(ext)} isRowSelected={isRowSelected} selectedButtonIndex={selectedButtonIndex}>[确认卸载]</ActionButton>,
          <ActionButton defaultFg={theme.textMuted} position={1} onClick={() => setPendingAction(null)} isRowSelected={isRowSelected} selectedButtonIndex={selectedButtonIndex}>[取消]</ActionButton>,
        ]
      }
      if (!ext.enabled) {
        return [
          <ActionButton defaultFg={theme.primary} position={0} onClick={() => setPendingAction({ type: "enable", slug: ext.slug })} isRowSelected={isRowSelected} selectedButtonIndex={selectedButtonIndex}>[启用]</ActionButton>,
          <ActionButton defaultFg={theme.textMuted} position={1} onClick={() => setPendingAction({ type: "uninstall", slug: ext.slug })} isRowSelected={isRowSelected} selectedButtonIndex={selectedButtonIndex}>[卸载]</ActionButton>,
        ]
      }
      return [
        <ActionButton defaultFg={theme.primary} position={0} onClick={() => setPendingAction({ type: "disable", slug: ext.slug })} isRowSelected={isRowSelected} selectedButtonIndex={selectedButtonIndex}>[禁用]</ActionButton>,
        <ActionButton defaultFg={theme.textMuted} position={1} onClick={() => setPendingAction({ type: "uninstall", slug: ext.slug })} isRowSelected={isRowSelected} selectedButtonIndex={selectedButtonIndex}>[卸载]</ActionButton>,
      ]
    }

    return (
      <ExtensionRowShell name={ext.name} slug={ext.slug} version={ext.version} isSelected={isRowSelected}>
        {buttons()}
      </ExtensionRowShell>
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
      <Show when={isSearchMode()}>
        <InlineSearch initialValue={searchKeyword()} onConfirm={confirmSearch} />
      </Show>
      <Show when={!isSearchMode() && searchKeyword()}>
        <box flexDirection="row" gap={2} paddingBottom={1}>
          <text fg={theme.textMuted}>搜索: {searchKeyword()}</text>
          <text
            fg={theme.primary}
            selectable={false}
            onMouseUp={clearSearch}
          >
            [清除]
          </text>
        </box>
      </Show>
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
          <text fg={theme.textMuted}>
            {searchKeyword()
              ? `未找到匹配 "${searchKeyword()}" 的本地扩展`
              : "该类型下没有已安装的扩展"}
          </text>
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
  const [searchKeyword, setSearchKeyword] = createSignal("")
  const [isSearchMode, setIsSearchMode] = createSignal(false)
  const [pendingSlug, setPendingSlug] = createSignal<string | null>(null)
  const [installingSlug, setInstallingSlug] = createSignal<string | null>(null)
  const [installResult, setInstallResult] = createSignal<{ slug: string; ok: boolean; msg: string } | null>(null)
  const [installProgress, setInstallProgress] = createSignal<{ slug: string; downloaded: number; total: number } | null>(null)
  const [localVersions, setLocalVersions] = createSignal<Map<string, string>>(new Map())

  const typeOptions: ExtensionType[] = ["skill", "tool", "plugin", "agent"]

  /**
   * 加载指定 type、页码和搜索词的远程数据，同时刷新本地已安装扩展列表。
   * currentPage、selectedType 或 searchKeyword 变化时自动触发。
   */
  createEffect(() => {
    const page = currentPage()
    const type = selectedType()
    const keyword = searchKeyword()
    void (async () => {
      setMarketList({ kind: "loading" })
      try {
        const [result, status] = await Promise.all([
          Effect.runPromise(
            OmniStudioMarket.Service.use((svc) => svc.listPaged(type, page, keyword)).pipe(
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
        setLocalVersions(new Map(status.extensions.map((e) => [`${e.type}:${e.slug}`, e.version])))
      } catch (e) {
        setMarketList({ kind: "error", message: String(e) })
      }
    })()
  })

  const { selectedIndex, selectedButtonIndex, setSelectedIndex } = useExtensionKeyboard({
    items: () => {
      const l = marketList()
      return l.kind === "ok" ? l.data : []
    },
    typeOptions,
    selectedType,
    setSelectedType,
    setCurrentPage,
    canPrev: () => canPrev(),
    canNext: () => canNext(),
    onEsc: () => {
      if (isSearchMode()) {
        setIsSearchMode(false)
        return true
      }
      if (pendingSlug()) {
        setPendingSlug(null)
        return true
      }
      if (installResult()) {
        setInstallResult(null)
        return true
      }
      return false
    },
    onEnter: (ext, btnIdx) => {
      if (pendingSlug() === ext.slug) {
        if (btnIdx === 0) handleInstallExt(ext)
        else setPendingSlug(null)
      } else if ((!isInstalled(ext) || needsUpdate(ext)) && installingSlug() !== ext.slug && installResult()?.slug !== ext.slug) {
        setPendingSlug(ext.slug)
      }
    },
    getButtonCount: (ext) => {
      if (installResult()?.slug === ext.slug || installingSlug() === ext.slug) return 0
      if (pendingSlug() === ext.slug) return 2
      if (!isInstalled(ext) || needsUpdate(ext)) return 1
      return 0
    },
  })

  /** 按 / 键进入搜索模式 */
  useKeyboard((evt) => {
    debugLog(`[ListView] useKeyboard: evt.name=${evt.name}, isSearchMode=${isSearchMode()}, pendingSlug=${pendingSlug()}, installingSlug=${installingSlug()}, installResult=${installResult()}`)
    if (evt.name === "/" && !isSearchMode() && !pendingSlug() && !installingSlug() && !installResult()) {
      evt.preventDefault()
      evt.stopPropagation()
      debugLog("[ListView] / key matched, entering search mode")
      setIsSearchMode(true)
    }
  })

  /**
   * 切换扩展类型，重置到第 1 页和选中索引，保留搜索词。
   */
  const switchType = (type: ExtensionType) => {
    if (type === selectedType()) {
      return
    }
    setSelectedType(type)
    setCurrentPage(1)
    setSelectedIndex(0)
  }

  /**
   * 确认搜索：应用搜索词并关闭搜索模式。
   */
  const confirmSearch = (keyword: string) => {
    debugLog(`[ListView] confirmSearch: keyword=${keyword}`)
    setIsSearchMode(false)
    setSearchKeyword(keyword.trim())
    setCurrentPage(1)
    setSelectedIndex(0)
  }

  /**
   * 清除当前搜索词，恢复完整列表。
   */
  const clearSearch = () => {
    setSearchKeyword("")
    setCurrentPage(1)
    setSelectedIndex(0)
  }

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
        OmniStudioStore.Service.use((svc) => svc.install(meta, (downloaded, total) => {
          setInstallProgress({ slug: ext.slug, downloaded, total })
        })).pipe(
          Effect.provide(OmniStudioStore.defaultLayer),
        ),
      )
      setInstallingSlug(null)
      setInstallProgress(null)
      /** 直接更新本地已安装集合，按钮会立即显示灰色 [已安装]，无黄色过渡。 */
      setLocalVersions((prev) => {
        const next = new Map(prev)
        next.set(`${ext.type}:${ext.slug}`, ext.version)
        return next
      })
    } catch (e) {
      setInstallingSlug(null)
      setInstallProgress(null)
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
  const isInstalled = (ext: Extension) => localVersions().has(`${ext.type}:${ext.slug}`)

  /** 判断远程扩展版本是否比本地已安装版本新，需要更新。 */
  const needsUpdate = (ext: Extension) => {
    const localVer = localVersions().get(`${ext.type}:${ext.slug}`)
    return localVer !== undefined && localVer !== ext.version
  }

  /** 渲染单行市场扩展条目，包含名称和行内安装按钮。选中行和聚焦按钮高亮显示。 */
  const MarketExtensionRow = (ext: Extension, index: () => number) => {
    const isRowSelected = () => selectedIndex() === index()
    const buttons = () => {
      if (installResult()?.slug === ext.slug) {
        return [
          <text fg={installResult()!.ok ? theme.primary : theme.error}>
            {installResult()!.msg}
          </text>,
        ]
      }
      if (installingSlug() === ext.slug) {
        const progress = installProgress()
        if (progress && progress.slug === ext.slug && progress.total > 0) {
          const pct = Math.min(100, Math.round((progress.downloaded / progress.total) * 100))
          return [<text fg={theme.textMuted}>下载中 {pct}%</text>]
        }
        return [<text fg={theme.textMuted}>安装中...</text>]
      }
      if (pendingSlug() === ext.slug) {
        return [
          <ActionButton defaultFg={theme.primary} position={0} onClick={() => handleInstallExt(ext)} isRowSelected={isRowSelected} selectedButtonIndex={selectedButtonIndex}>[确认安装]</ActionButton>,
          <ActionButton defaultFg={theme.textMuted} position={1} onClick={() => setPendingSlug(null)} isRowSelected={isRowSelected} selectedButtonIndex={selectedButtonIndex}>[取消]</ActionButton>,
        ]
      }
      if (needsUpdate(ext)) {
        return [
          <ActionButton defaultFg={theme.primary} position={0} onClick={() => setPendingSlug(ext.slug)} isRowSelected={isRowSelected} selectedButtonIndex={selectedButtonIndex}>[ 更新 ]</ActionButton>,
        ]
      }
      if (isInstalled(ext)) {
        return [<text fg={theme.textMuted}>[已安装]</text>]
      }
      return [
        <ActionButton defaultFg={theme.primary} position={0} onClick={() => setPendingSlug(ext.slug)} isRowSelected={isRowSelected} selectedButtonIndex={selectedButtonIndex}>[ 安装 ]</ActionButton>,
      ]
    }

    return (
      <ExtensionRowShell name={ext.name} slug={ext.slug} version={ext.version} isSelected={isRowSelected}>
        {buttons()}
      </ExtensionRowShell>
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
      <Show when={isSearchMode()}>
        <InlineSearch initialValue={searchKeyword()} onConfirm={confirmSearch} />
      </Show>
      <Show when={!isSearchMode() && searchKeyword()}>
        <box flexDirection="row" gap={2} paddingBottom={1}>
          <text fg={theme.textMuted}>搜索: {searchKeyword()}</text>
          <text
            fg={theme.primary}
            selectable={false}
            onMouseUp={clearSearch}
          >
            [清除]
          </text>
        </box>
      </Show>
      <Show
        when={marketList().kind === "ok" && (marketList() as Extract<ListResult, { kind: "ok" }>).data.length > 0}
        fallback={
          <box paddingBottom={1}>
            <text fg={theme.textMuted}>
              {marketList().kind === "loading"
                ? "加载中..."
                : marketList().kind === "error"
                  ? `错误: ${(marketList() as Extract<ListResult, { kind: "error" }>).message}`
                  : searchKeyword()
                    ? `未找到匹配 "${searchKeyword()}" 的扩展`
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


  /**
   * 显示操作结果提示，确认后返回 Omni Studio 菜单。
   */
  const showResult = async (title: string, message: string) => {
    await DialogAlert.show(dialog, title, message)
    dialog.replace(() => <DialogOmniStudio />)
  }

  /**
   * 返回菜单。
   * 使用 setTimeout 避免与 dialog 系统的 onClose 回调产生递归。
   */
  const backToMenu = () => {
    debugLog(`[backToMenu] called, suppressBackToMenu=${suppressBackToMenu}, stack=${dialog.stack.length}`)
    if (suppressBackToMenu) {
      debugLog("[backToMenu] suppressed, returning")
      return
    }
    setTimeout(() => {
      debugLog("[backToMenu] setTimeout fired, replacing with DialogOmniStudio")
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
          title: "本地扩展",
          value: "local",
          description: "查看和管理已安装的扩展",
          onSelect: () => {
            debugLog("[Menu] entering OmniStudioLocalView")
            dialog.replace(() => <OmniStudioLocalView dialog={dialog} onBack={backToMenu} />, backToMenu)
          },
        },
        {
          title: "扩展市场",
          value: "list",
          description: "浏览市场扩展并安装",
          onSelect: () => {
            debugLog("[Menu] entering OmniStudioListView")
            dialog.replace(() => <OmniStudioListView dialog={dialog} onBack={backToMenu} />, backToMenu)
          },
        },
        {
          title: "状态",
          value: "status",
          description: "查看登录状态和 API 配置",
          onSelect: () => {
            dialog.replace(() => <OmniStudioStatusView dialog={dialog} onBack={backToMenu} />, backToMenu)
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
