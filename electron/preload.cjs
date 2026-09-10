// Electron 预加载脚本：把真发能力安全地暴露给 UI（contextBridge）
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('WolNative', {
  sendMagicPacket: (target) => ipcRenderer.invoke('wol:send', target),
  checkHost: (opts) => ipcRenderer.invoke('wol:check', opts),
});
