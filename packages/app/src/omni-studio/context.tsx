import { createContext, createEffect, createSignal, onCleanup, onMount, useContext, type Accessor } from "solid-js"
import { createStore, produce } from "solid-js/store"
import type { Category, ExtensionItem, ExtensionType, ProjectExtensionConfig } from "./types"
import {
  disableExtension,
  enableExtension,
  fetchMarketplace,
  getEffectiveEnabled,
  getProjectConfig,
  installExtension,
  setProjectConfig,
  uninstallExtension,
} from "./api"

type OmniStudioState = {
  items: ExtensionItem[]
  loading: boolean
  error: string | null
  activeCategory: Category
  searchQuery: string
  selectedItemId: string | null
  projectConfig: ProjectExtensionConfig
  actionLoading: Record<string, boolean>
}

type OmniStudioActions = {
  setActiveCategory: (category: Category) => void
  setSearchQuery: (query: string) => void
  setSelectedItemId: (id: string | null) => void
  install: (id: string) => Promise<void>
  uninstall: (id: string) => Promise<void>
  toggleGlobal: (id: string) => Promise<void>
  toggleProject: (id: string) => Promise<void>
  setInheritGlobal: (value: boolean) => Promise<void>
  refresh: () => Promise<void>
}

const OmniStudioContext = createContext<{
  state: OmniStudioState
  actions: OmniStudioActions
  effectiveEnabled: Accessor<Set<string>>
}>()

export function OmniStudioProvider(props: { children: any }) {
  const [state, setState] = createStore<OmniStudioState>({
    items: [],
    loading: true,
    error: null,
    activeCategory: "all",
    searchQuery: "",
    selectedItemId: null,
    projectConfig: { enabled: [], inherit_global: true },
    actionLoading: {},
  })

  const effectiveEnabled = () => {
    const globalEnabled = new Set(state.items.filter((i) => i.enabled).map((i) => i.id))
    return getEffectiveEnabled(globalEnabled, state.projectConfig)
  }

  const load = async () => {
    setState("loading", true)
    setState("error", null)
    try {
      const type = state.activeCategory === "all" || state.activeCategory === "installed" || state.activeCategory === "enabled"
        ? undefined
        : (state.activeCategory as ExtensionType)

      const items = await fetchMarketplace({ type, q: state.searchQuery || undefined })
      const projectConfig = await getProjectConfig()

      setState(produce((s) => {
        s.items = items
        s.projectConfig = projectConfig
      }))
    } catch {
      setState("error", "Failed to load marketplace")
    } finally {
      setState("loading", false)
    }
  }

  createEffect(() => {
    const category = state.activeCategory
    const query = state.searchQuery
    void load()
  })

  const filteredItems = () => {
    let items = state.items
    if (state.activeCategory === "installed") {
      items = items.filter((i) => i.installed)
    }
    if (state.activeCategory === "enabled") {
      items = items.filter((i) => effectiveEnabled().has(i.id))
    }
    return items
  }

  const setActionLoading = (id: string, value: boolean) => {
    setState(produce((s) => {
      s.actionLoading[id] = value
    }))
  }

  const actions: OmniStudioActions = {
    setActiveCategory: (category) => {
      setState("activeCategory", category)
      setState("selectedItemId", null)
    },
    setSearchQuery: (query) => {
      setState("searchQuery", query)
    },
    setSelectedItemId: (id) => {
      setState("selectedItemId", id)
    },
    install: async (id) => {
      setActionLoading(id, true)
      await installExtension(id)
      await load()
      setActionLoading(id, false)
    },
    uninstall: async (id) => {
      setActionLoading(id, true)
      await uninstallExtension(id)
      if (state.selectedItemId === id) setState("selectedItemId", null)
      await load()
      setActionLoading(id, false)
    },
    toggleGlobal: async (id) => {
      const item = state.items.find((i) => i.id === id)
      if (!item) return
      setActionLoading(id, true)
      if (item.enabled) await disableExtension(id)
      else await enableExtension(id)
      await load()
      setActionLoading(id, false)
    },
    toggleProject: async (id) => {
      const config = state.projectConfig
      const enabled = new Set(config.enabled)
      if (enabled.has(id)) enabled.delete(id)
      else enabled.add(id)
      const next = { ...config, enabled: Array.from(enabled) }
      await setProjectConfig(next)
      setState("projectConfig", next)
    },
    setInheritGlobal: async (value) => {
      const next = { ...state.projectConfig, inherit_global: value }
      await setProjectConfig(next)
      setState("projectConfig", next)
    },
    refresh: load,
  }

  return (
    <OmniStudioContext.Provider value={{ state, actions, effectiveEnabled }}>
      {props.children}
    </OmniStudioContext.Provider>
  )
}

export function useOmniStudio() {
  const ctx = useContext(OmniStudioContext)
  if (!ctx) throw new Error("useOmniStudio must be used within OmniStudioProvider")
  return ctx
}
