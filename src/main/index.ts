import { app, dialog, ipcMain, shell } from 'electron'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { APP_ID, PINNED_ENGINE_VERSION, PRODUCT_NAME, VERIFIED_ENGINE_VERSIONS } from '../shared/constants'
import { locateEngine, describeMissingEngine } from '../engine/locate'
import { defaultDshHome } from '../engine/platform'
import {
  defaultWorkspaceCwd,
  loadConfig,
  normalizeUpdateChannel,
  rememberDisabledPlugins,
  restoreActiveEngine,
  saveConfig,
  type ShellConfig,
  type UpdateChannel,
} from './config'
import { EngineLog } from './logs'
import { installApplicationMenu, type MenuHandlers } from './menu'
import { pruneUserEngines } from './prune-engines'
import { startEngine, stopEngine, type RunningEngine } from './session'
import { inspectShellUpdates } from './shell-update'
import { isAcceptedDialogButton } from '../shared/dialog-response'
import { applyLivePluginDisables } from './profile-plugins'
import { confirmAndInstallUpdate, inspectOfficialUpdates, rollbackTarget, showAppMessageBox } from './updater'
import {
  appendSplashLog,
  attachHostWindow,
  closeFindBar,
  createMainWindow,
  findInParent,
  isEnginePage,
  openFindBar,
  reloadEngineUi,
  setSplashStatus,
  showError,
  showSplash,
} from './window'

app.setName(PRODUCT_NAME)
app.setAppUserModelId(APP_ID)

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
}

let mainWindow: Electron.BrowserWindow | undefined
let running: RunningEngine | undefined
let starting = false
let updating = false
let quitting = false
let updateAbort: AbortController | undefined
let config: ShellConfig = {}
let log!: EngineLog

function liveWindow(): Electron.BrowserWindow | undefined {
  return mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined
}

function updateLog(message: string): void {
  log.write('update', message)
  const win = liveWindow()
  if (!win) return
  void setSplashStatus(win, message)
  appendSplashLog(win, message)
}

function npmProgress(text: string): void {
  const win = liveWindow()
  if (win) appendSplashLog(win, text)
}

function busyMessage(): string {
  if (updating) return '正在安装官方引擎更新，请稍候。'
  return '正在启动官方引擎，请稍候。'
}

const projectRoot = join(__dirname, '../..')

function locateOptions() {
  return {
    packaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    projectRoot,
    userEnginesDir: join(app.getPath('userData'), 'engines'),
    activeVersion: config.activeEngineVersion,
    envDir: process.env.LOCALHARNESS_ENGINE_DIR,
  }
}

function persistConfig(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    config.windowBounds = mainWindow.getBounds()
  }
  saveConfig(app.getPath('userData'), config)
}

function refreshMenu(): void {
  installApplicationMenu(() => mainWindow, menuHandlers, () => ({
    updateChannel: normalizeUpdateChannel(config.updateChannel),
    workspaceCwd: defaultWorkspaceCwd(config),
  }))
}

async function bootEngine(status: string, options?: { showError?: boolean }): Promise<boolean> {
  if (starting) return Boolean(running)
  starting = true
  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      await showSplash(mainWindow, status)
    }
    await stopEngine(running, log)
    running = undefined

    let engine
    try {
      engine = locateEngine(locateOptions())
    } catch {
      throw new Error(describeMissingEngine(locateOptions()))
    }

    if (mainWindow && !mainWindow.isDestroyed()) {
      await showSplash(mainWindow, `正在启动官方 Harness ${engine.version}…`)
    }

    running = await startEngine({
      engine,
      cwd: defaultWorkspaceCwd(config),
      log,
      onUnexpectedExit: (detail) => {
        running = undefined
        const win = liveWindow()
        if (!win || quitting) return
        log.write('error', `官方引擎意外退出: ${detail}`)
        void showError(win, `官方引擎已退出。\n${detail}`)
      },
    })

    if (mainWindow && !mainWindow.isDestroyed()) {
      await mainWindow.loadURL(running.url)
    }
    return true
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    log.write('error', message)
    if (options?.showError !== false && mainWindow && !mainWindow.isDestroyed()) {
      await showError(mainWindow, message)
    }
    return false
  } finally {
    starting = false
  }
}

