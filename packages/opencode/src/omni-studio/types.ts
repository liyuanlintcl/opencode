/** 扩展类型：skill（技能）、tool（工具）、plugin（插件）、agent（智能体）、spec（组合规格） */
export type ExtensionType = "skill" | "tool" | "plugin" | "agent" | "spec"

/**
 * 后端分页信息。
 */
export interface PageInfo {
  /** 当前页码（从 1 开始） */
  currentPage: number
  /** 每页条数 */
  size: number
  /** 总页数 */
  totalPages: number
  /** 总记录数 */
  totalElements: number
  /** 是否有下一页 */
  hasNext: boolean
  /** 是否有上一页 */
  hasPrevious: boolean
}

/**
 * 分页结果包装。
 */
export interface PagedResult<T> {
  /** 当前页记录列表 */
  records: T[]
  /** 分页信息 */
  pageInfo: PageInfo
}

/**
 * 远程 Marketplace 返回的扩展元数据。
 * 包含扩展的完整展示信息和下载地址，用于市场列表浏览和安装。
 */
export interface Extension {
  /** 扩展唯一标识符，URL-friendly */
  slug: string
  /** 扩展显示名称 */
  name: string
  /** 扩展功能描述 */
  description: string
  /** 当前版本号 */
  version: string
  /** 扩展类型 */
  type: ExtensionType
  /** 作者信息 */
  author: string
  /** 扩展包下载地址 */
  download_url: string
}

/**
 * 扩展目录中可能存在的生命周期脚本文件名。
 * 由 `executor.ts` 在运行时按当前操作系统检测匹配（.sh / .bat / .ps1）。
 */
export interface ExtensionScripts {
  /** 安装脚本：安装扩展后执行，用于安装依赖 */
  install?: string
  /** 启动脚本：启用扩展时执行 */
  start?: string
  /** 停止脚本：禁用扩展时执行 */
  stop?: string
  /** 卸载脚本：卸载扩展前执行 */
  uninstall?: string
  /** 环境激活脚本：执行其他生命周期脚本前先 source/调用，用于 Python/Node.js 环境隔离 */
  activate?: string
}

/**
 * Omni Studio 登录配置。
 * 持久化到 `~/.omni_studio/omni-studio.json`，文件权限 0o600。
 */
export interface OmniStudioConfig {
  /** Marketplace API 基础地址，认证也使用同一地址 */
  api_base: string
  /** JWT 访问令牌 */
  access_token: string
  /** JWT 刷新令牌 */
  refresh_token: string
  /** 当前登录用户信息 */
  user: {
    /** 用户 ID */
    id: string
    /** 用户名 */
    username: string
  }
}

/**
 * 本地已安装扩展的精简状态记录。
 * 持久化到 `~/.omni_studio/state.json`。
 */
export interface ExtensionEntry {
  /** 扩展类型 */
  type: ExtensionType
  /** 扩展唯一标识符 */
  slug: string
  /** 扩展显示名称，用于本地扩展列表展示；旧数据可能缺失 */
  name?: string
  /** 已安装版本号 */
  version: string
  /** 是否启用 */
  enabled: boolean
  /** 安装时间戳（ISO 8601） */
  installed_at: string
}

/**
 * 本地扩展状态文件的数据结构。
 * 对应 `~/.omni_studio/state.json`。
 */
export interface OmniStudioState {
  /** 本地已安装扩展列表 */
  extensions: ExtensionEntry[]
}
