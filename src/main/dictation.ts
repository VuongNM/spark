import { type BrowserWindow, globalShortcut, ipcMain } from 'electron'
import { randomUUID } from 'node:crypto'
import type { HistoryEntry, OverlayCommand, OverlayView, Phase, RecordedAudio } from '../shared/types'
import { type CleanResult, cleanText, warmClaude } from './cleanup'
import { wantsLocal, warmLocal } from './local-llm'
import { type AppContext, frontmostApp } from './context'
import { words } from './format'
import { type HoldEvent, initialHold, onHold } from './hold'
import { insertText, snapshotClipboard } from './insert'
import { saveRecording } from './recordings'
import { modelStatus } from './models'
import { micStatus, requestMic } from './permissions'
import { addHistory, getSettings, listDictionary, loadApiKey } from './store'
import { type Transcript, transcribe, transcribePartial, warmUp } from './stt'
import { placeOverlay } from './windows'

const MAX_RECORDING_MS = 5 * 60_000
/** A held key shows the overlay only after this long, so stray taps never flash anything. */
const QUIET_START_MS = 90
const paste = process.platform === 'darwin' ? '⌘V' : 'Ctrl+V'

interface Deps {
  overlay: () => BrowserWindow
  openHub: () => void
  onPhase: (phase: Phase) => void
  onEntry: (entry: HistoryEntry) => void
}

let deps: Deps
let phase: Phase = 'idle'
let startedAt = 0
let handsFree = false
let hold = initialHold()
let appContext: Promise<AppContext> = Promise.resolve({ name: '', bundleId: '', category: 'other' })
let pendingAudio: ((audio: RecordedAudio) => void) | null = null
let maxTimer: NodeJS.Timeout | undefined
let hideTimer: NodeJS.Timeout | undefined
let showTimer: NodeJS.Timeout | undefined

// Live words: the bubble streams new audio while you talk; the last stretch is re-read whenever the
// previous read is done (~0.1 s each) and what was heard so far goes back to the bubble.
const LIVE_WINDOW_SEC = 12
let liveAudio: Float32Array[] = []
let liveLength = 0
let liveRate = 16000
let liveDirty = false
let liveSession = 0
let liveRun: Promise<void> | null = null

function resetLive(): void {
  liveAudio = []
  liveLength = 0
  liveDirty = false
  liveSession++
}

/** The last `seconds` of what the bubble has streamed so far (all of it when omitted). */
function liveSamples(seconds?: number): Float32Array {
  const want = seconds === undefined ? liveLength : Math.min(liveLength, Math.round(seconds * liveRate))
  const out = new Float32Array(want)
  let end = want
  for (let i = liveAudio.length - 1; i >= 0 && end > 0; i--) {
    const c = liveAudio[i]
    const take = Math.min(c.length, end)
    out.set(c.subarray(c.length - take), end - take)
    end -= take
  }
  return out
}

// Cleaning ahead: the cleanup is the slow step (~1 s with Claude), so Spark starts it before you let go.
// - While you talk: whenever you pause (the live words stay the same for two reads), those words go
//   to cleanup.
// - At release: the bubble flushes everything heard so far; Spark reads it and cleans that, while the
//   last 200 ms are still being recorded.
// Cleanups are keyed by their words, so the final read reuses whichever one has the same words; when
// you let go after a pause, the result is usually already there.
let started = new Map<string, Promise<CleanResult | null>>()
let lastPartial = ''
let flushed: Promise<Transcript | null> | null = null
let awaitingFlush = false

function cleanFor(raw: string, english?: string): Promise<CleanResult | null> {
  const key = words(raw).join(' ')
  if (!key) return Promise.resolve(null)
  let job = started.get(key)
  if (!job) {
    const s = getSettings()
    job = appContext
      .then((app) => cleanText(raw, { mode: s.cleanup, key: loadApiKey().key, model: s.claudeModel, style: s.style, polish: s.polish, app, dict: listDictionary(), english }))
      .catch(() => null)
    started.set(key, job)
  }
  return job
}

function resetAhead(): void {
  started = new Map()
  lastPartial = ''
  flushed = null
  awaitingFlush = false
}

/** At release: read everything heard so far and start cleaning it. */
function startFlushed(): void {
  const audio = liveSamples()
  if (audio.length < liveRate * 0.3) return
  const rate = liveRate
  flushed = (async () => {
    if (liveRun) await liveRun
    const t = await transcribe(audio, rate)
    if (words(t.text).length) void cleanFor(t.text, t.english)
    return t
  })().catch(() => null)
}

