import { BrowserWindow, Menu, shell } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { AUTH_REQUIRED_TEXT, PRODUCT_NAME, SHELL_ACTION_SCHEME } from '../shared/constants'
import type { WindowBounds } from './config'

export type ShellAction = 'restart' | 'rollback' | 'logs'

export interface HostWindowHandlers {
  getEngineUrl(): string | undefined
  onShellAction(action: ShellAction): void
}

export function resolveAppIcon(): string | undefined {
  const packaged = join(process.resourcesPath, 'icon.ico')
  if (existsSync(packaged)) return packaged
  const dev = join(__dirname, '../../build/icon.ico')
  if (existsSync(dev)) return dev
  const png = join(__dirname, '../../build/icon.png')
  return existsSync(png) ? png : undefined
}

const DEFAULT_BOUNDS = { width: 1280, height: 840 }

export function rendererFile(name: string): string {
  return join(__dirname, '../renderer', name)
}

export function isLoopbackHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return (
      (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
      (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost' || parsed.hostname === '::1')
    )
  } catch {
    return false
  }
}

export function sameLoopbackOrigin(left: string, right: string): boolean {
  try {
    return isLoopbackHttpUrl(left) && isLoopbackHttpUrl(right) && new URL(left).origin === new URL(right).origin
  } catch {
    return false
  }
}

export function parseShellAction(url: string): ShellAction | undefined {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== `${SHELL_ACTION_SCHEME}:`) return undefined
    const action = (parsed.hostname || parsed.pathname.replace(/^\//, '')).toLowerCase()
    if (action === 'restart' || action === 'rollback' || action === 'logs') return action
    return undefined
  } catch {
    return undefined
  }
}

export function createMainWindow(bounds?: WindowBounds): BrowserWindow {
  const icon = resolveAppIcon()
  const win = new BrowserWindow({
    ...DEFAULT_BOUNDS,
    ...bounds,
    minWidth: 880,
    minHeight: 600,
    title: PRODUCT_NAME,
    show: false,
    autoHideMenuBar: false,
    ...icon ? { icon } : {},
    webPreferences: {
      preload: undefined,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webviewTag: false,
      spellcheck: true,
      backgroundThrottling: false,
    },
  })

  win.setMenuBarVisibility(true)
  win.setAutoHideMenuBar(false)
  win.once('ready-to-show', () => {
    win.show()
  })

  return win
}

export function attachHostWindow(win: BrowserWindow, handlers: HostWindowHandlers): void {
  let authRetries = 0

  const retryAuth = async (): Promise<void> => {
    const engineUrl = handlers.getEngineUrl()
    if (!engineUrl || authRetries >= 2) return
    authRetries += 1
    await win.loadURL(engineUrl)
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    const action = parseShellAction(url)
    if (action) {
      handlers.onShellAction(action)
      return { action: 'deny' }
    }
    const current = win.webContents.getURL()
    if (sameLoopbackOrigin(current, url) || isLoopbackHttpUrl(url)) {
      return { action: 'allow' }
    }
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  win.webContents.on('will-navigate', (event, url) => {
    const action = parseShellAction(url)
    if (action) {
      event.preventDefault()
      handlers.onShellAction(action)
      return
    }
    if (isAllowedNavigation(win, url)) return
    event.preventDefault()
    void shell.openExternal(url)
  })

  win.webContents.on('did-navigate', (_event, url, httpResponseCode) => {
    if (httpResponseCode === 401 && isLoopbackHttpUrl(url)) {
      void retryAuth()
    }
  })

  win.webContents.on('did-finish-load', () => {
    const url = win.webContents.getURL()
    if (!isLoopbackHttpUrl(url)) {
      authRetries = 0
      return
    }
    void win.webContents
      .executeJavaScript('document.body && document.body.innerText || ""')
      .then((text: string) => {
        if (typeof text === 'string' && text.includes(AUTH_REQUIRED_TEXT)) {
          return retryAuth()
        }
        authRetries = 0
        return undefined
      })
      .catch(() => undefined)
  })

  win.webContents.on('page-title-updated', (_event, title) => {
    if (title.trim().length > 0) win.setTitle(`${title} — ${PRODUCT_NAME}`)
  })

  win.webContents.on('context-menu', (_event, params) => {
    const template: Electron.MenuItemConstructorOptions[] = [
      { role: 'undo', enabled: params.editFlags.canUndo },
      { role: 'redo', enabled: params.editFlags.canRedo },
      { type: 'separator' },
      { role: 'cut', enabled: params.editFlags.canCut },
      { role: 'copy', enabled: params.selectionText.length > 0 },
      { role: 'paste', enabled: params.editFlags.canPaste },
      { role: 'selectAll' },
      { type: 'separator' },
      {
        label: '查找…',
        accelerator: 'CmdOrCtrl+F',
        click: () => openFindBar(win),
      },
    ]
    Menu.buildFromTemplate(template).popup({ window: win })
  })

  win.webContents.session.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === 'clipboard-sanitized-write' || permission === 'notifications')
  })

  win.webContents.session.on('will-download', (_event, item) => {
    item.setSaveDialogOptions({ defaultPath: item.getFilename() })
  })
}

