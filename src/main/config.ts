import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

export interface WindowBounds {
  x: number
  y: number
  width: number
  height: number
}

export const UPDATE_CHANNELS = ['newest', 'latest', 'verified'] as const
export type UpdateChannel = (typeof UPDATE_CHANNELS)[number]

export interface DisabledPluginRecord {
  packageName: string
  entryIds: string[]
  engineVersion?: string
  at?: string
}

export interface ShellConfig {
  activeEngineVersion?: string
  previousEngineVersion?: string
  windowBounds?: WindowBounds
  updateChannel?: UpdateChannel
  workspaceCwd?: string
  disabledPlugins?: DisabledPluginRecord[]
}

export function normalizeUpdateChannel(value: unknown): UpdateChannel {
  return value === 'latest' || value === 'verified' || value === 'newest' ? value : 'newest'
}

const FILE_NAME = 'shell.json'

export function configPath(userData: string): string {
  return join(userData, FILE_NAME)
}

export function loadConfig(userData: string): ShellConfig {
  const file = configPath(userData)
  if (!existsSync(file)) return {}
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as ShellConfig
  } catch {
    return {}
  }
}

export function saveConfig(userData: string, config: ShellConfig): void {
  mkdirSync(userData, { recursive: true })
  writeFileSync(configPath(userData), `${JSON.stringify(config, null, 2)}\n`)
}

export function restoreActiveEngine(
  config: ShellConfig,
  previousActive: string | undefined,
  failedVersion: string,
): void {
  config.activeEngineVersion = previousActive
  config.previousEngineVersion = failedVersion
}

export function defaultWorkspaceCwd(config?: ShellConfig): string {
  const fromConfig = config?.workspaceCwd?.trim()
  if (fromConfig && fromConfig.length > 0) return fromConfig
  return homedir()
}

export function rememberDisabledPlugins(
  config: ShellConfig,
  plugins: DisabledPluginRecord[],
): void {
  if (plugins.length === 0) return
  const next = [...(config.disabledPlugins ?? [])]
  for (const plugin of plugins) {
    const index = next.findIndex((row) => row.packageName === plugin.packageName)
    if (index >= 0) next[index] = plugin
    else next.push(plugin)
  }
  config.disabledPlugins = next
}
