export type ExtensionType = "skill" | "tool" | "plugin" | "agent"

export interface Extension {
  slug: string
  name: string
  description: string
  version: string
  type: ExtensionType
  author: string
  download_url: string
}

export interface ExtensionScripts {
  install?: string
  start?: string
  stop?: string
  uninstall?: string
  activate?: string
}

export interface OmniStudioConfig {
  api_base: string
  auth_base: string
  access_token: string
  refresh_token: string
  user: {
    id: string
    username: string
  }
}

export interface ExtensionEntry {
  type: ExtensionType
  slug: string
  version: string
  enabled: boolean
  installed_at: string
}

export interface OmniStudioState {
  extensions: ExtensionEntry[]
}
