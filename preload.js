const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  list: () => ipcRenderer.invoke('notes:list'),
  create: () => ipcRenderer.invoke('notes:create'),
  update: (id, patch) => ipcRenderer.invoke('notes:update', id, patch),
  remove: (ids) => ipcRenderer.invoke('notes:delete', ids),
  pin: (id, mode) => ipcRenderer.invoke('notes:pin', id, mode),
  shade: (id, s) => ipcRenderer.invoke('notes:shade', id, s),
  open: (id) => ipcRenderer.invoke('notes:open', id),
  merge: (remote) => ipcRenderer.invoke('notes:merge', remote),
  syncInfo: () => ipcRenderer.invoke('sync:info'),
  setSyncStatus: (s) => ipcRenderer.send('sync:status', s),
  onSyncStatus: (cb) => ipcRenderer.on('sync:status', (_e, s) => cb(s)),
  onChanged: (cb) => ipcRenderer.on('notes:changed', (_e, notes) => cb(notes)),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),
  onSettings: (cb) => ipcRenderer.on('settings:changed', (_e, s) => cb(s)),
  setWindowBg: (hex) => ipcRenderer.send('win:bg', hex),
  copy: (text) => ipcRenderer.send('clipboard:write', String(text)),
  close: () => ipcRenderer.send('win:close'),
  minimize: () => ipcRenderer.send('win:minimize'),
  showMain: () => ipcRenderer.send('main:show'),
});
