const { contextBridge, ipcRenderer } = require('electron');

const params = new URLSearchParams(window.location.search);
const mode = params.get('mode') || 'electron-overlay';
const screenIndex = Number(params.get('screen') || '0');

function subscribe(channel, cb) {
  const listener = (_event, payload) => cb(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('snowflakeElectron', {
  mode,
  screenIndex,
  platformOS: process.platform,
  onSettingsSync: (cb) => subscribe('sf:settings-sync', cb),
  sendSettingsUpdate: (patch) => ipcRenderer.send('sf:settings-update', patch),
  onAction: (cb) => subscribe('sf:action', cb),
  sendAction: (action) => ipcRenderer.send('sf:action', action),
  onWindowSnapshot: (cb) => subscribe('sf:window-snapshot', cb),
  onGlobalCursor: (cb) => subscribe('sf:global-cursor', cb),
  closeSettings: () => ipcRenderer.send('sf:close-settings'),
  quitApp: () => ipcRenderer.send('sf:quit'),
  setIgnoreMouseEvents: (ignore) => ipcRenderer.send('sf:set-ignore-mouse', Boolean(ignore)),
  setLaunchAtLogin: (enable) => ipcRenderer.send('sf:set-launch-at-login', Boolean(enable)),
  openSandboxWindow: () => ipcRenderer.send('sf:open-sandbox')
});
