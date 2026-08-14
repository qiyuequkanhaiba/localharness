import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

async function childPids(pid: number): Promise<number[]> {
  try {
    const { stdout } = await execFileAsync('pgrep', ['-P', String(pid)], { windowsHide: true })
    return stdout
      .split(/\s+/)
      .map((part) => Number(part.trim()))
      .filter((value) => Number.isInteger(value) && value > 0)
  } catch {
    return []
  }
}

async function collectTree(pid: number, seen = new Set<number>()): Promise<number[]> {
  if (seen.has(pid)) return []
  seen.add(pid)
  const children = await childPids(pid)
  const nested = await Promise.all(children.map((child) => collectTree(child, seen)))
  return [...children, ...nested.flat()]
}

function tryKill(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(pid, signal)
  } catch {
    // already gone
  }
}

/** Stop a spawned official engine and anything it forked. */
export async function killProcessTree(pid: number, timeoutMs: number): Promise<void> {
  if (process.platform === 'win32') {
    try {
      await execFileAsync('taskkill', ['/Pid', String(pid), '/T', '/F'], { windowsHide: true })
    } catch {
      // process may already have exited
    }
    return
  }

  const descendants = await collectTree(pid)
  const all = [...descendants.reverse(), pid]
  for (const target of all) tryKill(target, 'SIGTERM')

  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const alive = all.filter((target) => {
      try {
        process.kill(target, 0)
        return true
      } catch {
        return false
      }
    })
    if (alive.length === 0) return
    await new Promise((resolve) => setTimeout(resolve, 150))
  }

  for (const target of all) tryKill(target, 'SIGKILL')
}