function showAbout(): void {
  const engine = running?.engine
  const verified = engine && (VERIFIED_ENGINE_VERSIONS as readonly string[]).includes(engine.version)
  const disabled =
    config.disabledPlugins && config.disabledPlugins.length > 0
      ? config.disabledPlugins.map((plugin) => plugin.packageName).join(', ')
      : '无'
  void showAppMessageBox(liveWindow(), {
    type: 'info',
    title: `关于 ${PRODUCT_NAME}`,
    message: PRODUCT_NAME,
    detail: [
      `${PRODUCT_NAME} ${app.getVersion()}`,
      `官方引擎: ${engine?.version ?? '未运行'} (${engine?.source ?? '—'})`,
      `安装包钉死版本: ${PINNED_ENGINE_VERSION}`,
      `本壳已验证: ${verified ? '是' : '否'}`,
      `更新通道: ${normalizeUpdateChannel(config.updateChannel)}`,
      `Node 运行时: ${engine?.manifest?.nodeVersion ?? '随引擎捆绑'}`,
      '',
      `工作区: ${defaultWorkspaceCwd(config)}`,
      `Harness 用户数据: ${defaultDshHome()}`,
      `壳数据: ${app.getPath('userData')}`,
      `已关闭的插件: ${disabled}`,
      '',
      '检查更新、回滚、重启引擎：菜单栏「LocalHarness」。',
      '这些操作不在官方网页界面里。',
      '',
      'LocalHarness 是官方 @deepseek-ai/dsh 的独立窗口，并非 DeepSeek 出品。',
    ].join('\n'),
  })
}

async function checkForUpdates(): Promise<void> {
  if (updating || starting) {
    await showAppMessageBox(liveWindow(), { type: 'info', message: busyMessage() })
    return
  }
  if (!running) {
    await showAppMessageBox(liveWindow(), {
      type: 'info',
      message: '请先启动引擎，再检查更新。',
    })
    return
  }
  updating = true
  updateAbort = new AbortController()
  const engineUrl = running.url
  let restorePlugins: { restore(): void } | undefined
  try {
    log.write('update', `Checking npm for versions newer than ${running.engine.version}`)
    const decision = await inspectOfficialUpdates(
      running.engine.version,
      normalizeUpdateChannel(config.updateChannel),
    )
    if (decision.kind === 'current') {
      log.write('update', `Already on ${decision.current}`)
      await showAppMessageBox(liveWindow(), {
        type: 'info',
        message: `已是当前通道上最新的官方引擎（${decision.current}）。`,
        detail: 'LocalHarness 不会自动升级。需要时再从菜单检查。',
      })
      return
    }
    log.write('update', `Official ${decision.target} available (current ${decision.current})`)
    const installed = await confirmAndInstallUpdate(
      {
        current: running.engine,
        userEnginesDir: join(app.getPath('userData'), 'engines'),
        cacheDir: join(app.getPath('userData'), 'cache'),
        packaged: app.isPackaged,
        resourcesPath: process.resourcesPath,
        projectRoot,
        parent: liveWindow(),
        onAccepted: async () => {
          const win = liveWindow()
          if (win) await showSplash(win, `正在安装官方引擎 ${decision.target}…`)
        },
        userDshHome: defaultDshHome(),
      },
      decision,
      { info: updateLog, output: npmProgress },
      updateAbort.signal,
    )
    if (!installed) {
      log.write('update', 'Install cancelled')
      return
    }
    const disableIds = [...new Set(installed.disabledPlugins.flatMap((plugin) => plugin.entryIds))]
    restorePlugins =
      disableIds.length > 0 ? applyLivePluginDisables(defaultDshHome(), disableIds) : undefined
    if (installed.disabledPlugins.length > 0) {
      rememberDisabledPlugins(
        config,
        installed.disabledPlugins.map((plugin) => ({
          ...plugin,
          engineVersion: decision.target,
          at: new Date().toISOString(),
        })),
      )
      log.write(
        'update',
        `Turned off incompatible plugins: ${installed.disabledPlugins.map((plugin) => plugin.packageName).join(', ')}`,
      )
    }
    const previousActive = config.activeEngineVersion
    config.previousEngineVersion = previousActive ?? running.engine.version
    config.activeEngineVersion = decision.target
    persistConfig()
    log.write('update', `Switching active engine to ${decision.target}`)
    updating = false
    const started = await bootEngine(`正在重启到官方 ${decision.target}…`, { showError: false })
    if (started) {
      restorePlugins = undefined
      const removed = pruneUserEngines(join(app.getPath('userData'), 'engines'), [
        config.activeEngineVersion,
        config.previousEngineVersion,
      ])
      if (removed.length > 0) log.write('update', `Pruned old engines: ${removed.join(', ')}`)
      if (installed.disabledPlugins.length > 0 && !quitting) {
        await showAppMessageBox(liveWindow(), {
          type: 'info',
          title: `${PRODUCT_NAME} — 已关闭插件`,
          message: `官方 ${decision.target} 正在运行。`,
          detail: [
            '这些插件无法随新引擎启动，已关闭。安装包仍保留：',
            ...installed.disabledPlugins.map((plugin) => `• ${plugin.packageName}`),
            '',
            '更新插件后，可在官方插件设置里重新打开，或在那里卸载。',
          ].join('\n'),
        })
      }
      return
    }
    log.write('update', `Official ${decision.target} failed to start; rolling back`)
    restorePlugins?.restore()
    restoreActiveEngine(config, previousActive, decision.target)
    persistConfig()
    const rolledBack = await bootEngine('升级后无法启动，正在回滚…')
    if (!quitting) {
      await showAppMessageBox(liveWindow(), {
        type: 'error',
        message: `官方 ${decision.target} 无法启动`,
        detail: rolledBack
          ? `已回滚到 ${previousActive ?? running?.engine.version ?? `安装包钉死版本（${PINNED_ENGINE_VERSION}）`}。`
          : `回滚也失败了。请用 LocalHarness → 回滚 Harness 引擎。\n钉死版本是 ${PINNED_ENGINE_VERSION}。`,
      })
    }
  } catch (error) {
    restorePlugins?.restore()
    const message = error instanceof Error ? error.message : String(error)
    log.write('update', message)
    if (!quitting && !/install cancelled/.test(message)) {
      await showAppMessageBox(liveWindow(), {
        type: 'error',
        message: '无法更新官方引擎',
        detail: message,
      })
    }
    const win = liveWindow()
    if (!quitting && win && engineUrl) {
      await win.loadURL(engineUrl)
    }
  } finally {
    updating = false
    updateAbort = undefined
  }
}

