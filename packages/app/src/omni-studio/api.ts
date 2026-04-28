import type { ExtensionItem, ExtensionType, MarketplaceQuery, ProjectExtensionConfig, UserInfo, UserToken } from "./types"

const API_BASE_KEY = "omni-studio.api-base"
const AUTH_BASE_KEY = "omni-studio.auth-base"
const USER_TOKEN_KEY = "omni-studio.user-token"
const USER_INFO_KEY = "omni-studio.user-info"
const PROJECT_CONFIG_KEY = "omni-studio.project-config"

const DEFAULT_API_BASE = "http://127.0.0.1:18000/api/v1"

function lsGet(key: string): string | null {
  if (typeof localStorage === "undefined") return null
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function lsSet(key: string, value: string | null): void {
  if (typeof localStorage === "undefined") return
  try {
    if (value !== null) localStorage.setItem(key, value)
    else localStorage.removeItem(key)
  } catch {
    // ignore
  }
}

export function getApiBase(): string {
  return lsGet(API_BASE_KEY) ?? DEFAULT_API_BASE
}

export function setApiBase(url: string): void {
  lsSet(API_BASE_KEY, url)
}

export function getAuthBase(): string {
  return lsGet(AUTH_BASE_KEY) ?? getApiBase()
}

export function setAuthBase(url: string): void {
  lsSet(AUTH_BASE_KEY, url)
}

export function getUserToken(): UserToken | null {
  const raw = lsGet(USER_TOKEN_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as UserToken
  } catch {
    return null
  }
}

export function setUserToken(token: UserToken | null): void {
  lsSet(USER_TOKEN_KEY, token ? JSON.stringify(token) : null)
}

export function getUserInfo(): UserInfo | null {
  const raw = lsGet(USER_INFO_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as UserInfo
  } catch {
    return null
  }
}

export function setUserInfo(info: UserInfo | null): void {
  lsSet(USER_INFO_KEY, info ? JSON.stringify(info) : null)
}

export function clearUser(): void {
  setUserToken(null)
  setUserInfo(null)
}

function apiUrl(path: string): string {
  return `${getApiBase()}${path}`
}

function authUrl(path: string): string {
  return `${getAuthBase()}${path}`
}

async function authFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const headers = new Headers(options?.headers)
  if (!headers.has("Content-Type") && !(options?.body instanceof FormData)) {
    headers.set("Content-Type", "application/json")
  }

  const resp = await fetch(url, { ...options, headers })
  const result = await resp.json()
  if (!result.success) throw new Error(result.message ?? "API error")
  return result.data as T
}

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const token = getUserToken()
  const headers = new Headers(options?.headers)
  if (!headers.has("Content-Type") && !(options?.body instanceof FormData)) {
    headers.set("Content-Type", "application/json")
  }
  if (token?.accessToken) {
    headers.set("Authorization", `Bearer ${token.accessToken}`)
  }

  const resp = await fetch(url, { ...options, headers })
  const result = await resp.json()
  if (!result.success) throw new Error(result.message ?? "API error")
  return result.data as T
}

export async function login(username: string, password: string): Promise<{ token: UserToken; user: UserInfo }> {
  const data = await authFetch<{ accessToken: string; refreshToken: string; user: UserInfo }>(authUrl("/auth/auth/login"), {
    method: "POST",
    body: JSON.stringify({ username, password }),
  })
  const token: UserToken = { accessToken: data.accessToken, refreshToken: data.refreshToken }
  setUserToken(token)
  setUserInfo(data.user)
  return { token, user: data.user }
}

export async function refreshToken(): Promise<UserToken> {
  const current = getUserToken()
  if (!current?.refreshToken) throw new Error("No refresh token")

  const data = await authFetch<{ accessToken: string; refreshToken: string }>(authUrl("/auth/auth/refresh-token"), {
    method: "POST",
    body: JSON.stringify({ accessToken: current.accessToken, refreshToken: current.refreshToken }),
  })
  const token: UserToken = { accessToken: data.accessToken, refreshToken: data.refreshToken }
  setUserToken(token)
  return token
}

export async function logout(): Promise<void> {
  try {
    const token = getUserToken()
    if (token?.accessToken) {
      await authFetch(authUrl("/auth/auth/logout"), {
        method: "POST",
        headers: { Authorization: `Bearer ${token.accessToken}` },
      })
    }
  } catch {
    // ignore
  } finally {
    clearUser()
  }
}

