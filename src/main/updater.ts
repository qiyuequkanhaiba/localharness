import { dialog, type BrowserWindow } from 'electron'
import { existsSync, mkdirSync, renameSync, rmSync } from 'node:fs'
import { cp } from 'node:fs/promises'
import { join } from 'node:path'
import { gt, valid } from 'semver'
import { PINNED_NODE_VERSION, PRODUCT_NAME, VERIFIED_ENGINE_VERSIONS } from '../shared/constants'
import { isAcceptedDialogButton } from '../shared/dialog-response'
import { prepareEngineTree, scratchDir } from '../engine/install'
import { bundledEngineDir, userEngineDir } from '../engine/locate'
import { fetchOfficialVersions, newestPublished, versionsNewerThan } from '../engine/registry'
import type { ResolvedEngine } from '../engine/layout'
import type { HostArch, HostPlatform } from '../engine/platform'
import type { UpdateChannel } from './config'
import type { DisabledPlugin } from './profile-plugins'
import { ProfileIncompatibleError, smokeTestEngineWithUserProfile } from './smoke'

export interface UpdateContext {
  current: ResolvedEngine
  userEnginesDir: string
  cacheDir: string
  packaged: boolean
  resourcesPath: string
  projectRoot: string
  parent?: BrowserWindow
  onAccepted?: () => Promise<void>
  userDshHome?: string
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
  | { kind: 'available'; current: string; target: string; newer: string[]; verified: boolean; latestTag?: string }

export async function inspectOfficialUpdates(
  currentVersion: string,
  channel: UpdateChannel = 'newest',
): Promise<UpdateDecision> {
  const info = await fetchOfficialVersions()
  const latestTag =
    info.latest && valid(info.latest) && info.versions.includes(info.latest) ? info.latest : undefined
  const newest = newestPublished(info.versions) ?? latestTag
  const verified = (version: string) => (VERIFIED_ENGINE_VERSIONS as readonly string[]).includes(version)

  if (channel === 'latest') {
    if (!latestTag || !gt(latestTag, currentVersion)) {
      return { kind: 'current', current: currentVersion, latest: newest }
    }
    return {
      kind: 'available',
      current: currentVersion,
      target: latestTag,
      newer: [latestTag],
      verified: verified(latestTag),
      latestTag,
    }
  }

  if (channel === 'verified') {
    const verifiedNewer = versionsNewerThan(currentVersion, [...VERIFIED_ENGINE_VERSIONS])
    const target = newestPublished(verifiedNewer)
    if (!target) {
      return { kind: 'current', current: currentVersion, latest: newest }
    }
    return {
      kind: 'available',
      current: currentVersion,
      target,
      newer: verifiedNewer,
      verified: true,
      latestTag,
    }
  }

  const newer = versionsNewerThan(currentVersion, info.versions)
  if (newer.length === 0) {
    return { kind: 'current', current: currentVersion, latest: newest }
  }
  const target = newestPublished(newer) ?? newer[0]
  return {
    kind: 'available',
    current: currentVersion,
    target,
    newer,
    verified: verified(target),
    latestTag,
  }
}

export interface InstalledUpdate {
  dest: string
  disabledPlugins: DisabledPlugin[]
}

export async function confirmAndInstallUpdate(
  ctx: UpdateContext,
  decision: Extract<UpdateDecision, { kind: 'available' }>,
  log: { info(message: string): void; output?(text: string): void },
  signal?: AbortSignal,
): Promise<InstalledUpdate | undefined> {
  const warning = decision.verified
    ? 'LocalHarness 已验证此官方版本。'
    : 'LocalHarness 尚未验证此官方版本。仍可安装；失败可用「回滚 Harness 引擎」回到上一版。'

  const choice = await showAppMessageBox(ctx.parent, {
    type: 'question',
    buttons: ['安装', '取消'],
    defaultId: 0,
    cancelId: 1,
    title: `${PRODUCT_NAME} — 官方引擎更新`,
    message: `安装官方 ${decision.target}？`,
    detail: [
      `当前引擎: ${decision.current}`,
      `将安装: ${decision.target}`,
      decision.latestTag && decision.latestTag !== decision.target
        ? `npm latest 标签仍是 ${decision.latestTag}`
        : '',
      warning,
      '若 ~/.dsh 里的插件无法随新引擎启动，会自动关掉该插件（安装包保留）。若引擎本身起不来，会回滚。',
      '',
      '安装包来自 npm。LocalHarness 不修改官方界面或宿主代码。',
    ]
      .filter((line) => line.length > 0)
      .join('\n'),
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
    let disabledPlugins: DisabledPlugin[] = []
    try {
      const smoked = await smokeTestEngineWithUserProfile(tmp, ctx.userDshHome, log)
      disabledPlugins = smoked.disabledPlugins
    } catch (error) {
      if (!(error instanceof ProfileIncompatibleError)) throw error
      log.info(error.hint)
      const proceed = await showAppMessageBox(ctx.parent, {
        type: 'warning',
        buttons: ['仍然安装', '取消'],
        defaultId: 1,
        cancelId: 1,
        title: `${PRODUCT_NAME} — 配置插件`,
        message: `官方 ${decision.target} 可以启动，但有 ~/.dsh 插件无法自动跳过。`,
        detail: [
          error.hint,
          '',
          '无法自动关闭该插件。请先在 ~/.dsh/profiles/web 更新或卸载，然后再试。',
          '选择「仍然安装」会在插件仍启用的情况下切换引擎；若还是起不来会回滚。',
          '',
          error.message.slice(-1500),
        ].join('\n'),
      })
      if (!isAcceptedDialogButton(proceed.response, 0)) {
        throw new Error('install cancelled')
      }
      log.info('Continuing install despite incompatible ~/.dsh plugins')
    }
    rmSync(dest, { recursive: true, force: true })
    mkdirSync(ctx.userEnginesDir, { recursive: true })
    try {
      renameSync(tmp, dest)
    } catch {
      await cp(tmp, dest, { recursive: true })
      rmSync(tmp, { recursive: true, force: true })
    }
    return { dest, disabledPlugins }
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