function pumpLive(): void {
  if (liveRun || !liveDirty || phase !== 'recording') return
  liveDirty = false
  const audio = liveSamples(LIVE_WINDOW_SEC)
  if (audio.length < liveRate * 0.4) return
  const session = liveSession
  liveRun = transcribePartial(audio, liveRate)
    .then((text) => {
      if (session !== liveSession || phase !== 'recording' || !text) return
      send({ type: 'partial', text: text.toLocaleLowerCase('vi') })
      // A pause: the same words twice in a row. Clean them now, so letting go here finds them ready.
      const whole = liveLength <= LIVE_WINDOW_SEC * liveRate
      if (whole && words(text).join(' ') === words(lastPartial).join(' ')) void cleanFor(text)
      lastPartial = text
    })
    .catch(() => undefined)
    .finally(() => {
      liveRun = null
      setTimeout(pumpLive, 100)
    })
}

export const currentPhase = (): Phase => phase

function send(cmd: OverlayCommand): void {
  const o = deps.overlay()
  if (!o.isDestroyed()) o.webContents.send('overlay:command', cmd)
}

function view(extra: Partial<OverlayView> = {}): void {
  send({ type: 'view', view: { phase, startedAt, handsFree, ...extra } })
}

function setPhase(p: Phase, extra: Partial<OverlayView> = {}): void {
  phase = p
  deps.onPhase(p)
  view(extra)
}

function showOverlay(): void {
  clearTimeout(showTimer)
  const o = deps.overlay()
  placeOverlay(o)
  o.showInactive()
}

/** Back to idle: overlay hidden and, whatever state the recorder is in, the microphone off. */
function goIdle(): void {
  clearTimeout(showTimer)
  clearTimeout(maxTimer)
  if (globalShortcut.isRegistered('Escape')) globalShortcut.unregister('Escape')
  send({ type: 'cancel' })
  pendingAudio = null
  resetLive()
  resetAhead()
  handsFree = false
  hold = initialHold()
  deps.overlay().hide()
  if (phase !== 'idle') {
    phase = 'idle'
    deps.onPhase('idle')
  }
}

function hideLater(ms: number): void {
  clearTimeout(hideTimer)
  hideTimer = setTimeout(goIdle, ms)
}

function fail(message: string, openHub = false): void {
  clearTimeout(showTimer)
  clearTimeout(maxTimer)
  if (globalShortcut.isRegistered('Escape')) globalShortcut.unregister('Escape')
  send({ type: 'cancel' })
  pendingAudio = null
  hold = initialHold()
  showOverlay()
  setPhase('error', { message })
  hideLater(3500)
  if (openHub) deps.openHub()
}

export function initDictation(d: Deps): void {
  deps = d
  ipcMain.handle('overlay:audio', (_e, audio: RecordedAudio) => {
    pendingAudio?.(audio)
    pendingAudio = null
  })
  ipcMain.on('overlay:partial-audio', (_e, a: { samples: Float32Array; sampleRate: number; final?: boolean }) => {
    if (!a?.samples) return
    if (a.final ? !awaitingFlush : phase !== 'recording') return
    liveRate = a.sampleRate
    if (a.samples.length) {
      liveAudio.push(a.samples)
      liveLength += a.samples.length
    }
    if (a.final) {
      awaitingFlush = false
      startFlushed()
    } else {
      liveDirty = true
      pumpLive()
    }
  })
  ipcMain.on('overlay:mic-error', (_e, message: string) => {
    if (phase === 'recording') fail(`Micro gặp lỗi: ${message}`, true)
  })
}

/** Starts recording right away (no awaits), so a quick key release can never race it. */
export function start(opts: { quiet?: boolean } = {}): void {
  if (phase === 'recording' || phase === 'transcribing' || phase === 'cleaning') return
  clearTimeout(hideTimer)
  if (modelStatus().state !== 'ready') return fail('Chưa tải bộ nhận giọng. Mở Spark để thiết lập.', true)
  if (micStatus() === 'not-determined') {
    void requestMic()
    return fail('Cho phép micro rồi thử lại.')
  }
  if (micStatus() === 'denied') return fail('macOS đang chặn micro. Mở Spark để cho phép.', true)

  const s = getSettings()
  void warmUp()
  if (wantsLocal(s.cleanup)) void warmLocal()
  if (s.cleanup !== 'basic') warmClaude()
  appContext = frontmostApp()
  startedAt = Date.now()
  resetLive()
  resetAhead()
  handsFree = !opts.quiet
  phase = 'recording'
  deps.onPhase('recording')
  send({ type: 'start', deviceId: s.micDeviceId, sounds: s.sounds })
  const reveal = () => {
    showOverlay()
    view()
  }
  if (opts.quiet) showTimer = setTimeout(reveal, QUIET_START_MS)
  else reveal()
  globalShortcut.register('Escape', cancel)
  maxTimer = setTimeout(() => void stop(), MAX_RECORDING_MS)
}

