export type ExtensionType = "skill" | "agent" | "command" | "tool" | "plugin"

export type ExtensionItem = {
  id: string
  type: ExtensionType
  name: string
  description: string
  version: string
  author: string
  stars: number
  icon?: string
  installed: boolean
  enabled: boolean
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
