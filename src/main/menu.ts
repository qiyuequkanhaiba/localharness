import { Menu, shell, type BrowserWindow } from 'electron'
import { defaultDshHome } from '../engine/platform'
import { OFFICIAL_REPO_URL, PRODUCT_NAME } from '../shared/constants'
import { type UpdateChannel } from './config'

export interface MenuHandlers {
  checkForUpdates: () => void
  checkShellUpdates: () => void
  rollbackEngine: () => void
  restartEngine: () => void
  showAbout: () => void
  openLogs: () => void
  chooseWorkspace: () => void
  setUpdateChannel: (channel: UpdateChannel) => void
  findInPage: () => void
  reloadUi: () => void
}

export interface MenuState {
  updateChannel: UpdateChannel
  workspaceCwd: string
}

function harnessMenu(isMac: boolean, handlers: MenuHandlers, state: MenuState): Electron.MenuItemConstructorOptions {
  return {
    label: PRODUCT_NAME,
    submenu: [
      { label: `关于 ${PRODUCT_NAME}`, click: () => handlers.showAbout() },
      { type: 'separator' },
      { label: '检查 Harness 更新…', accelerator: 'CmdOrCtrl+Shift+U', click: () => handlers.checkForUpdates() },
      { label: '检查 LocalHarness 更新…', click: () => handlers.checkShellUpdates() },
      {
        label: '引擎更新通道',
        submenu: [
          {
            label: '最新已发布（含 alpha）',
            type: 'radio',
            checked: state.updateChannel === 'newest',
            click: () => handlers.setUpdateChannel('newest'),
          },
          {
            label: '仅 npm latest',
            type: 'radio',
            checked: state.updateChannel === 'latest',
            click: () => handlers.setUpdateChannel('latest'),
          },
          {
            label: '仅已验证版本',
            type: 'radio',
            checked: state.updateChannel === 'verified',
            click: () => handlers.setUpdateChannel('verified'),
          },
        ],
      },
      { label: '回滚 Harness 引擎', click: () => handlers.rollbackEngine() },
      { label: '重启引擎', click: () => handlers.restartEngine() },
      { type: 'separator' },
      { label: '选择工作区…', click: () => handlers.chooseWorkspace() },
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

export function installApplicationMenu(
  getWindow: () => BrowserWindow | undefined,
  handlers: MenuHandlers,
  getState: () => MenuState,
): void {
  const isMac = process.platform === 'darwin'
  const state = getState()
  const template: Electron.MenuItemConstructorOptions[] = [
    harnessMenu(isMac, handlers, state),
    {
      label: '编辑',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
        { type: 'separator' },
        { label: '查找…', accelerator: 'CmdOrCtrl+F', click: () => handlers.findInPage() },
      ],
    },
    {
      label: '显示',
      submenu: [
        {
          label: '重新加载界面',
          accelerator: 'CmdOrCtrl+R',
          click: () => handlers.reloadUi(),
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
      label: '窗口',
      submenu: [{ role: 'minimize' }, { role: 'zoom' }, ...(isMac ? [{ type: 'separator' as const }, { role: 'front' as const }] : [{ role: 'close' as const }])],
    },
    {
      label: '帮助',
      submenu: [
        {
          label: `工作区：${state.workspaceCwd}`,
          enabled: false,
        },
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

export function refreshApplicationMenu(
  getWindow: () => BrowserWindow | undefined,
  handlers: MenuHandlers,
  getState: () => MenuState,
): void {
  installApplicationMenu(getWindow, handlers, getState)
}
