import { app, dialog, shell } from 'electron'
import { join } from 'node:path'
import { APP_ID, PINNED_ENGINE_VERSION, PRODUCT_NAME, VERIFIED_ENGINE_VERSIONS } from '../shared/constants'
import { locateEngine, describeMissingEngine } from '../engine/locate'
import { defaultDshHome } from '../engine/platform'
import { defaultWorkspaceCwd, loadConfig, saveConfig, type ShellConfig } from './config'
import { EngineLog } from './logs'
import { installApplicationMenu } from './menu'
import { startEngine, stopEngine, type RunningEngine } from './session'
import { confirmAndInstallUpdate, inspectOfficialUpdates, rollbackTarget } from './updater'
import { createMainWindow, isEnginePage, showError, showSplash } from './window'

app.setName(PRODUCT_NAME)
app.setAppUserModelId(APP_ID)

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
}

let mainWindow: Electron.BrowserWindow | undefined
let running: RunningEngine | undefined
let starting = false
let quitting = false
let config: ShellConfig = {}
let log!: EngineLog

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
  void dialog.showMessageBox({
    type: 'info',
    title: `About ${PRODUCT_NAME}`,
    message: PRODUCT_NAME,
    detail: [
      `${PRODUCT_NAME} ${app.getVersion()}`,
      `Official engine: ${engine?.version ?? 'not running'} (${engine?.source ?? '—'})`,
      `Pinned / shipped: ${PINNED_ENGINE_VERSION}`,
      `Verified: ${verified ? 'yes' : 'no'}`,
      `Node runtime: ${engine?.manifest?.nodeVersion ?? 'bundled with engine'}`,
      '',
      `Harness user data: ${defaultDshHome()}`,
      `Shell data: ${app.getPath('userData')}`,
      '',
      'LocalHarness is an independent window around official @deepseek-ai/dsh.',
      'It is not published by DeepSeek.',
    ].join('\n'),
  })
}

async function checkForUpdates(): Promise<void> {
  if (!running) {
    await dialog.showMessageBox({
      type: 'info',
      message: 'Start the engine before checking for updates.',
    })
    return
  }
  try {
    const decision = await inspectOfficialUpdates(running.engine.version)
    if (decision.kind === 'current') {
      await dialog.showMessageBox({
        type: 'info',
        message: `Already on the newest published official engine (${decision.current}).`,
        detail: 'LocalHarness does not auto-update. Check again from the menu when you want to.',
      })
      return
    }
    const installed = await confirmAndInstallUpdate(
      {
        current: running.engine,
        userEnginesDir: join(app.getPath('userData'), 'engines'),
        cacheDir: join(app.getPath('userData'), 'cache'),
        packaged: app.isPackaged,
        resourcesPath: process.resourcesPath,
        projectRoot,
      },
      decision,
      { info: (message) => log.write('update', message) },
    )
    if (!installed) return
    config.previousEngineVersion = config.activeEngineVersion ?? running.engine.version
    config.activeEngineVersion = decision.target
    persistConfig()
    await bootEngine(`Restarting on official ${decision.target}…`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    log.write('update', message)
    await dialog.showMessageBox({
      type: 'error',
      message: 'Could not update the official engine',
      detail: message,
    })
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
    await dialog.showMessageBox({
      type: 'info',
      message: 'No previous engine is available to roll back to.',
      detail: `Shipped engine is ${PINNED_ENGINE_VERSION}.`,
    })
    return
  }
  const choice = await dialog.showMessageBox({
    type: 'question',
    buttons: ['Roll Back', 'Cancel'],
    defaultId: 0,
    cancelId: 1,
    message: target.version
      ? `Roll back to official ${target.version}?`
      : `Roll back to the shipped engine (${PINNED_ENGINE_VERSION})?`,
  })
  if (choice.response !== 0) return
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

