import { app, safeStorage } from 'electron'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEFAULT_SETTINGS, type DictEntry, type HistoryEntry, type Settings } from '../shared/types'

const MAX_HISTORY = 1000

function dataPath(name: string): string {
  const dir = app.getPath('userData')
  mkdirSync(dir, { recursive: true })
  return join(dir, name)
}

function readJson<T>(name: string, fallback: T): T {
  const p = dataPath(name)
  if (!existsSync(p)) return fallback
  try {
    return JSON.parse(readFileSync(p, 'utf8')) as T
  } catch {
    renameSync(p, `${p}.corrupt-${Date.now()}`)
    return fallback
  }
}

function writeJson(name: string, value: unknown): void {
  const p = dataPath(name)
  writeFileSync(`${p}.tmp`, JSON.stringify(value, null, 2))
  renameSync(`${p}.tmp`, p)
}

interface SettingsFile extends Settings {
  apiKeyEnc?: string
  version?: number
}

const SETTINGS_VERSION = 4
const platformHoldKey = process.platform === 'darwin' ? 'Fn' : 'CtrlRight'
const firstRun = !existsSync(dataPath('settings.json'))

let settingsFile: SettingsFile = { ...DEFAULT_SETTINGS, holdKey: platformHoldKey, ...readJson<Partial<SettingsFile>>('settings.json', {}) }
const fromVersion = settingsFile.version ?? 1
// v2: push-to-talk (hold the key, let go to paste) becomes the main way to dictate.
if (fromVersion < 2) settingsFile = { ...settingsFile, mode: 'hold', holdKey: platformHoldKey }
// v3: Haiku 5.5 is the cleanup default (fast enough for push-to-talk); keeps any model the user picked.
if (fromVersion < 3 && settingsFile.claudeModel === 'claude-opus-5-5') settingsFile = { ...settingsFile, claudeModel: 'claude-haiku-5-5' }
// v4: the first-run tour is for new installs; people already using Spark skip it.
if (fromVersion < 4 && !firstRun) settingsFile = { ...settingsFile, onboarded: true }
if (fromVersion < SETTINGS_VERSION) {
  settingsFile = { ...settingsFile, version: SETTINGS_VERSION }
  writeJson('settings.json', settingsFile)
}
if (settingsFile.holdKey === 'Fn' && process.platform !== 'darwin') settingsFile.holdKey = 'CtrlRight'
let history: HistoryEntry[] = readJson<HistoryEntry[]>('history.json', [])
let dictionary: DictEntry[] = readJson<DictEntry[]>('dictionary.json', [])

export function getSettings(): Settings {
  const { apiKeyEnc: _key, version: _version, ...s } = settingsFile
  return s
}

export function updateSettings(patch: Partial<Settings>): Settings {
  settingsFile = { ...settingsFile, ...patch }
  writeJson('settings.json', settingsFile)
  return getSettings()
}

export function saveApiKey(key: string | null): void {
  if (key === null) {
    delete settingsFile.apiKeyEnc
  } else {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Secure storage is not available on this system')
    settingsFile.apiKeyEnc = safeStorage.encryptString(key.trim()).toString('base64')
  }
  writeJson('settings.json', settingsFile)
}

export function loadApiKey(): { key: string | null; source: 'saved' | 'env' | 'none' } {
  if (settingsFile.apiKeyEnc) {
    try {
      return { key: safeStorage.decryptString(Buffer.from(settingsFile.apiKeyEnc, 'base64')), source: 'saved' }
    } catch {
      // Unreadable here (e.g. a self-test without the keychain): fall back to the environment.
    }
  }
  if (process.env.ANTHROPIC_API_KEY) return { key: process.env.ANTHROPIC_API_KEY, source: 'env' }
  return { key: null, source: 'none' }
}

export function listHistory(query = ''): HistoryEntry[] {
  const q = query.trim().toLocaleLowerCase('vi')
  return q ? history.filter((h) => h.text.toLocaleLowerCase('vi').includes(q) || h.raw.toLocaleLowerCase('vi').includes(q)) : history
}

export function addHistory(entry: HistoryEntry): void {
  history = [entry, ...history.filter((h) => h.id !== entry.id)].sort((a, b) => b.createdAt - a.createdAt).slice(0, MAX_HISTORY)
  writeJson('history.json', history)
}

export function deleteHistory(id: string): void {
  history = history.filter((h) => h.id !== id)
  writeJson('history.json', history)
}

export function clearHistory(): void {
  history = []
  writeJson('history.json', history)
}

export function listDictionary(): DictEntry[] {
  return dictionary
}

export function saveDictionary(entries: DictEntry[]): DictEntry[] {
  dictionary = entries
  writeJson('dictionary.json', dictionary)
  return dictionary
}
