import { homedir } from 'node:os'
import { join } from 'node:path'

export type HostPlatform = 'darwin' | 'win32' | 'linux'
export type HostArch = 'arm64' | 'x64'

/** electron-builder `${os}` values used for engine folder names. */
export type BuilderOs = 'mac' | 'win' | 'linux'

export function builderOs(platform: NodeJS.Platform = process.platform): BuilderOs {
  if (platform === 'darwin') return 'mac'
  if (platform === 'win32') return 'win'
  return 'linux'
}

export function engineFolderName(
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
): string {
  return `${builderOs(platform)}-${arch}`
}

export function defaultDshHome(): string {
  return join(homedir(), '.dsh')
}

export function nodeBinaryName(platform: NodeJS.Platform = process.platform): string {
  return platform === 'win32' ? 'node.exe' : 'node'
}

export function nodeDistArchive(
  nodeVersion: string,
  platform: NodeJS.Platform,
  arch: string,
): { fileName: string; stripComponents: number } {
  const versionTag = nodeVersion.startsWith('v') ? nodeVersion : `v${nodeVersion}`
  if (platform === 'win32') {
    const winArch = arch === 'arm64' ? 'arm64' : 'x64'
    return { fileName: `node-${versionTag}-win-${winArch}.zip`, stripComponents: 1 }
  }
  const os = platform === 'darwin' ? 'darwin' : 'linux'
  return { fileName: `node-${versionTag}-${os}-${arch}.tar.gz`, stripComponents: 1 }
}
