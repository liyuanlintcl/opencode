import type { ExtensionItem, ExtensionType, MarketplaceQuery, ProjectExtensionConfig } from "./types"

const MOCK_ITEMS: ExtensionItem[] = [
  {
    id: "skill-code-review",
    type: "skill",
    name: "Code Review",
    description: "AI-powered code review assistant with inline suggestions and best practice checks.",
    version: "1.2.0",
    author: "opencode",
    stars: 1240,
    installed: false,
    enabled: false,
  },
  {
    id: "skill-debugging",
    type: "skill",
    name: "Debugging Expert",
    description: "Advanced debugging skill that analyzes stack traces and suggests fixes.",
    version: "0.9.5",
    author: "community",
    stars: 856,
    installed: false,
    enabled: false,
  },
  {
    id: "agent-planner",
    type: "agent",
    name: "Task Planner",
    description: "Autonomous agent that breaks down complex tasks into actionable steps.",
    version: "2.1.0",
    author: "opencode",
    stars: 3200,
    installed: false,
    enabled: false,
  },
  {
    id: "agent-explorer",
    type: "agent",
    name: "Code Explorer",
    description: "Navigates large codebases and finds relevant files and functions.",
    version: "1.5.2",
    author: "opencode",
    stars: 2100,
    installed: false,
    enabled: false,
  },
  {
    id: "command-init",
    type: "command",
    name: "Project Init",
    description: "Quickly scaffold new projects with customizable templates.",
    version: "1.0.0",
    author: "opencode",
    stars: 540,
    installed: false,
    enabled: false,
  },
  {
    id: "command-review",
    type: "command",
    name: "PR Review",
    description: "Automated pull request review with diff analysis.",
    version: "1.3.0",
    author: "community",
    stars: 980,
    installed: false,
    enabled: false,
  },
  {
    id: "tool-shell-enhanced",
    type: "tool",
    name: "Enhanced Shell",
    description: "Extended shell execution with environment isolation and caching.",
    version: "1.1.0",
    author: "opencode",
    stars: 1500,
    installed: false,
    enabled: false,
  },
  {
    id: "tool-git-advanced",
    type: "tool",
    name: "Git Advanced",
    description: "Advanced git operations including interactive rebase and conflict resolution.",
    version: "2.0.0",
    author: "community",
    stars: 760,
    installed: false,
    enabled: false,
  },
  {
    id: "plugin-auth-codex",
    type: "plugin",
    name: "Codex Auth",
    description: "Authentication plugin for OpenAI Codex integration.",
    version: "1.0.3",
    author: "opencode",
    stars: 430,
    installed: false,
    enabled: false,
  },
  {
    id: "plugin-auth-copilot",
    type: "plugin",
    name: "Copilot Auth",
    description: "GitHub Copilot authentication and token management.",
    version: "1.2.1",
    author: "opencode",
    stars: 2100,
    installed: false,
    enabled: false,
  },
  {
    id: "skill-documentation",
    type: "skill",
    name: "Doc Writer",
    description: "Automatically generates documentation from code comments and types.",
    version: "0.8.0",
    author: "community",
    stars: 670,
    installed: false,
    enabled: false,
  },
  {
    id: "agent-test-writer",
    type: "agent",
    name: "Test Writer",
    description: "Generates comprehensive unit and integration tests.",
    version: "1.4.0",
    author: "community",
    stars: 1120,
    installed: false,
    enabled: false,
  },
]

const STORAGE_KEY = "omni-studio.installed"
const PROJECT_CONFIG_KEY = "omni-studio.project-config"

function readInstalled(): Set<string> {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return new Set()
  try {
    return new Set(JSON.parse(raw) as string[])
  } catch {
    return new Set()
  }
}

function writeInstalled(ids: Set<string>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(ids)))
}

function readEnabled(): Set<string> {
  const raw = localStorage.getItem(STORAGE_KEY + ":enabled")
  if (!raw) return new Set()
  try {
    return new Set(JSON.parse(raw) as string[])
  } catch {
    return new Set()
  }
}

function writeEnabled(ids: Set<string>) {
  localStorage.setItem(STORAGE_KEY + ":enabled", JSON.stringify(Array.from(ids)))
}

function readProjectConfig(): ProjectExtensionConfig {
  const raw = localStorage.getItem(PROJECT_CONFIG_KEY)
  if (!raw) return { enabled: [], inherit_global: true }
  try {
    return JSON.parse(raw) as ProjectExtensionConfig
  } catch {
    return { enabled: [], inherit_global: true }
  }
}

function writeProjectConfig(config: ProjectExtensionConfig) {
  localStorage.setItem(PROJECT_CONFIG_KEY, JSON.stringify(config))
}

export async function fetchMarketplace(query?: MarketplaceQuery): Promise<ExtensionItem[]> {
  await new Promise((resolve) => setTimeout(resolve, 300))

  const installed = readInstalled()
  const enabled = readEnabled()

  let items = MOCK_ITEMS.map((item) => ({
    ...item,
    installed: installed.has(item.id),
    enabled: enabled.has(item.id),
  }))

  if (query?.type && query.type !== "all") {
    items = items.filter((item) => item.type === query.type)
  }

  if (query?.q) {
    const q = query.q.toLowerCase()
    items = items.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.author.toLowerCase().includes(q),
    )
  }

  return items
}

export async function installExtension(id: string): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 600))
  const installed = readInstalled()
  installed.add(id)
  writeInstalled(installed)

  const enabled = readEnabled()
  enabled.add(id)
  writeEnabled(enabled)
}

export async function uninstallExtension(id: string): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 400))
  const installed = readInstalled()
  installed.delete(id)
  writeInstalled(installed)

  const enabled = readEnabled()
  enabled.delete(id)
  writeEnabled(enabled)
}

export async function enableExtension(id: string): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 200))
  const enabled = readEnabled()
  enabled.add(id)
  writeEnabled(enabled)
}

export async function disableExtension(id: string): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 200))
  const enabled = readEnabled()
  enabled.delete(id)
  writeEnabled(enabled)
}

export async function getProjectConfig(): Promise<ProjectExtensionConfig> {
  await new Promise((resolve) => setTimeout(resolve, 100))
  return readProjectConfig()
}

export async function setProjectConfig(config: ProjectExtensionConfig): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 200))
  writeProjectConfig(config)
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