async function rollbackEngine(): Promise<void> {
  if (updating || starting) {
    await showAppMessageBox(liveWindow(), { type: 'info', message: busyMessage() })
    return
  }
  const target = rollbackTarget(config.previousEngineVersion, {
    packaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    projectRoot,
    userEnginesDir: join(app.getPath('userData'), 'engines'),
  })
  if (!target) {
    await showAppMessageBox(liveWindow(), {
      type: 'info',
      message: '没有可回滚的上一版引擎。',
      detail: `安装包钉死版本是 ${PINNED_ENGINE_VERSION}。`,
    })
    return
  }
  const choice = await showAppMessageBox(liveWindow(), {
    type: 'question',
    buttons: ['回滚', '取消'],
    defaultId: 0,
    cancelId: 1,
    message: target.version
      ? `回滚到官方 ${target.version}？`
      : `回滚到安装包钉死的引擎（${PINNED_ENGINE_VERSION}）？`,
  })
  if (!isAcceptedDialogButton(choice.response, 0)) return
  config.previousEngineVersion = config.activeEngineVersion
  config.activeEngineVersion = target.version
  persistConfig()
  await bootEngine('正在回滚官方引擎…')
}

async function checkShellUpdates(): Promise<void> {
  try {
    const decision = await inspectShellUpdates(app.getVersion())
    if (decision.kind === 'current') {
      await showAppMessageBox(liveWindow(), {
        type: 'info',
        message: `LocalHarness 已是最新（${decision.current}）。`,
      })
      return
    }
    const choice = await showAppMessageBox(liveWindow(), {
      type: 'question',
      buttons: ['打开下载页', '取消'],
      defaultId: 0,
      cancelId: 1,
      message: `发现 LocalHarness ${decision.latest}`,
      detail: `当前是 ${decision.current}。壳更新需要安装新的安装包，不会自动替换。`,
    })
    if (isAcceptedDialogButton(choice.response, 0)) {
      await shell.openExternal(decision.url)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await showAppMessageBox(liveWindow(), {
      type: 'error',
      message: '无法检查 LocalHarness 更新',
      detail: message,
    })
  }
}

async function chooseWorkspace(): Promise<void> {
  const choice = await dialog.showOpenDialog(liveWindow() ?? createWindow(), {
    title: '选择工作区',
    defaultPath: defaultWorkspaceCwd(config),
    properties: ['openDirectory', 'createDirectory'],
  })
  if (choice.canceled || choice.filePaths.length === 0) return
  config.workspaceCwd = choice.filePaths[0]
  persistConfig()
  refreshMenu()
  await bootEngine('正在用新的工作区重启引擎…')
}

function setUpdateChannel(channel: UpdateChannel): void {
  config.updateChannel = channel
  persistConfig()
  refreshMenu()
}

function openLogs(): void {
  void shell.openPath(log.directory)
}

const menuHandlers: MenuHandlers = {
  checkForUpdates: () => void checkForUpdates(),
  checkShellUpdates: () => void checkShellUpdates(),
  rollbackEngine: () => void rollbackEngine(),
  restartEngine: () => {
    if (updating) {
      void showAppMessageBox(liveWindow(), { type: 'info', message: busyMessage() })
      return
    }
    void bootEngine('正在重启官方 Harness…')
  },
  showAbout,
  openLogs,
  chooseWorkspace: () => void chooseWorkspace(),
  setUpdateChannel,
  findInPage: () => {
    const win = liveWindow()
    if (win) openFindBar(win)
  },
  reloadUi: () => {
    const win = liveWindow()
    if (win) reloadEngineUi(win, running?.url)
  },
}

function createWindow(): Electron.BrowserWindow {
  mainWindow = createMainWindow(config.windowBounds)
  attachHostWindow(mainWindow, {
    getEngineUrl: () => running?.url,
    onShellAction: (action) => {
      if (action === 'restart') menuHandlers.restartEngine()
      if (action === 'rollback') void rollbackEngine()
      if (action === 'logs') openLogs()
    },
  })
  mainWindow.on('close', () => {
    persistConfig()
  })
  mainWindow.on('closed', () => {
    closeFindBar()
    mainWindow = undefined
  })
  return mainWindow
}

if (gotLock) {
  app.on('web-contents-created', (_event, contents) => {
    contents.setBackgroundThrottling(false)
  })

  app.on('second-instance', () => {
    if (!mainWindow) {
      const win = createWindow()
      if (running) {
        void win.loadURL(running.url)
      } else {
        void bootEngine('正在启动官方 Harness…')
      }
      return
    }
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  })

  ipcMain.on('find-query', (_event, text: unknown, forward: unknown) => {
    const win = liveWindow()
    if (!win) return
    findInParent(win, typeof text === 'string' ? text : '', forward !== false)
  })
  ipcMain.on('find-close', () => {
    closeFindBar()
  })

  app.whenReady().then(async () => {
    log = new EngineLog(join(app.getPath('userData'), 'logs'))
    log.open()
    config = loadConfig(app.getPath('userData'))
    config.updateChannel = normalizeUpdateChannel(config.updateChannel)
    if (!config.workspaceCwd) config.workspaceCwd = homedir()
    createWindow()
    refreshMenu()
    await bootEngine('正在启动官方 Harness…')
  })

  app.on('activate', () => {
    if (!mainWindow) {
      const win = createWindow()
      if (running) {
        void win.loadURL(running.url)
      } else {
        void bootEngine('正在启动官方 Harness…')
      }
      return
    }
    mainWindow.show()
    if (running && !isEnginePage(mainWindow)) {
      void mainWindow.loadURL(running.url)
    }
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })

  app.on('before-quit', async (event) => {
    if (quitting) return
    if (updating) updateAbort?.abort()
    if (!running && !starting && !updating) {
      log.close()
      return
    }
    event.preventDefault()
    quitting = true
    persistConfig()
    const deadline = Date.now() + 15_000
    while ((starting || updating) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    await stopEngine(running, log)
    running = undefined
    log.close()
    app.quit()
  })
}
