import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ENGINE_SMOKE_TIMEOUT_MS } from '../shared/constants'
import { resolveEngineFromRoot } from '../engine/layout'
import { EngineLog } from './logs'
import { startEngine, stopEngine } from './session'

const WEB_PROFILE_FILES = [
  'package.json',
  'cordis.yml',
  'cordis.patch.yml',
  'pnpm-workspace.yaml',
  'pnpm-lock.yaml',
] as const

function linkOrCopyDir(from: string, to: string): void {
  if (!existsSync(from) || existsSync(to)) return
  try {
    symlinkSync(from, to, process.platform === 'win32' ? 'junction' : 'dir')
  } catch {
    cpSync(from, to, { recursive: true })
  }
}

/** Copy the user's web profile into a throwaway DSH_HOME without touching the live home. */
export function seedSmokeHome(tempHome: string, userHome: string): void {
  const webSrc = join(userHome, 'profiles', 'web')
  if (!existsSync(join(webSrc, 'package.json'))) return
  const webDest = join(tempHome, 'profiles', 'web')
  mkdirSync(webDest, { recursive: true })
  for (const name of WEB_PROFILE_FILES) {
    const from = join(webSrc, name)
    if (existsSync(from)) copyFileSync(from, join(webDest, name))
  }
  linkOrCopyDir(join(webSrc, 'node_modules'), join(webDest, 'node_modules'))
  linkOrCopyDir(join(userHome, 'profiles', 'node_modules'), join(tempHome, 'profiles', 'node_modules'))
  const homePatch = join(userHome, 'cordis.patch.yml')
  if (existsSync(homePatch)) copyFileSync(homePatch, join(tempHome, 'cordis.patch.yml'))
}

/** Boot official `dsh web` against a throwaway DSH_HOME, then tear it down. */
export async function smokeTestEngine(engineRoot: string, userHome?: string): Promise<string> {
  const engine = resolveEngineFromRoot(engineRoot, 'user')
  const home = mkdtempSync(join(tmpdir(), 'localharness-smoke-'))
  const log = new EngineLog(join(home, 'logs'))
  log.open()
  let running
  try {
    if (userHome) seedSmokeHome(home, userHome)
    running = await startEngine({
      engine,
      cwd: home,
      log,
      extraEnv: { DSH_HOME: home },
      timeoutMs: ENGINE_SMOKE_TIMEOUT_MS,
    })
    return running.url
  } finally {
    if (running) await stopEngine(running, log)
    log.close()
    rmSync(home, { recursive: true, force: true })
  }
}
