import type { SparkApi } from '../../preload/api'
import { type AppState, DEFAULT_SETTINGS, type DictEntry, type HistoryEntry } from '../../shared/types'

/** Browser-only stand-in for the Electron bridge so the UI can be previewed in a normal tab. ?setup=fresh shows first run. */
export function installMock(): void {
  const fresh = new URLSearchParams(location.search).get('setup') === 'fresh'
  document.documentElement.dataset.mock = '1'
  const listeners = new Set<(s: AppState) => void>()
  const now = Date.now()
  let history: HistoryEntry[] = fresh
    ? []
    : [
        { id: '1', createdAt: now - 60_000, app: 'Slack', durationSec: 6.2, raw: 'ỜỜ CHIỀU NAY BA GIỜ MÌNH HỌP VỚI BÊN LÔ GI CỒ NHÉ', text: 'Chiều nay 3 giờ mình họp với bên Lawgical nhé.', cleanedBy: 'claude', inserted: 'paste', sttMs: 92, cleanupMs: 1180 },
        { id: '2', createdAt: now - 3_600_000, app: 'Mail', durationSec: 11.4, raw: 'GỬI ANH NAM ỪM EM GỬI ANH BÁO CÁO THÁNG MƯỜI', text: 'Gửi anh Nam, em gửi anh báo cáo tháng 10.', cleanedBy: 'claude', inserted: 'paste', sttMs: 120, cleanupMs: 1420 },
        { id: '3', createdAt: now - 86_400_000, app: 'Notes', durationSec: 4.1, raw: 'MAI ĐI CHỢ MUA RAU', text: 'Mai đi chợ mua rau.', cleanedBy: 'basic', fallbackReason: 'offline', inserted: 'clipboard', sttMs: 70, cleanupMs: 3 },
      ]
  let dict: DictEntry[] = fresh ? [] : [{ id: 'd1', word: 'Lawgical', heardAs: ['lô gi cồ'] }]
  let state: AppState = {
    settings: { ...DEFAULT_SETTINGS, onboarded: !fresh },
    phase: 'idle',
    setup: {
      platform: navigator.platform.toLowerCase().includes('win') ? 'win32' : 'darwin',
      glass: true,
      systemReducedMotion: false,
      mic: fresh ? 'not-determined' : 'granted',
      accessibility: fresh ? 'denied' : 'granted',
      model: { state: fresh ? 'missing' : 'ready', progress: fresh ? 0 : 1, sizeMb: 34 },
      localModel: { state: 'missing', progress: 0, sizeMb: 3107 },
      claude: fresh ? { configured: false, source: 'none', keyHint: '' } : { configured: true, source: 'saved', keyHint: '…x7Qa' },
      hotkey: { ok: true },
      globeKey: 'input-source',
    },
  }
  const set = (patch: Partial<AppState>) => {
    state = { ...state, ...patch }
    listeners.forEach((l) => l(state))
    return state
  }
  const historyListeners = new Set<(e: HistoryEntry) => void>()
  const levelListeners = new Set<(l: number) => void>()
  setInterval(() => {
    if (state.phase !== 'recording') return
    // Speech-like: ~4.5 syllables a second with short gaps, louder and softer words.
    const t = performance.now() / 1000
    const phase = (t * 4.5) % 1
    const syllable = phase < 0.62 ? Math.sin((phase / 0.62) * Math.PI) : 0
    const l = 0.03 + syllable * (0.32 + 0.18 * Math.sin(t * 1.3)) + Math.random() * 0.03
    levelListeners.forEach((cb) => cb(l))
  }, 16)

  const api: SparkApi = {
    getState: async () => state,
    onState: (cb) => (listeners.add(cb), () => listeners.delete(cb)),
    updateSettings: async (patch) => set({ settings: { ...state.settings, ...patch } }),
    saveApiKey: async (key) => set({ setup: { ...state.setup, claude: key ? { configured: true, source: 'saved', keyHint: `…${key.slice(-4)}` } : { configured: false, source: 'none', keyHint: '' } } }),
    testApiKey: async () => ({ ok: true, message: 'Dùng được. Claude trả về: “Xin chào, mình là Spark.”' }),
    listHistory: async (q) => history.filter((h) => h.text.toLowerCase().includes(q.toLowerCase())),
    deleteHistory: async (id) => void (history = history.filter((h) => h.id !== id)),
    clearHistory: async () => void (history = []),
    restoreHistory: async (e) => void (history = [e, ...history].sort((a, b) => b.createdAt - a.createdAt)),
    onHistory: (cb) => (historyListeners.add(cb), () => historyListeners.delete(cb)),
    onLevel: (cb) => (levelListeners.add(cb), () => levelListeners.delete(cb)),
    listDictionary: async () => dict,
    saveDictionary: async (entries) => (dict = entries),
    downloadModel: async () => {
      for (let p = 0; p <= 1; p += 0.1) {
        set({ setup: { ...state.setup, model: { state: 'downloading', progress: p, sizeMb: 34 } } })
        await new Promise((r) => setTimeout(r, 150))
      }
      return set({ setup: { ...state.setup, model: { state: 'ready', progress: 1, sizeMb: 34 } } })
    },
    downloadLocalModel: async () => {
      for (let p = 0; p <= 1; p += 0.05) {
        set({ setup: { ...state.setup, localModel: { state: 'downloading', progress: p, sizeMb: 3107 } } })
        await new Promise((r) => setTimeout(r, 120))
      }
      return set({ setup: { ...state.setup, localModel: { state: 'ready', progress: 1, sizeMb: 3107 } } })
    },
    requestMic: async () => set({ setup: { ...state.setup, mic: 'granted' } }),
    openMicSettings: async () => {},
    openKeyboardSettings: async () => {},
    requestAccessibility: async () => set({ setup: { ...state.setup, accessibility: 'granted' } }),
    openDataFolder: async () => '',
    openUrl: async () => {},
    copy: async (text) => void navigator.clipboard?.writeText(text).catch(() => {}),
    toggleDictation: async () => {
      if (state.phase !== 'recording') return void set({ phase: 'recording' })
      set({ phase: 'cleaning' })
      await new Promise((r) => setTimeout(r, 700))
      const said = document.querySelector('.sample blockquote')?.textContent
      const text = said ? said.replace(/^Ờ, |ừm, /g, '').replace('ba giờ', '3 giờ') : 'Xin chào, mình đang thử Spark.'
      const raw = (said ?? 'xin chào mình đang thử spark').replace(/[,.:]/g, '').toLocaleUpperCase('vi')
      const entry: HistoryEntry = { id: crypto.randomUUID(), createdAt: Date.now(), app: 'Spark', durationSec: 3.4, raw, text, cleanedBy: state.setup.claude.configured ? 'claude' : 'basic', inserted: 'clipboard', sttMs: 80, cleanupMs: 900 }
      history = [entry, ...history]
      historyListeners.forEach((l) => l(entry))
      set({ phase: 'idle' })
    },
    overlay: { onCommand: () => () => {}, sendAudio: async () => {}, micError: () => {}, level: () => {}, partialAudio: () => {} },
  }
  window.spark = api
}
