'use strict';

const { contextBridge, ipcRenderer } = require('electron');

function subscribe(channel, callback) {
  const handler = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

contextBridge.exposeInMainWorld('floatlingo', {
  getConfig: () => ipcRenderer.invoke('app:get-config'),
  saveSettings: (patch) => ipcRenderer.invoke('settings:save', patch),
  setKeys: (payload) => ipcRenderer.invoke('keys:set', payload),
  startSession: () => ipcRenderer.invoke('session:start'),
  stopSession: () => ipcRenderer.invoke('session:stop'),
  retryTranslation: (id) => ipcRenderer.invoke('session:retry-translation', id),
  reportMicError: (message) => ipcRenderer.invoke('audio:mic-error', message),
  getPermissions: () => ipcRenderer.invoke('permissions:get'),
  openPermission: (kind) => ipcRenderer.invoke('permissions:open', kind),
  revealHelper: () => ipcRenderer.invoke('permissions:reveal-helper'),
  askMicrophone: () => ipcRenderer.invoke('permissions:ask-mic'),
  exportHistory: () => ipcRenderer.invoke('history:export'),
  generateMinutes: () => ipcRenderer.invoke('minutes:generate'),
  exportMinutes: (payload) => ipcRenderer.invoke('minutes:export', payload),
  clearHistory: () => ipcRenderer.invoke('history:clear'),
  copyText: (text) => ipcRenderer.invoke('clipboard:write', text),
  setIgnoreMouse: (value) => ipcRenderer.invoke('window:set-ignore-mouse', value),
  setOpacity: (value) => ipcRenderer.invoke('window:set-opacity', value),
  setAlwaysOnTop: (value) => ipcRenderer.invoke('window:set-always-on-top', value),
  minimize: () => ipcRenderer.invoke('window:minimize'),
  hide: () => ipcRenderer.invoke('window:hide'),
  show: () => ipcRenderer.invoke('window:show'),
  openLog: () => ipcRenderer.invoke('app:open-log'),
  quit: () => ipcRenderer.invoke('app:quit'),
  sendMic: (arrayBuffer) => ipcRenderer.send('audio:mic', arrayBuffer),
  rendererReady: () => ipcRenderer.send('renderer:ready'),
  onCaption: (cb) => subscribe('caption', cb),
  onCaptionRemove: (cb) => subscribe('caption-remove', cb),
  onLevels: (cb) => subscribe('levels', cb),
  onSession: (cb) => subscribe('session', cb),
  onToast: (cb) => subscribe('toast', cb),
  onHistoryCleared: (cb) => subscribe('history-cleared', cb),
  onClickThrough: (cb) => subscribe('window:click-through', cb),
  onOpenSettings: (cb) => subscribe('ui:open-settings', cb),
  onToggleSession: (cb) => subscribe('shortcut:toggle-session', cb),
  onMinutesShortcut: (cb) => subscribe('shortcut:minutes', cb),
  onMinutesProgress: (cb) => subscribe('minutes:progress', cb),
  onAppFlags: (cb) => subscribe('app:flags', cb)
});
