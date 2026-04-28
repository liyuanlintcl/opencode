export type ExtensionType = "skill" | "agent" | "tool" | "plugin"

export type ExtensionItem = {
  id: string
  type: ExtensionType
  name: string
  description: string
  version: string
  author: string
  icon?: string
  installed: boolean
  enabled: boolean
}

export type UserToken = {
  accessToken: string
  refreshToken: string
}

export type UserInfo = {
  userId: number
  username: string
  fullName?: string
  openid?: string
}

export type ProjectExtensionConfig = {
  enabled: string[]
  inherit_global: boolean
}

export type MarketplaceQuery = {
  type?: ExtensionType
  q?: string
}

export type Category = "all" | ExtensionType | "installed" | "enabled"
