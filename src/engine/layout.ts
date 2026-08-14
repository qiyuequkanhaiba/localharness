import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { OFFICIAL_PACKAGE } from '../shared/constants'
import { nodeBinaryName } from './platform'

export interface EngineManifest {
  engineVersion: string
  nodeVersion: string
  packageName: string
  platform: string
  arch: string
  preparedAt: string
}

export interface ResolvedEngine {
  root: string
  nodePath: string
  dshBinPath: string
  runtimeDir: string
  version: string
  source: 'bundled' | 'user' | 'env'
  manifest?: EngineManifest
}

export function runtimeDir(root: string): string {
  return join(root, 'runtime')
}

export function nodePathFor(root: string, platform: NodeJS.Platform = process.platform): string {
  const binary = nodeBinaryName(platform)
  if (platform === 'win32') {
    return join(root, 'runtime', binary)
  }
  return join(root, 'runtime', 'bin', binary)
}

export function npmCliPath(root: string, platform: NodeJS.Platform = process.platform): string {
  if (platform === 'win32') {
    return join(root, 'runtime', 'node_modules', 'npm', 'bin', 'npm-cli.js')
  }
  return join(root, 'runtime', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js')
}

export function dshBinPath(root: string): string {
  return join(root, 'node_modules', OFFICIAL_PACKAGE, 'lib', 'bin.js')
}

export function dshPackageJsonPath(root: string): string {
  return join(root, 'node_modules', OFFICIAL_PACKAGE, 'package.json')
}

export function manifestPath(root: string): string {
  return join(root, 'manifest.json')
}

export function readManifest(root: string): EngineManifest | undefined {
  const file = manifestPath(root)
  if (!existsSync(file)) return undefined
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as EngineManifest
  } catch {
    return undefined
  }
}

export function readInstalledEngineVersion(root: string): string | undefined {
  const file = dshPackageJsonPath(root)
  if (!existsSync(file)) return undefined
  try {
    const pkg = JSON.parse(readFileSync(file, 'utf8')) as { version?: string }
    return typeof pkg.version === 'string' ? pkg.version : undefined
  } catch {
    return undefined
  }
}

export function validateEngineRoot(root: string, platform: NodeJS.Platform = process.platform): string | undefined {
  if (!existsSync(root)) return `engine directory does not exist: ${root}`
  const node = nodePathFor(root, platform)
  if (!existsSync(node)) return `bundled Node is missing: ${node}`
  const dsh = dshBinPath(root)
  if (!existsSync(dsh)) return `official ${OFFICIAL_PACKAGE} bin is missing: ${dsh}`
  return undefined
}

export function resolveEngineFromRoot(
  root: string,
  source: ResolvedEngine['source'],
  platform: NodeJS.Platform = process.platform,
): ResolvedEngine {
  const error = validateEngineRoot(root, platform)
  if (error) throw new Error(error)
  const manifest = readManifest(root)
  const version = readInstalledEngineVersion(root) ?? manifest?.engineVersion ?? 'unknown'
  return {
    root,
    nodePath: nodePathFor(root, platform),
    dshBinPath: dshBinPath(root),
    runtimeDir: runtimeDir(root),
    version,
    source,
    manifest,
  }
}
