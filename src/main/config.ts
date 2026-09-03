import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

export interface WindowBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface ShellConfig {
  activeEngineVersion?: string
  previousEngineVersion?: string
  windowBounds?: WindowBounds
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

export function defaultWorkspaceCwd(): string {
  return homedir()
}
