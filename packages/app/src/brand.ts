/**
 * Single source of truth for brand identity.
 * Modify values here to rebrand across the entire application.
 */
export const Brand = {
  /** Desktop application display name */
  appName: "Omni Studio",
  /** Desktop application name (lowercase, for paths/CLI) */
  appNameLower: "omni-studio",
  /** AI assistant display name */
  assistantName: "Omni Studio",
  /** AI assistant name (lowercase) */
  assistantNameLower: "omni-studio",
  /** Company name */
  company: "Valiantsec",
  /** Company name (lowercase, for URLs/identifiers) */
  companyLower: "valiantsec",
  /** Documentation site URL */
  docsUrl: "https://omni-studio.valiantsec.ai",
  /** GitHub organization */
  githubOrg: "valiantsec",
  /** Main GitHub repository */
  githubRepo: "omni-studio",
  /** GitHub issues URL */
  githubIssuesUrl: "https://github.com/valiantsec/omni-studio/issues",
  /** Brew tap name */
  brewTap: "valiantsec/tap",
  /** Brew formula name */
  brewFormula: "valiantsec/tap/omni-studio",
  /** API base URL */
  apiUrl: "https://api.omni-studio.valiantsec.ai",
  /** Web app URL */
  webAppUrl: "https://app.omni-studio.valiantsec.ai",
  /** Config schema URL */
  configSchemaUrl: "https://omni-studio.valiantsec.ai/config.json",
  /** TUI schema URL */
  tuiSchemaUrl: "https://omni-studio.valiantsec.ai/tui.json",
  /** Install script URL */
  installUrl: "https://omni-studio.valiantsec.ai/install",
} as const
