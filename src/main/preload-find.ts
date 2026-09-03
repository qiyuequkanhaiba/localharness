import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('findBar', {
  query(text: string, forward: boolean) {
    ipcRenderer.send('find-query', text, forward)
  },
  close() {
    ipcRenderer.send('find-close')
  },
})
