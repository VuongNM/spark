import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { SparkApi } from './api'

function subscribe<T>(channel: string, cb: (value: T) => void): () => void {
  const listener = (_e: IpcRendererEvent, value: T) => cb(value)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: SparkApi = {
  getState: () => ipcRenderer.invoke('state:get'),
  onState: (cb) => subscribe('state', cb),
  updateSettings: (patch) => ipcRenderer.invoke('settings:update', patch),
  saveApiKey: (key) => ipcRenderer.invoke('apikey:save', key),
  testApiKey: (key) => ipcRenderer.invoke('apikey:test', key),
  listHistory: (q) => ipcRenderer.invoke('history:list', q),
  deleteHistory: (id) => ipcRenderer.invoke('history:delete', id),
  clearHistory: () => ipcRenderer.invoke('history:clear'),
  restoreHistory: (entry) => ipcRenderer.invoke('history:restore', entry),
  onHistory: (cb) => subscribe('history:new', cb),
  onLevel: (cb) => subscribe('level', cb),
  listDictionary: () => ipcRenderer.invoke('dict:list'),
  saveDictionary: (entries) => ipcRenderer.invoke('dict:save', entries),
  downloadModel: () => ipcRenderer.invoke('model:download'),
  downloadLocalModel: () => ipcRenderer.invoke('llm:download'),
  requestMic: () => ipcRenderer.invoke('perm:mic'),
  openMicSettings: () => ipcRenderer.invoke('perm:mic-settings'),
  openKeyboardSettings: () => ipcRenderer.invoke('perm:keyboard-settings'),
  requestAccessibility: () => ipcRenderer.invoke('perm:accessibility'),
  openDataFolder: () => ipcRenderer.invoke('app:open-data'),
  openUrl: (url) => ipcRenderer.invoke('app:open-url', url),
  copy: (text) => ipcRenderer.invoke('app:copy', text),
  toggleDictation: () => ipcRenderer.invoke('dictation:toggle'),
  overlay: {
    onCommand: (cb) => subscribe('overlay:command', cb),
    sendAudio: (audio) => ipcRenderer.invoke('overlay:audio', audio),
    micError: (message) => ipcRenderer.send('overlay:mic-error', message),
    level: (value) => ipcRenderer.send('overlay:level', value),
    partialAudio: (samples, sampleRate, final) => ipcRenderer.send('overlay:partial-audio', { samples, sampleRate, final }),
  },
}

contextBridge.exposeInMainWorld('spark', api)
