import { app, Menu, shell, type BrowserWindow } from 'electron'
import { defaultDshHome } from '../engine/platform'
import { OFFICIAL_REPO_URL, PRODUCT_NAME } from '../shared/constants'

export interface MenuHandlers {
  checkForUpdates: () => void
  rollbackEngine: () => void
  restartEngine: () => void
  showAbout: () => void
  openLogs: () => void
}

function harnessMenu(isMac: boolean, handlers: MenuHandlers): Electron.MenuItemConstructorOptions {
  return {
    label: PRODUCT_NAME,
    submenu: [
      { label: `关于 ${PRODUCT_NAME}`, click: () => handlers.showAbout() },
      { type: 'separator' },
      { label: '检查 Harness 更新…', accelerator: 'CmdOrCtrl+Shift+U', click: () => handlers.checkForUpdates() },
      { label: '回滚 Harness 引擎', click: () => handlers.rollbackEngine() },
      { label: '重启引擎', click: () => handlers.restartEngine() },
      { type: 'separator' },
      ...(isMac
        ? [
            { role: 'hide' as const },
            { role: 'hideOthers' as const },
            { role: 'unhide' as const },
            { type: 'separator' as const },
          ]
        : []),
      isMac ? { role: 'quit' as const } : { label: '退出', role: 'quit' as const },
    ],
  }
}

export function installApplicationMenu(getWindow: () => BrowserWindow | undefined, handlers: MenuHandlers): void {
  const isMac = process.platform === 'darwin'
  const template: Electron.MenuItemConstructorOptions[] = [
    harnessMenu(isMac, handlers),
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Reload UI',
          accelerator: 'CmdOrCtrl+R',
          click: () => getWindow()?.webContents.reload(),
        },
        { role: 'togglefullscreen' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'toggleDevTools' },
      ],
    },
    {
      label: 'Window',
      submenu: [{ role: 'minimize' }, { role: 'zoom' }, ...(isMac ? [{ type: 'separator' as const }, { role: 'front' as const }] : [{ role: 'close' as const }])],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: '打开用户数据 (~/.dsh)',
          click: () => void shell.openPath(defaultDshHome()),
        },
        {
          label: '打开引擎日志',
          click: () => handlers.openLogs(),
        },
        {
          label: '官方 DeepSeek Harness（GitHub）',
          click: () => void shell.openExternal(OFFICIAL_REPO_URL),
        },
      ],
    },
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
