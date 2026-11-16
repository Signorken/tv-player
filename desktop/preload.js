'use strict';
const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  platform: process.platform,
  discover: ms => ipcRenderer.invoke('discover', ms),
  dlnaBrowse: (control, id) => ipcRenderer.invoke('dlna:browse', control, id),
  pickFolder: () => ipcRenderer.invoke('pick-folder'),
  smbResolve: t => ipcRenderer.invoke('smb:resolve', t),
  smbShares: h => ipcRenderer.invoke('smb:shares', h),
  listDir: dir => ipcRenderer.invoke('fs:list', dir),
  listDrives: () => ipcRenderer.invoke('drives:list'),
  readText: p => ipcRenderer.invoke('fs:read', p),
  readClipboard: () => ipcRenderer.invoke('clipboard:read'),
  setUserAgent: ua => ipcRenderer.invoke('set-ua', ua),
  toggleFullscreen: () => ipcRenderer.invoke('fullscreen', 'toggle'),
  setFullscreen: on => ipcRenderer.invoke('fullscreen', on ? 'on' : 'off'),
  pathForFile: f => { try { return webUtils.getPathForFile(f); } catch (e) { return ''; } },
  ffProbe: u => ipcRenderer.invoke('ff:probe', u),
  ffUrl: (u, o) => ipcRenderer.invoke('ff:url', u, o),
  ffStop: () => ipcRenderer.invoke('ff:stop'),
  keepAwake: on => ipcRenderer.invoke('power:keep', !!on),
  appVersion: () => ipcRenderer.invoke('update:version'),
  updateCheck: () => ipcRenderer.invoke('update:check'),
  updateDownload: () => ipcRenderer.invoke('update:download'),
  updateInstall: () => ipcRenderer.invoke('update:install'),
  setRepoAndCheck: async t => { const ok = await ipcRenderer.invoke('update:setrepo', t); if (ok) await ipcRenderer.invoke('update:check'); return ok; },
  updatePage: () => ipcRenderer.invoke('update:page'),
  onUpdate: cb => ipcRenderer.on('update', (e, m) => cb(m)),
  onMenu: cb => ipcRenderer.on('menu', (e, cmd) => cb(cmd)),
  onOpenPath: cb => { ipcRenderer.on('open-path', (e, p) => cb(p)); ipcRenderer.send('renderer-ready'); }
});
