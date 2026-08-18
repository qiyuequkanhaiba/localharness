import { app, shell } from 'electron'
import { join } from 'node:path'
import { APP_ID, PINNED_ENGINE_VERSION, PRODUCT_NAME, VERIFIED_ENGINE_VERSIONS } from '../shared/constants'
import { locateEngine, describeMissingEngine } from '../engine/locate'
import { defaultDshHome } from '../engine/platform'
import { defaultWorkspaceCwd, loadConfig, saveConfig, type ShellConfig } from './config'
import { EngineLog } from './logs'
import { installApplicationMenu } from './menu'
import { startEngine, stopEngine, type RunningEngine } from './session'
import { isAcceptedDialogButton } from '../shared/dialog-response'
import { confirmAndInstallUpdate, inspectOfficialUpdates, rollbackTarget, showAppMessageBox } from './updater'
import { createMainWindow, isEnginePage, setSplashStatus, showError, showSplash } from './window'

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
let config: ShellConfig = {}
let log!: EngineLog

function liveWindow(): Electron.BrowserWindow | undefined {
  return mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined
}

function updateLog(message: string): void {
  log.write('update', message)
  const win = liveWindow()
  if (win) void setSplashStatus(win, message)
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

async function bootEngine(status: string): Promise<void> {
  if (starting) return
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
      await showSplash(mainWindow, `Starting official Harness ${engine.version}…`)
    }

    running = await startEngine({
      engine,
      cwd: defaultWorkspaceCwd(),
      log,
    })

    if (mainWindow && !mainWindow.isDestroyed()) {
      await mainWindow.loadURL(running.url)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    log.write('error', message)
    if (mainWindow && !mainWindow.isDestroyed()) {
      await showError(mainWindow, message)
    }
  } finally {
    starting = false
  }
}

function showAbout(): void {
  const engine = running?.engine
  const verified = engine && (VERIFIED_ENGINE_VERSIONS as readonly string[]).includes(engine.version)
  void showAppMessageBox(liveWindow(), {
    type: 'info',
    title: `About ${PRODUCT_NAME}`,
    message: PRODUCT_NAME,
    detail: [
      `${PRODUCT_NAME} ${app.getVersion()}`,
      `官方引擎: ${engine?.version ?? '未运行'} (${engine?.source ?? '—'})`,
      `安装包钉死版本: ${PINNED_ENGINE_VERSION}`,
      `本壳已验证: ${verified ? '是' : '否'}`,
      `Node 运行时: ${engine?.manifest?.nodeVersion ?? '随引擎捆绑'}`,
      '',
      `Harness 用户数据: ${defaultDshHome()}`,
      `壳数据: ${app.getPath('userData')}`,
      '',
      '检查更新、回滚、重启引擎：菜单栏「LocalHarness」。',
      '这些操作不在官方网页界面里。',
      '',
      'LocalHarness 是官方 @deepseek-ai/dsh 的独立窗口，并非 DeepSeek 出品。',
    ].join('\n'),
  })
}

async function checkForUpdates(): Promise<void> {
  if (updating) return
  if (!running) {
    await showAppMessageBox(liveWindow(), {
      type: 'info',
      message: 'Start the engine before checking for updates.',
    })
    return
  }
  updating = true
  const engineUrl = running.url
  try {
    log.write('update', `Checking npm for versions newer than ${running.engine.version}`)
    const decision = await inspectOfficialUpdates(running.engine.version)
    if (decision.kind === 'current') {
      log.write('update', `Already on ${decision.current}`)
      await showAppMessageBox(liveWindow(), {
        type: 'info',
        message: `Already on the newest published official engine (${decision.current}).`,
        detail: 'LocalHarness does not auto-update. Check again from the menu when you want to.',
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
          if (win) await showSplash(win, `Installing official ${decision.target}…`)
        },
      },
      decision,
      { info: updateLog },
    )
    if (!installed) {
      log.write('update', 'Install cancelled')
      return
    }
    config.previousEngineVersion = config.activeEngineVersion ?? running.engine.version
    config.activeEngineVersion = decision.target
    persistConfig()
    await bootEngine(`Restarting on official ${decision.target}…`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    log.write('update', message)
    await showAppMessageBox(liveWindow(), {
      type: 'error',
      message: 'Could not update the official engine',
      detail: message,
    })
    const win = liveWindow()
    if (win && engineUrl) {
      await win.loadURL(engineUrl)
    }
  } finally {
    updating = false
  }
}

async function rollbackEngine(): Promise<void> {
  const target = rollbackTarget(config.previousEngineVersion, {
    packaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    projectRoot,
    userEnginesDir: join(app.getPath('userData'), 'engines'),
  })
  if (!target) {
    await showAppMessageBox(liveWindow(), {
      type: 'info',
      message: 'No previous engine is available to roll back to.',
      detail: `Shipped engine is ${PINNED_ENGINE_VERSION}.`,
    })
    return
  }
  const choice = await showAppMessageBox(liveWindow(), {
    type: 'question',
    buttons: ['Roll Back', 'Cancel'],
    defaultId: 0,
    cancelId: 1,
    message: target.version
      ? `Roll back to official ${target.version}?`
      : `Roll back to the shipped engine (${PINNED_ENGINE_VERSION})?`,
  })
  if (!isAcceptedDialogButton(choice.response, 0)) return
  config.previousEngineVersion = config.activeEngineVersion
  config.activeEngineVersion = target.version
  persistConfig()
  await bootEngine('Rolling back the official engine…')
}

function openLogs(): void {
  void shell.openPath(log.directory)
}

function createWindow(): Electron.BrowserWindow {
  mainWindow = createMainWindow(config.windowBounds)
  mainWindow.on('close', () => {
    persistConfig()
  })
  mainWindow.on('closed', () => {
    mainWindow = undefined
  })
  return mainWindow
}

if (gotLock) {
  app.on('second-instance', () => {
    if (!mainWindow) {
      const win = createWindow()
      if (running) {
        void win.loadURL(running.url)
      } else {
        void bootEngine('Starting official Harness…')
      }
      return
    }
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  })

  app.whenReady().then(async () => {
    log = new EngineLog(join(app.getPath('userData'), 'logs'))
    log.open()
    config = loadConfig(app.getPath('userData'))
    createWindow()
    installApplicationMenu(() => mainWindow, {
      checkForUpdates: () => void checkForUpdates(),
      rollbackEngine: () => void rollbackEngine(),
      restartEngine: () => void bootEngine('Restarting official Harness…'),
      showAbout,
      openLogs,
    })
    await bootEngine('Starting official Harness…')
  })

  app.on('activate', () => {
    if (!mainWindow) {
      const win = createWindow()
      if (running) {
        void win.loadURL(running.url)
      } else {
        void bootEngine('Starting official Harness…')
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
    if (!running && !starting) {
      log.close()
      return
    }
    event.preventDefault()
    quitting = true
    persistConfig()
    const deadline = Date.now() + 15_000
    while (starting && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    await stopEngine(running, log)
    running = undefined
    log.close()
    app.quit()
  })
}

