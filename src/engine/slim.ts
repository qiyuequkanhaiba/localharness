import { existsSync, readdirSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'

function rmIfExists(target: string): void {
  rmSync(target, { recursive: true, force: true })
}

/** Drop docs and other-OS native addons from a prepared official engine. */
export function slimEngineTree(engineRoot: string, platform: NodeJS.Platform, arch: string): void {
  const runtime = join(engineRoot, 'runtime')
  for (const extra of ['include', 'share', 'CHANGELOG.md', 'README.md']) {
    rmIfExists(join(runtime, extra))
  }

  const keep = `${platform}-${arch}`
  const modules = join(engineRoot, 'node_modules')
  if (!existsSync(modules)) return
  prunePrebuilds(modules, keep)
}

function prunePrebuilds(dir: string, keep: string): void {
  let entries
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }
  for (const name of entries) {
    const full = join(dir, name)
    let stat
    try {
      stat = statSync(full)
    } catch {
      continue
    }
    if (!stat.isDirectory()) continue
    if (name === 'prebuilds') {
      for (const abi of readdirSync(full)) {
        if (abi !== keep) rmIfExists(join(full, abi))
      }
      continue
    }
    prunePrebuilds(full, keep)
  }
}
