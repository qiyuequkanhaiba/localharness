import { existsSync, readdirSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'

/** Keep active + previous user engines; delete the rest under userEnginesDir. */
export function pruneUserEngines(userEnginesDir: string, keep: Array<string | undefined>): string[] {
  if (!existsSync(userEnginesDir)) return []
  const keepSet = new Set(keep.filter((name): name is string => Boolean(name && name.length > 0)))
  const removed: string[] = []
  for (const name of readdirSync(userEnginesDir)) {
    if (keepSet.has(name)) continue
    const dir = join(userEnginesDir, name)
    try {
      if (!statSync(dir).isDirectory()) continue
      rmSync(dir, { recursive: true, force: true })
      removed.push(name)
    } catch {
      // leave a tree that cannot be deleted
    }
  }
  return removed
}
