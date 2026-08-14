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

export function installApplicationMenu(getWindow: () => BrowserWindow | undefined, handlers: MenuHandlers): void {
  const isMac = process.platform === 'darwin'
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac
      ? [{
          label: PRODUCT_NAME,
          submenu: [
            { label: `About ${PRODUCT_NAME}`, click: () => handlers.showAbout() },
            { type: 'separator' as const },
            { label: 'Check for Harness Updates…', click: () => handlers.checkForUpdates() },
            { label: 'Rollback Harness Engine', click: () => handlers.rollbackEngine() },
            { label: 'Restart Engine', click: () => handlers.restartEngine() },
            { type: 'separator' as const },
            { role: 'hide' as const },
            { role: 'hideOthers' as const },
            { role: 'unhide' as const },
            { type: 'separator' as const },
            { role: 'quit' as const },
          ],
        }]
      : []),
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
        ...(!isMac
          ? [
              { label: `About ${PRODUCT_NAME}`, click: () => handlers.showAbout() },
              { label: 'Check for Harness Updates…', click: () => handlers.checkForUpdates() },
              { label: 'Rollback Harness Engine', click: () => handlers.rollbackEngine() },
              { label: 'Restart Engine', click: () => handlers.restartEngine() },
              { type: 'separator' as const },
            ]
          : []),
        {
          label: 'Open User Data (~/.dsh)',
          click: () => void shell.openPath(defaultDshHome()),
        },
        {
          label: 'Open Engine Logs',
          click: () => handlers.openLogs(),
        },
        {
          label: 'Official DeepSeek Harness on GitHub',
          click: () => void shell.openExternal(OFFICIAL_REPO_URL),
        },
      ],
    },
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
