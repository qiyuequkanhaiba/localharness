import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ENGINE_SMOKE_TIMEOUT_MS } from '../shared/constants'
import { resolveEngineFromRoot } from '../engine/layout'
import { EngineLog } from './logs'
import {
  describeProfilePluginFailure,
  extraProfileBundles,
  extractProfilePluginPackage,
  mergeDisablePatches,
  resolvePluginEntryIds,
  type DisabledPlugin,
} from './profile-plugins'
import { startEngine, stopEngine } from './session'

export { describeProfilePluginFailure } from './profile-plugins'
export type { DisabledPlugin } from './profile-plugins'

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

async function runSmoke(engineRoot: string, home: string): Promise<string> {
  const engine = resolveEngineFromRoot(engineRoot, 'user')
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
  }
}

async function withTempHome<T>(fn: (home: string) => Promise<T>): Promise<T> {
  const home = mkdtempSync(join(tmpdir(), 'localharness-smoke-'))
  try {
    return await fn(home)
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
}

/** Boot official `dsh web` against a throwaway DSH_HOME, then tear it down. */
export async function smokeTestEngine(engineRoot: string, userHome?: string): Promise<string> {
  return withTempHome(async (home) => {
    if (userHome) seedSmokeHome(home, userHome)
    return runSmoke(engineRoot, home)
  })
}

export interface ProfileSmokeResult {
  url: string
  disabledPlugins: DisabledPlugin[]
}

/** Engine-only smoke, then a second boot with the user's web profile. */
export async function smokeTestEngineWithUserProfile(
  engineRoot: string,
  userHome: string | undefined,
  log?: { info(message: string): void },
): Promise<ProfileSmokeResult> {
  log?.info('正在冒烟测试官方引擎（干净 profile）…')
  const url = await smokeTestEngine(engineRoot)
  if (!userHome) return { url, disabledPlugins: [] }
  log?.info('正在用当前 ~/.dsh web profile 冒烟测试…')
  return withTempHome(async (home) => {
    seedSmokeHome(home, userHome)
    const web = join(home, 'profiles', 'web')
    const extra = extraProfileBundles(web)
    const disabledPlugins: DisabledPlugin[] = []
    const maxDisables = 8
    let lastError = ''
    for (let attempt = 0; attempt <= maxDisables; attempt++) {
      try {
        const smoked = await runSmoke(engineRoot, home)
        return { url: smoked, disabledPlugins }
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error)
        if (attempt === maxDisables) break
        const packageName = extractProfilePluginPackage(lastError, extra, web)
        if (!packageName || disabledPlugins.some((plugin) => plugin.packageName === packageName)) {
          throw new ProfileIncompatibleError(lastError)
        }
        const entryIds = resolvePluginEntryIds(web, packageName)
        const patchFile = join(web, 'cordis.patch.yml')
        const current = existsSync(patchFile) ? readFileSync(patchFile, 'utf8') : '[]\n'
        writeFileSync(patchFile, mergeDisablePatches(current, entryIds))
        disabledPlugins.push({ packageName, entryIds })
        log?.info(
          `已关闭不兼容插件 ${packageName}（${entryIds.join(', ')}），安装包仍保留，更新后可重新启用或卸载`,
        )
      }
    }
    throw new ProfileIncompatibleError(lastError)
  })
}

export class ProfileIncompatibleError extends Error {
  readonly hint: string

  constructor(engineError: string) {
    const hint = describeProfilePluginFailure(engineError)
    super(`${hint}\n${engineError}`)
    this.name = 'ProfileIncompatibleError'
    this.hint = hint
  }
}
