import { createContext, createEffect, useContext, type Accessor } from "solid-js"
import { createStore, produce } from "solid-js/store"
import type { Category, ExtensionItem, ExtensionType, ProjectExtensionConfig, UserInfo, UserToken } from "./types"
import {
  clearUser,
  disableExtension,
  enableExtension,
  fetchMarketplace,
  fetchPackageDetail,
  getEffectiveEnabled,
  getProjectConfig,
  getUserInfo,
  getUserToken,
  installExtension,
  login,
  logout,
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
  detailVersions: Record<string, string>
  userInfo: UserInfo | null
  userToken: UserToken | null
  showLoginForm: boolean
  showSettings: boolean
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
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
  setShowLoginForm: (value: boolean) => void
  toggleSettings: () => void
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
    detailVersions: {},
    userInfo: getUserInfo(),
    userToken: getUserToken(),
    showLoginForm: false,
    showSettings: false,
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

  createEffect(() => {
    const id = state.selectedItemId
    if (!id) return
    const item = state.items.find((i) => i.id === id)
    if (!item) return
    if (item.version !== "-") return
    if (state.detailVersions[id]) return

    void (async () => {
      const version = await fetchPackageDetail(item.type, item.id)
      setState(produce((s) => {
        s.detailVersions[id] = version
      }))
    })()
  })

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
      const item = state.items.find((i) => i.id === id)
      if (!item) return
      setActionLoading(id, true)
      await installExtension(id, item.type)
      await load()
      setActionLoading(id, false)
    },
    uninstall: async (id) => {
      const item = state.items.find((i) => i.id === id)
      if (!item) return
      setActionLoading(id, true)
      await uninstallExtension(id, item.type)
      if (state.selectedItemId === id) setState("selectedItemId", null)
      await load()
      setActionLoading(id, false)
    },
    toggleGlobal: async (id) => {
      const item = state.items.find((i) => i.id === id)
      if (!item) return
      setActionLoading(id, true)
      if (item.enabled) await disableExtension(id, item.type)
      else await enableExtension(id, item.type)
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
    login: async (username, password) => {
      const result = await login(username, password)
      setState(produce((s) => {
        s.userInfo = result.user
        s.userToken = result.token
        s.showLoginForm = false
      }))
      await load()
    },
    logout: async () => {
      await logout()
      setState(produce((s) => {
        s.userInfo = null
        s.userToken = null
        s.items = []
      }))
    },
    setShowLoginForm: (value) => {
      setState("showLoginForm", value)
    },
    toggleSettings: () => {
      setState("showSettings", (v) => !v)
    },
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
