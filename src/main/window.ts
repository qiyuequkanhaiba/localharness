import { BrowserWindow, shell } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { PRODUCT_NAME } from '../shared/constants'
import type { WindowBounds } from './config'

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
    },
  })

  win.setMenuBarVisibility(true)
  win.setAutoHideMenuBar(false)
  win.once('ready-to-show', () => {
    win.show()
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  win.webContents.on('will-navigate', (event, url) => {
    if (isAllowedNavigation(win, url)) return
    event.preventDefault()
    void shell.openExternal(url)
  })

  win.webContents.session.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === 'clipboard-sanitized-write' || permission === 'notifications')
  })

  return win
}

function isAllowedNavigation(win: BrowserWindow, url: string): boolean {
  if (url.startsWith('file://')) return true
  const current = win.webContents.getURL()
  try {
    if (current.startsWith('http://127.0.0.1:') || current.startsWith('http://localhost:')) {
      const origin = new URL(current).origin
      return new URL(url).origin === origin
    }
  } catch {
    return false
  }
  return url.startsWith('http://127.0.0.1:') || url.startsWith('http://localhost:')
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
  const url = win.webContents.getURL()
  return url.startsWith('http://127.0.0.1:') || url.startsWith('http://localhost:')
}
