// Pont sécurisé entre la page et le processus principal.
// La page ne voit que ces fonctions, pas Node.js.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('worldnime', {
  info: () => ipcRenderer.invoke('app:info'),
  pendingFile: () => ipcRenderer.invoke('app:pending-file'),
  open: () => ipcRenderer.invoke('dialog:open'),
  chooseSavePath: (filePath) => ipcRenderer.invoke('dialog:save-path', { filePath }),
  writeText: (filePath, text) => ipcRenderer.invoke('file:write-text', { filePath, text }),
  resolvePath: (projectFile, p) => ipcRenderer.invoke('path:resolve', { projectFile, p }),
  relativePath: (projectFile, abs) => ipcRenderer.invoke('path:relative', { projectFile, abs }),
  listImages: (dir) => ipcRenderer.invoke('images:list', dir),
  readImage: (dir, file) => ipcRenderer.invoke('images:read', { dir, file }),
  writeImage: (dir, file, bytes) => ipcRenderer.invoke('images:write', { dir, file, bytes }),
  watchImages: (dir) => ipcRenderer.invoke('images:watch', dir),
  onImagesChanged: (callback) => {
    ipcRenderer.on('images:changed', () => callback());
  },
  chooseFolder: (title, defaultPath) => ipcRenderer.invoke('dialog:choose-folder', { title, defaultPath }),
  chooseFile: (title, kind) => ipcRenderer.invoke('dialog:choose-file', { title, kind }),
  readBinary: (file) => ipcRenderer.invoke('file:read-binary', file),
  confirmDiscard: () => ipcRenderer.invoke('dialog:confirm-discard'),
  setDirty: (dirty) => ipcRenderer.send('state:dirty', dirty),
  onMenu: (callback) => {
    ipcRenderer.on('menu', (_e, command) => callback(command));
  },
  selftestCapture: (name) => ipcRenderer.invoke('selftest:capture', name),
  selftestDone: (report) => ipcRenderer.invoke('selftest:done', report),
});
