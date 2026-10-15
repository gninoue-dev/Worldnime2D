// Pont sécurisé entre la page et le processus principal.
// La page ne voit que ces fonctions, pas Node.js.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('worldnime', {
  info: () => ipcRenderer.invoke('app:info'),
  pendingFile: () => ipcRenderer.invoke('app:pending-file'),
  open: () => ipcRenderer.invoke('dialog:open'),
  save: (text, filePath, saveAs) => ipcRenderer.invoke('file:save', { text, filePath, saveAs }),
  confirmDiscard: () => ipcRenderer.invoke('dialog:confirm-discard'),
  setDirty: (dirty) => ipcRenderer.send('state:dirty', dirty),
  onMenu: (callback) => {
    ipcRenderer.on('menu', (_e, command) => callback(command));
  },
  selftestCapture: (name) => ipcRenderer.invoke('selftest:capture', name),
  selftestDone: (report) => ipcRenderer.invoke('selftest:done', report),
});
