import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ENGINE_SMOKE_TIMEOUT_MS } from '../shared/constants'
import { resolveEngineFromRoot } from '../engine/layout'
import { EngineLog } from './logs'
import { startEngine, stopEngine } from './session'

/** Boot official `dsh web` against a throwaway DSH_HOME, then tear it down. */
export async function smokeTestEngine(engineRoot: string): Promise<string> {
  const engine = resolveEngineFromRoot(engineRoot, 'user')
  const home = mkdtempSync(join(tmpdir(), 'localharness-smoke-'))
  const log = new EngineLog(join(home, 'logs'))
  log.open()
  let running
  try {
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
