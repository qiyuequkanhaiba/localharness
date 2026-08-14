import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { PINNED_ENGINE_VERSION, PINNED_NODE_VERSION } from '../src/shared/constants'
import { prepareEngineTree } from '../src/engine/install'
import { validateEngineRoot } from '../src/engine/layout'
import { engineFolderName, type HostArch, type HostPlatform } from '../src/engine/platform'

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  if (index === -1) return undefined
  return process.argv[index + 1]
}

function hasFlag(name: string): boolean {
  return process.argv.includes(name)
}

async function main(): Promise<void> {
  const platform = (arg('--platform') ?? process.platform) as HostPlatform
  const arch = (arg('--arch') ?? process.arch) as HostArch
  const engineVersion = arg('--engine') ?? PINNED_ENGINE_VERSION
  const nodeVersion = arg('--node') ?? PINNED_NODE_VERSION
  const projectRoot = resolve(__dirname, '..')
  const dest = arg('--out') ?? join(projectRoot, 'engine', engineFolderName(platform, arch))
  const cacheDir = join(projectRoot, 'engine', '.cache')

  if (platform !== process.platform || arch !== process.arch) {
    throw new Error(
      `prepare-engine must run on the target OS/arch so native addons (node-pty, koffi) match. Wanted ${platform}/${arch}, this process is ${process.platform}/${process.arch}. Use GitHub Actions or a machine of that type.`,
    )
  }

  if (hasFlag('--force') && existsSync(dest)) {
    rmSync(dest, { recursive: true, force: true })
  }

  mkdirSync(cacheDir, { recursive: true })
  const log = { info: (message: string) => console.log(message) }
  log.info(`Preparing official @deepseek-ai/dsh@${engineVersion} + Node ${nodeVersion} → ${dest}`)

  await prepareEngineTree({
    engineRoot: dest,
    engineVersion,
    nodeVersion,
    platform,
    arch,
    cacheDir,
    log,
  })

  const error = validateEngineRoot(dest, platform)
  if (error) throw new Error(error)
  log.info(`Engine ready: ${dest}`)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