export function cancel(): void {
  if (phase !== 'recording') return
  goIdle()
}

export function toggle(): void {
  if (phase === 'recording') void stop()
  else start()
}

/** Push-to-talk key events (Fn, or the chosen hold key). */
export function holdInput(ev: HoldEvent): void {
  const [next, action] = onHold(hold, ev, Date.now(), phase === 'recording')
  hold = next
  if (action === 'start') start({ quiet: true })
  else if (action === 'stop') void stop()
  else if (action === 'cancel') cancel()
  else if (action === 'lock') {
    handsFree = true
    showOverlay()
    view()
  }
}

export async function stop(): Promise<void> {
  if (phase !== 'recording') return
  clearTimeout(showTimer)
  clearTimeout(maxTimer)
  if (globalShortcut.isRegistered('Escape')) globalShortcut.unregister('Escape')
  hold = { ...hold, owns: false, handsFree: false }
  const released = Date.now()
  flushed = null
  awaitingFlush = true
  showOverlay()
  setPhase('transcribing')
  const settings = getSettings()
  // Work that doesn't depend on the audio runs during the recording tail and speech-to-text.
  if (settings.cleanup !== 'basic') warmClaude()
  const clipboardBefore = settings.restoreClipboard ? snapshotClipboard() : null
  try {
    const audio = await new Promise<RecordedAudio>((resolve, reject) => {
      pendingAudio = resolve
      send({ type: 'stop' })
      setTimeout(() => reject(new Error('Micro không gửi âm thanh về.')), 5000)
    })
    awaitingFlush = false
    const durationSec = audio.samples.length / audio.sampleRate
    if (durationSec < 0.3) return fail('Ngắn quá. Giữ phím trong lúc nói.')

    resetLive()
    if (liveRun) await liveRun // one read at a time on the speech model
    const t0 = Date.now()
    const { text: raw, english } = await transcribe(audio.samples, audio.sampleRate)
    const sttMs = Date.now() - t0
    if (words(raw).length === 0) return fail('Không nghe rõ. Thử nói gần micro hơn.')

    setPhase('cleaning')
    const s = getSettings()
    const app = await appContext
    const dict = listDictionary()
    // Reuse a cleanup started ahead (at a pause, or at release) when it has the same words.
    if (flushed) await flushed
    const usedEarly = started.has(words(raw).join(' '))
    let result = await cleanFor(raw, english)
    result ??= await cleanText(raw, { mode: s.cleanup, key: loadApiKey().key, model: s.claudeModel, style: s.style, polish: s.polish, app, dict, english })
    if (!result.text) return fail('Chỉ nghe thấy ờ, ừm nên không có gì để gõ.')

    const inserted = await insertText(result.text, clipboardBefore)
    const latencyMs = Date.now() - released
    const entry: HistoryEntry = {
      id: randomUUID(),
      createdAt: Date.now(),
      app: app.name,
      durationSec: Math.round(durationSec * 10) / 10,
      raw,
      english,
      text: result.text,
      cleanedBy: result.cleanedBy,
      fallbackReason: result.fallbackReason,
      inserted,
      sttMs,
      cleanupMs: result.ms,
      micMs: audio.openMs,
      latencyMs,
      early: usedEarly,
    }
    if (s.keepHistory) addHistory(entry)
    if (s.keepRecordings) {
      try {
        saveRecording(audio, entry.id, raw)
      } catch (e) {
        console.error('[spark] could not save recording:', e)
      }
    }
    deps.onEntry(entry)

    const fellBack = s.cleanup !== 'basic' && result.cleanedBy === 'basic'
    // A plain paste needs no words (the bubble flashes green); say something only when it matters.
    const message = inserted === 'paste' ? (fellBack ? 'Đã dán, chỉ dọn cơ bản' : undefined) : `Đã copy · nhấn ${paste} để dán`
    setPhase('done', { message })
    hideLater(inserted === 'paste' ? (message ? 2200 : 1000) : 3200)
  } catch (e) {
    fail(e instanceof Error ? e.message : 'Có lỗi. Thử lại nhé.')
  }
}
