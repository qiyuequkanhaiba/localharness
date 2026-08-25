import { dialog, type BrowserWindow } from 'electron'
import { existsSync, mkdirSync, renameSync, rmSync } from 'node:fs'
import { cp } from 'node:fs/promises'
import { join } from 'node:path'
import { PINNED_NODE_VERSION, PRODUCT_NAME, VERIFIED_ENGINE_VERSIONS } from '../shared/constants'
import { isAcceptedDialogButton } from '../shared/dialog-response'
import { prepareEngineTree, scratchDir } from '../engine/install'
import { bundledEngineDir, userEngineDir } from '../engine/locate'
import { fetchOfficialVersions, newestPublished, versionsNewerThan } from '../engine/registry'
import type { ResolvedEngine } from '../engine/layout'
import type { HostArch, HostPlatform } from '../engine/platform'
import { smokeTestEngine } from './smoke'

export interface UpdateContext {
  current: ResolvedEngine
  userEnginesDir: string
  cacheDir: string
  packaged: boolean
  resourcesPath: string
  projectRoot: string
  parent?: BrowserWindow
  onAccepted?: () => Promise<void>
}

export function showAppMessageBox(
  parent: BrowserWindow | undefined,
  options: Electron.MessageBoxOptions,
): Promise<Electron.MessageBoxReturnValue> {
  const box = { noLink: true, ...options }
  if (parent && !parent.isDestroyed()) {
    return dialog.showMessageBox(parent, box)
  }
  return dialog.showMessageBox(box)
}

export type UpdateDecision =
  | { kind: 'current'; current: string; latest?: string }
  | { kind: 'available'; current: string; target: string; newer: string[]; verified: boolean }

export async function inspectOfficialUpdates(currentVersion: string): Promise<UpdateDecision> {
  const info = await fetchOfficialVersions()
  const newer = versionsNewerThan(currentVersion, info.versions)
  const latest = newestPublished(info.versions) ?? info.latest
  if (newer.length === 0) {
    return { kind: 'current', current: currentVersion, latest }
  }
  const target = newestPublished(newer) ?? newer[0]
  return {
    kind: 'available',
    current: currentVersion,
    target,
    newer,
    verified: (VERIFIED_ENGINE_VERSIONS as readonly string[]).includes(target),
  }
}

export async function confirmAndInstallUpdate(
  ctx: UpdateContext,
  decision: Extract<UpdateDecision, { kind: 'available' }>,
  log: { info(message: string): void; output?(text: string): void },
  signal?: AbortSignal,
): Promise<string | undefined> {
  const warning = decision.verified
    ? 'LocalHarness has verified this official version.'
    : 'LocalHarness has not verified this official version yet. You can still install it, and Rollback will return to the previous engine if it fails.'

  const choice = await showAppMessageBox(ctx.parent, {
    type: 'question',
    buttons: ['Install', 'Cancel'],
    defaultId: 0,
    cancelId: 1,
    title: `${PRODUCT_NAME} — official engine update`,
    message: `Install official ${decision.target}?`,
    detail: [
      `Current engine: ${decision.current}`,
      `Newest published @deepseek-ai/dsh: ${decision.target}`,
      warning,
      '',
      'The installer is downloaded from the npm registry. LocalHarness does not modify official UI or host code.',
    ].join('\n'),
  })
  log.info(`Update dialog response=${choice.response}`)
  if (!isAcceptedDialogButton(choice.response, 0)) return undefined
  if (ctx.onAccepted) await ctx.onAccepted()

  const dest = userEngineDir(ctx.userEnginesDir, decision.target)
  const tmp = scratchDir('localharness-engine')
  try {
    log.info(`正在安装官方引擎 ${decision.target}…`)
    await prepareEngineTree({
      engineRoot: tmp,
      engineVersion: decision.target,
      nodeVersion: ctx.current.manifest?.nodeVersion ?? PINNED_NODE_VERSION,
      platform: process.platform as HostPlatform,
      arch: process.arch as HostArch,
      cacheDir: ctx.cacheDir,
      runtimeSourceDir: ctx.current.runtimeDir,
      log,
      signal,
    })
    if (signal?.aborted) throw new Error('install cancelled')
    log.info(`正在冒烟测试官方 ${decision.target}…`)
    await smokeTestEngine(tmp)
    rmSync(dest, { recursive: true, force: true })
    mkdirSync(ctx.userEnginesDir, { recursive: true })
    try {
      renameSync(tmp, dest)
    } catch {
      await cp(tmp, dest, { recursive: true })
      rmSync(tmp, { recursive: true, force: true })
    }
    return dest
  } catch (error) {
    rmSync(tmp, { recursive: true, force: true })
    throw error
  }
}

export function rollbackTarget(
  previousVersion: string | undefined,
  ctx: Pick<UpdateContext, 'packaged' | 'resourcesPath' | 'projectRoot' | 'userEnginesDir'>,
): { version: string | undefined; dir: string } | undefined {
  if (previousVersion) {
    const dir = userEngineDir(ctx.userEnginesDir, previousVersion)
    if (existsSync(dir)) return { version: previousVersion, dir }
  }
  const bundled = bundledEngineDir(ctx)
  if (existsSync(join(bundled, 'node_modules'))) {
    return { version: undefined, dir: bundled }
  }
  return undefined
}
