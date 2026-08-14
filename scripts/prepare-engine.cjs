const { existsSync, mkdirSync, rmSync } = require('node:fs')
const { join, resolve } = require('node:path')
const { PINNED_ENGINE_VERSION, PINNED_NODE_VERSION } = require('../out/shared/constants')
const { prepareEngineTree } = require('../out/engine/install')
const { validateEngineRoot } = require('../out/engine/layout')
const { engineFolderName } = require('../out/engine/platform')

function arg(name) {
  const index = process.argv.indexOf(name)
  if (index === -1) return undefined
  return process.argv[index + 1]
}

function hasFlag(name) {
  return process.argv.includes(name)
}

async function main() {
  const platform = arg('--platform') ?? process.platform
  const arch = arg('--arch') ?? process.arch
  const engineVersion = arg('--engine') ?? PINNED_ENGINE_VERSION
  const nodeVersion = arg('--node') ?? PINNED_NODE_VERSION
  const projectRoot = resolve(__dirname, '..')
  const dest = arg('--out') ?? join(projectRoot, 'engine', engineFolderName(platform, arch))
  const cacheDir = join(projectRoot, 'engine', '.cache')

  if (platform !== process.platform || arch !== process.arch) {
    throw new Error(
      `prepare-engine must run on the target OS/arch so native addons (node-pty, koffi) match. Wanted ${platform}/${arch}, this process is ${process.platform}/${process.arch}.`,
    )
  }

  if (hasFlag('--force') && existsSync(dest)) {
    rmSync(dest, { recursive: true, force: true })
  }

  mkdirSync(cacheDir, { recursive: true })
  const log = { info: (message) => console.log(message) }
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

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
