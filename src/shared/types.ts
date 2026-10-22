export type TriggerMode = 'toggle' | 'hold'
export type HoldKey = 'Fn' | 'AltRight' | 'MetaRight' | 'CtrlRight'
export type CleanupMode = 'claude' | 'local' | 'basic'
export type ClaudeModel = 'claude-opus-5-5' | 'claude-sonnet-5-5' | 'claude-haiku-5-5'
export type Style = 'auto' | 'casual' | 'formal'
export type Motion = 'system' | 'full'
export type Theme = 'system' | 'light' | 'dark'
export type AppCategory = 'chat' | 'email' | 'code' | 'docs' | 'other'

export interface Settings {
  mode: TriggerMode
  shortcut: string
  holdKey: HoldKey
  micDeviceId: string
  cleanup: CleanupMode
  claudeModel: ClaudeModel
  style: Style
  /** Rewrite spoken loops into tidy written sentences (on), or keep the spoken structure (off). */
  polish: boolean
  sounds: boolean
  keepHistory: boolean
  restoreClipboard: boolean
  launchAtLogin: boolean
  motion: Motion
  theme: Theme
  keepRecordings: boolean
}

export interface DictEntry {
  id: string
  word: string
  heardAs: string[]
}

export type CleanedBy = 'claude' | 'local' | 'basic'
export type FallbackReason = 'no-key' | 'bad-key' | 'offline' | 'diverged' | 'refused' | 'error' | 'local-loading' | 'local-rejected' | 'local-error'

export interface HistoryEntry {
  id: string
  createdAt: number
  app: string
  durationSec: number
  raw: string
  /** What the English model heard, when installed (a hint for mixed-language speech). */
  english?: string
  text: string
  cleanedBy: CleanedBy
  fallbackReason?: FallbackReason
  inserted: 'paste' | 'clipboard'
  sttMs: number
  cleanupMs: number
  micMs?: number
  /** From letting go of the key to the text being pasted. */
  latencyMs?: number
  /** True when the cleanup started at release (from the audio heard so far) turned out to match. */
  early?: boolean
}

export type PermissionState = 'granted' | 'denied' | 'not-determined' | 'unsupported'

export interface ModelStatus {
  state: 'missing' | 'downloading' | 'ready' | 'error'
  progress: number
  sizeMb: number
  error?: string
}

export interface Setup {
  platform: string
  glass: boolean
  systemReducedMotion: boolean
  mic: PermissionState
  accessibility: PermissionState
  model: ModelStatus
  /** Gemma 4 for on-device cleanup (optional download). */
  localModel: ModelStatus
  claude: { configured: boolean; source: 'saved' | 'env' | 'none'; keyHint: string }
  hotkey: { ok: boolean; error?: string; reason?: 'taken' | 'permission' | 'unavailable' }
  /** macOS “Press 🌐 key to” setting; anything but 'nothing' fires alongside Fn push-to-talk. */
  globeKey: 'nothing' | 'input-source' | 'emoji' | 'dictation' | 'unknown' | 'n/a'
}

export type Phase = 'idle' | 'recording' | 'transcribing' | 'cleaning' | 'done' | 'error'

export interface OverlayView {
  phase: Phase
  startedAt?: number
  message?: string
  handsFree?: boolean
}

export interface AppState {
  settings: Settings
  setup: Setup
  phase: Phase
}

export type OverlayCommand =
  | { type: 'start'; deviceId: string; sounds: boolean }
  | { type: 'stop' }
  | { type: 'cancel' }
  | { type: 'view'; view: OverlayView }
  /** What the speech model has heard so far, while you are still talking. */
  | { type: 'partial'; text: string }

export interface RecordedAudio {
  samples: Float32Array
  sampleRate: number
  /** How long the microphone took to deliver its first audio, in ms. */
  openMs?: number
}

export const DEFAULT_SETTINGS: Settings = {
  mode: 'hold',
  shortcut: 'CommandOrControl+Shift+Space',
  holdKey: 'Fn',
  micDeviceId: 'default',
  cleanup: 'claude',
  claudeModel: 'claude-haiku-5-5',
  style: 'auto',
  sounds: true,
  keepHistory: true,
  restoreClipboard: true,
  launchAtLogin: false,
  motion: 'system',
  theme: 'system',
  keepRecordings: false,
  polish: true,
}