function toPlural(type: ExtensionType): string {
  const map: Record<ExtensionType, string> = {
    skill: "skills",
    tool: "tools",
    plugin: "plugins",
    agent: "agents",
  }
  return map[type]
}

function registryToItem(type: ExtensionType, registry: any): ExtensionItem {
  return {
    id: registry.slug,
    type,
    name: registry.displayName ?? registry.slug,
    description: registry.description ?? "",
    version: "-",
    author: registry.ownerId ?? "unknown",
    installed: false,
    enabled: false,
  }
}

async function fetchMyItems(type?: ExtensionType): Promise<Map<string, { enabled: boolean; version: string }>> {
  const token = getUserToken()
  if (!token?.accessToken) return new Map()

  const result = new Map<string, { enabled: boolean; version: string }>()

  const fetchPackageMy = async (et: string) => {
    try {
      const data = await apiFetch<{ items: any[] }>(apiUrl(`/packages/${et}/my?size=1000`))
      for (const item of data.items) {
        result.set(item.slug, { enabled: item.enabled, version: item.version ?? "-" })
      }
    } catch {
      // ignore
    }
  }

  const types = type ? [toPlural(type)] : ["skills", "tools", "plugins", "agents"]
  await Promise.all(types.map(fetchPackageMy))

  return result
}

export async function fetchMarketplace(query?: MarketplaceQuery): Promise<ExtensionItem[]> {
  const type = query?.type
  const keyword = query?.q
  const params = new URLSearchParams({ size: "1000" })
  if (keyword) params.set("keyword", keyword)

  let items: ExtensionItem[] = []

  const types = type ? [toPlural(type)] : ["skills", "tools", "plugins", "agents"]
  await Promise.all(
    types.map(async (et) => {
      try {
        const data = await apiFetch<{ records: any[] }>(apiUrl(`/packages/${et}?${params}`))
        const extType = et.slice(0, -1) as ExtensionType
        items.push(...data.records.map((r) => registryToItem(extType, r)))
      } catch {
        // ignore
      }
    }),
  )

  const myItems = await fetchMyItems(type)
  return items.map((item) => {
    const my = myItems.get(item.id)
    if (!my) return item
    return { ...item, installed: true, enabled: my.enabled, version: my.version }
  })
}

export async function fetchPackageDetail(type: ExtensionType, slug: string): Promise<string> {
  const et = toPlural(type)
  try {
    const data = await apiFetch<{ revisions?: any[] }>(apiUrl(`/packages/${et}/${slug}`))
    if (data.revisions && data.revisions.length > 0) {
      return data.revisions[0].version ?? "-"
    }
    return "-"
  } catch {
    return "-"
  }
}

export async function installExtension(id: string, type: ExtensionType): Promise<void> {
  const et = toPlural(type)
  await apiFetch(apiUrl(`/packages/${et}/my`), {
    method: "POST",
    body: JSON.stringify({ slug: id, version: null, enabled: true }),
  })
}

export async function uninstallExtension(id: string, type: ExtensionType): Promise<void> {
  const et = toPlural(type)
  await apiFetch(apiUrl(`/packages/${et}/my/${id}`), { method: "DELETE" })
}

export async function enableExtension(id: string, type: ExtensionType): Promise<void> {
  const et = toPlural(type)
  await apiFetch(apiUrl(`/packages/${et}/my/${id}`), {
    method: "PATCH",
    body: JSON.stringify({ enabled: true }),
  })
}

export async function disableExtension(id: string, type: ExtensionType): Promise<void> {
  const et = toPlural(type)
  await apiFetch(apiUrl(`/packages/${et}/my/${id}`), {
    method: "PATCH",
    body: JSON.stringify({ enabled: false }),
  })
}

export async function getProjectConfig(): Promise<ProjectExtensionConfig> {
  const raw = localStorage.getItem(PROJECT_CONFIG_KEY)
  if (!raw) return { enabled: [], inherit_global: true }
  try {
    return JSON.parse(raw) as ProjectExtensionConfig
  } catch {
    return { enabled: [], inherit_global: true }
  }
}

export async function setProjectConfig(config: ProjectExtensionConfig): Promise<void> {
  localStorage.setItem(PROJECT_CONFIG_KEY, JSON.stringify(config))
}

export function getEffectiveEnabled(
  globalEnabled: Set<string>,
  projectConfig: ProjectExtensionConfig,
): Set<string> {
  if (!projectConfig.inherit_global) return new Set(projectConfig.enabled)
  const merged = new Set(globalEnabled)
  for (const id of projectConfig.enabled) merged.add(id)
  return merged
}
