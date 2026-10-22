import type { AppState, DictEntry, HistoryEntry, OverlayCommand, RecordedAudio, Settings } from '../shared/types'

export interface SparkApi {
  getState(): Promise<AppState>
  onState(cb: (s: AppState) => void): () => void
  updateSettings(patch: Partial<Settings>): Promise<AppState>
  saveApiKey(key: string | null): Promise<AppState>
  testApiKey(key?: string): Promise<{ ok: boolean; message: string }>
  listHistory(query: string): Promise<HistoryEntry[]>
  deleteHistory(id: string): Promise<void>
  clearHistory(): Promise<void>
  restoreHistory(entry: HistoryEntry): Promise<void>
  onHistory(cb: (e: HistoryEntry) => void): () => void
  onLevel(cb: (level: number) => void): () => void
  listDictionary(): Promise<DictEntry[]>
  saveDictionary(entries: DictEntry[]): Promise<DictEntry[]>
  downloadModel(): Promise<AppState>
  downloadLocalModel(): Promise<AppState>
  requestMic(): Promise<AppState>
  openMicSettings(): Promise<void>
  openKeyboardSettings(): Promise<void>
  requestAccessibility(): Promise<AppState>
  openDataFolder(): Promise<string>
  openUrl(url: string): Promise<void>
  copy(text: string): Promise<void>
  toggleDictation(): Promise<void>
  overlay: {
    onCommand(cb: (c: OverlayCommand) => void): () => void
    sendAudio(audio: RecordedAudio): Promise<void>
    micError(message: string): void
    level(value: number): void
    /** New audio since the last call, for live words while recording; `final` is the flush at the moment of release. */
    partialAudio(samples: Float32Array, sampleRate: number, final?: boolean): void
  }
}

declare global {
  interface Window {
    spark: SparkApi
  }
}
