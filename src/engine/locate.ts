import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { PINNED_ENGINE_VERSION } from '../shared/constants'
import { resolveEngineFromRoot, type ResolvedEngine, validateEngineRoot } from './layout'
import { engineFolderName } from './platform'

export interface EngineLocateOptions {
  packaged: boolean
  resourcesPath: string
  projectRoot: string
  userEnginesDir: string
  activeVersion?: string
  envDir?: string
}

export function bundledEngineDir(options: Pick<EngineLocateOptions, 'packaged' | 'resourcesPath' | 'projectRoot'>): string {
  if (options.packaged) {
    return join(options.resourcesPath, 'engine')
  }
  return join(options.projectRoot, 'engine', engineFolderName())
}

export function userEngineDir(userEnginesDir: string, version: string): string {
  return join(userEnginesDir, version)
}

export function locateEngine(options: EngineLocateOptions): ResolvedEngine {
  const envDir = options.envDir?.trim()
  if (envDir) {
    return resolveEngineFromRoot(envDir, 'env')
  }

  if (options.activeVersion) {
    const userDir = userEngineDir(options.userEnginesDir, options.activeVersion)
    if (existsSync(userDir)) {
      return resolveEngineFromRoot(userDir, 'user')
    }
  }

  const bundled = bundledEngineDir(options)
  return resolveEngineFromRoot(bundled, 'bundled')
}

export function describeMissingEngine(options: EngineLocateOptions): string {
  const bundled = bundledEngineDir(options)
  const bundledError = validateEngineRoot(bundled)
  if (options.activeVersion) {
    const userDir = userEngineDir(options.userEnginesDir, options.activeVersion)
    const userError = validateEngineRoot(userDir)
    return [
      `Active engine ${options.activeVersion} is not usable (${userError}).`,
      `Bundled engine is not usable (${bundledError}).`,
      'Run `npm run prepare-engine` in the LocalHarness checkout, or use LocalHarness → Rollback Harness Engine.',
    ].join('\n')
  }
  return [
    `Bundled official engine is missing or incomplete (${bundledError}).`,
    `Expected ${PINNED_ENGINE_VERSION} at ${bundled}.`,
    'From a LocalHarness checkout run: npm run prepare-engine',
  ].join('\n')
}