function isAllowedNavigation(win: BrowserWindow, url: string): boolean {
  if (url.startsWith('file://')) return true
  const current = win.webContents.getURL()
  if (sameLoopbackOrigin(current, url)) return true
  return isLoopbackHttpUrl(url)
}

export async function showSplash(win: BrowserWindow, status: string): Promise<void> {
  const already = win.webContents.getURL().includes('splash.html')
  if (!already) {
    await win.loadFile(rendererFile('splash.html'))
  }
  await setSplashStatus(win, status)
}

export async function setSplashStatus(win: BrowserWindow, status: string): Promise<void> {
  if (win.isDestroyed()) return
  if (!win.webContents.getURL().includes('splash.html')) return
  await win.webContents.executeJavaScript(`window.setStatus && window.setStatus(${JSON.stringify(status)})`)
}

const pendingSplashLog: string[] = []
let splashLogTimer: NodeJS.Timeout | undefined

export function appendSplashLog(win: BrowserWindow, text: string): void {
  if (win.isDestroyed() || !text.trim()) return
  pendingSplashLog.push(text)
  if (splashLogTimer) return
  splashLogTimer = setTimeout(() => {
    splashLogTimer = undefined
    const batch = pendingSplashLog.splice(0).join('\n')
    if (!batch || win.isDestroyed()) return
    if (!win.webContents.getURL().includes('splash.html')) return
    void win.webContents.executeJavaScript(`window.appendLog && window.appendLog(${JSON.stringify(batch)})`)
  }, 120)
}

export async function showError(win: BrowserWindow, message: string): Promise<void> {
  await win.loadFile(rendererFile('error.html'), { query: { message } })
}

export function isEnginePage(win: BrowserWindow): boolean {
  return isLoopbackHttpUrl(win.webContents.getURL())
}

export function reloadEngineUi(win: BrowserWindow, engineUrl?: string): void {
  if (engineUrl && (isEnginePage(win) || win.webContents.getURL().includes('error.html'))) {
    void win.loadURL(engineUrl)
    return
  }
  win.webContents.reload()
}

let findWindow: BrowserWindow | undefined

export function openFindBar(parent: BrowserWindow): void {
  if (findWindow && !findWindow.isDestroyed()) {
    findWindow.focus()
    return
  }
  findWindow = new BrowserWindow({
    parent,
    width: 420,
    height: 56,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    title: '查找',
    webPreferences: {
      preload: join(__dirname, 'preload-find.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  findWindow.setMenu(null)
  void findWindow.loadFile(rendererFile('find.html'))
  findWindow.on('closed', () => {
    findWindow = undefined
    if (!parent.isDestroyed()) parent.webContents.stopFindInPage('clearSelection')
  })
}

export function closeFindBar(): void {
  if (findWindow && !findWindow.isDestroyed()) findWindow.close()
  findWindow = undefined
}

export function findInParent(parent: BrowserWindow, text: string, forward: boolean): void {
  if (!text) {
    parent.webContents.stopFindInPage('clearSelection')
    return
  }
  parent.webContents.findInPage(text, { forward, findNext: true })
}
