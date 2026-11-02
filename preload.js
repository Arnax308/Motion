const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  loadData: () => ipcRenderer.invoke('data:load'),
  saveData: (data) => ipcRenderer.invoke('data:save', data),
  setTheme: (mode) => ipcRenderer.invoke('theme:set', mode),
  netFetch: (url, init) => ipcRenderer.invoke('net:fetch', url, init)
});
