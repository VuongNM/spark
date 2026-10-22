import './migrate'
import { app, BrowserWindow, clipboard, globalShortcut, ipcMain, Menu, nativeTheme, shell, systemPreferences, Tray } from 'electron'
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AppState, DictEntry, HistoryEntry, Phase, Settings } from '../shared/types'
import { cleanText, testKey, warmClaude } from './cleanup'
import type { AppContext } from './context'
import { cancel, currentPhase, holdInput, initDictation, toggle } from './dictation'
import { formatAccelerator, holdKeyLabel } from '../shared/accelerator'
import { basicFormat } from './format'
import { setHoldKey, startHook, stopHook } from './keys'
import { downloadLlm, downloadModel, englishReady, ensureEnglishModel, llmStatus, modelDir, modelStatus } from './models'
import { unloadLocal, wantsLocal, warmLocal } from './local-llm'
import { accessibilityStatus, micStatus, openMicSettings, requestAccessibility, requestMic } from './permissions'
import { clearRecordings } from './recordings'
import * as store from './store'
import { transcribe, transcribePartial, warmUp } from './stt'
import { appIcon, createHub, createOverlay, nativeGlass, placeOverlay, trayIcon } from './windows'

const mac = process.platform === 'darwin'
const OPENABLE = new Set(['https://console.anthropic.com/settings/keys'])
const selftest = process.argv.find((a) => a.startsWith('--selftest='))?.split('=')[1]
const selftestClean = process.argv.find((a) => a.startsWith('--selftest-clean='))?.slice('--selftest-clean='.length)
const selftestLive = process.argv.find((a) => a.startsWith('--selftest-live='))?.split('=')[1]
const selftestRelease = process.argv.find((a) => a.startsWith('--selftest-release='))?.split('=')[1]
const screenshots = process.argv.find((a) => a.startsWith('--screenshots='))?.split('=')[1]

if (!selftest && !selftestClean && !selftestLive && !selftestRelease && !screenshots && !app.requestSingleInstanceLock()) app.quit()

let hub: BrowserWindow | null = null
let overlay: BrowserWindow
let tray: Tray | null = null
let quitting = false
let hotkey: AppState['setup']['hotkey'] = { ok: true }
/** Screenshots show the app as it looks once set up, whatever this Mac has granted so far. */
let asSetUp = false

const GLOBE: Record<string, AppState['setup']['globeKey']> = { '0': 'nothing', '1': 'input-source', '2': 'emoji', '3': 'dictation' }
let globeCache: { at: number; value: AppState['setup']['globeKey'] } = { at: 0, value: 'unknown' }
function globeKey(): AppState['setup']['globeKey'] {
  if (!mac) return 'n/a'
  if (Date.now() - globeCache.at < 2000) return globeCache.value
  let value: AppState['setup']['globeKey'] = 'emoji' // macOS default when never changed
  try {
    value = GLOBE[execFileSync('defaults', ['read', 'com.apple.HIToolbox', 'AppleFnUsageType'], { encoding: 'utf8' }).trim()] ?? 'unknown'
  } catch {
    // key absent: still the system default
  }
  globeCache = { at: Date.now(), value }
  return value
}

function state(): AppState {
  const { key, source } = store.loadApiKey()
  return {
    settings: store.getSettings(),
    phase: currentPhase(),
    setup: {
      platform: process.platform,
      glass: nativeGlass,
      systemReducedMotion: systemPreferences.getAnimationSettings().prefersReducedMotion,
      mic: asSetUp ? 'granted' : micStatus(),
      accessibility: asSetUp ? 'granted' : accessibilityStatus(),
      model: modelStatus(),
      localModel: llmStatus(),
      claude: { configured: !!key, source, keyHint: key ? `…${key.slice(-4)}` : '' },
      hotkey,
      globeKey: globeKey(),
    },
  }
}

function broadcast(): void {
  if (hub && !hub.isDestroyed()) hub.webContents.send('state', state())
}

function openHub(): void {
  if (!hub || hub.isDestroyed()) {
    hub = createHub()
    hub.on('close', (e) => {
      if (quitting) return
      e.preventDefault()
      hub?.hide()
    })
    hub.on('focus', () => void refreshPermissions())
    hub.once('ready-to-show', () => hub?.show())
  } else {
    hub.show()
    hub.focus()
  }
}

let hookWasAllowed = accessibilityStatus() === 'granted'
async function refreshPermissions(): Promise<void> {
  const allowed = accessibilityStatus() === 'granted'
  if (allowed && !hookWasAllowed) await applyHotkeys()
  hookWasAllowed = allowed
  broadcast()
}

async function applyHotkeys(): Promise<void> {
  if (currentPhase() === 'recording') return
  globalShortcut.unregisterAll()
  const s = store.getSettings()
  const label = formatAccelerator(s.shortcut, process.platform)
  let ok = false
  try {
    ok = globalShortcut.register(s.shortcut, toggle)
  } catch {
    ok = false
  }
  hotkey = ok ? { ok: true } : { ok: false, reason: 'taken', error: `Ứng dụng khác đang dùng ${label}. Chọn phím tắt khác.` }
  const handlers = {
    down: () => holdInput({ type: 'down' }),
    up: () => holdInput({ type: 'up' }),
    chord: (keycode: number) => holdInput({ type: 'chord', keycode }),
  }
  const holdStatus = await setHoldKey(s.mode === 'hold' ? s.holdKey : null, handlers)
  if (holdStatus === 'permission') hotkey = { ok: false, reason: 'permission', error: `Muốn giữ ${holdKeyLabel(s.holdKey, process.platform)} để nói, bạn cần bật Tự dán (Trợ năng).` }
  else if (holdStatus === 'unavailable') hotkey = { ok: false, reason: 'unavailable', error: `Spark không bắt được phím ${holdKeyLabel(s.holdKey, process.platform)}. Chọn phím khác trong Cài đặt.` }
  updateTray(currentPhase())
  broadcast()
}

function updateTray(phase: Phase): void {
  if (!tray) return
  const s = store.getSettings()
  const recording = phase === 'recording'
  tray.setImage(trayIcon(recording))
  tray.setToolTip(recording ? 'Spark — listening' : 'Spark')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: recording ? 'Dừng đọc' : 'Bắt đầu đọc', accelerator: s.shortcut, click: toggle },
      ...(recording ? [{ label: 'Huỷ', click: cancel }] : []),
      { type: 'separator' },
      { label: 'Mở Spark', click: openHub },
      { type: 'separator' },
      { label: 'Thoát Spark', click: () => app.quit() },
    ]),
  )
}

/** Only a signed, packaged app can register itself to open at login. */
function applyLoginItem(s: Settings): void {
  if (app.isPackaged && (mac || process.platform === 'win32')) app.setLoginItemSettings({ openAtLogin: s.launchAtLogin })
}

function registerIpc(): void {
  ipcMain.handle('state:get', () => state())
  ipcMain.handle('settings:update', async (_e, patch: Partial<Settings>) => {
    const before = store.getSettings()
    const after = store.updateSettings(patch)
    if (before.shortcut !== after.shortcut || before.mode !== after.mode || before.holdKey !== after.holdKey) {
      await applyHotkeys()
      if (!hotkey.ok && before.shortcut !== after.shortcut) {
        store.updateSettings({ shortcut: before.shortcut })
        const failed = hotkey
        await applyHotkeys()
        hotkey = failed
      }
    }
    if (before.launchAtLogin !== after.launchAtLogin) applyLoginItem(after)
    if (before.keepRecordings && !after.keepRecordings) clearRecordings()
    // Light/Dark for every window, the native glass included; 'system' follows macOS.
    if (before.theme !== after.theme) nativeTheme.themeSource = after.theme
    if (before.cleanup !== after.cleanup) void (wantsLocal(after.cleanup) ? warmLocal() : unloadLocal())
    return state()
  })
  ipcMain.handle('apikey:save', (_e, key: string | null) => {
    store.saveApiKey(key)
    return state()
  })
  ipcMain.handle('apikey:test', (_e, key?: string) => {
    const k = key?.trim() || store.loadApiKey().key
    if (!k) return { ok: false, message: 'Dán khoá vào trước đã.' }
    return testKey(k, store.getSettings().claudeModel)
  })
  ipcMain.handle('history:list', (_e, q: string) => store.listHistory(q))
  ipcMain.handle('history:delete', (_e, id: string) => store.deleteHistory(id))
  ipcMain.handle('history:clear', () => store.clearHistory())
  ipcMain.handle('history:restore', (_e, entry: HistoryEntry) => store.addHistory(entry))
  ipcMain.handle('dict:list', () => store.listDictionary())
  ipcMain.handle('dict:save', (_e, entries: DictEntry[]) => store.saveDictionary(entries))
  ipcMain.handle('llm:download', async () => {
    await downloadLlm(() => broadcast())
    if (wantsLocal(store.getSettings().cleanup)) void warmLocal()
    return state()
  })
  ipcMain.handle('model:download', async () => {
    await downloadModel(() => broadcast())
    if (modelStatus().state === 'ready') void warmUp()
    return state()
  })
  ipcMain.handle('perm:mic', async () => {
    await requestMic()
    return state()
  })
  ipcMain.handle('perm:mic-settings', () => openMicSettings())
  ipcMain.handle('perm:keyboard-settings', () => shell.openExternal('x-apple.systempreferences:com.apple.Keyboard-Settings.extension'))
  ipcMain.handle('perm:accessibility', () => {
    requestAccessibility()
    return state()
  })
  ipcMain.handle('app:open-data', () => shell.openPath(app.getPath('userData')))
  ipcMain.handle('app:open-url', (_e, url: string) => {
    if (OPENABLE.has(url)) void shell.openExternal(url)
  })
  ipcMain.handle('app:copy', (_e, text: string) => clipboard.writeText(text))
  ipcMain.handle('dictation:toggle', () => toggle())
  ipcMain.on('overlay:level', (_e, level: number) => {
    if (hub && !hub.isDestroyed() && hub.isVisible()) hub.webContents.send('level', level)
  })
  ipcMain.handle('format:preview', (_e, raw: string) => basicFormat(raw, store.listDictionary()))
}

function readWav(path: string): { samples: Float32Array; sampleRate: number } {
  const b = readFileSync(path)
  let off = 12
  let rate = 16000
  let bits = 16
  let channels = 1
  while (off < b.length - 8) {
    const id = b.toString('ascii', off, off + 4)
    const len = b.readUInt32LE(off + 4)
    if (id === 'fmt ') {
      channels = b.readUInt16LE(off + 10)
      rate = b.readUInt32LE(off + 12)
      bits = b.readUInt16LE(off + 22)
    } else if (id === 'data') {
      const n = len / (bits / 8) / channels
      const out = new Float32Array(n)
      for (let i = 0; i < n; i++) {
        const p = off + 8 + i * channels * (bits / 8)
        out[i] = bits === 16 ? b.readInt16LE(p) / 32768 : b.readFloatLE(p)
      }
      return { samples: out, sampleRate: rate }
    }
    off += 8 + len + (len % 2)
  }
  throw new Error('No audio data in WAV file')
}

/** Cleanup engine for self-tests: `--cleanup=local|claude|basic`, else the saved setting. */
function selftestMode(): Settings['cleanup'] {
  const flag = process.argv.find((a) => a.startsWith('--cleanup='))?.split('=')[1]
  return flag === 'local' || flag === 'claude' || flag === 'basic' ? flag : store.getSettings().cleanup
}

/** The app self-tests pretend to type into: `--app=code` is a code editor (technical style), else Notes. */
function selftestApp(): AppContext {
  return process.argv.includes('--app=code') ? { name: 'Cursor', bundleId: 'com.todesktop.230313mzl4w4u92', category: 'code' } : { name: 'Notes', bundleId: 'com.apple.Notes', category: 'docs' }
}

/**
 * `electron . --selftest=<wav>[,<wav>…]` runs the whole pipeline (both speech models, then cleanup with
 * the saved key) on each file and exits; used to verify native modules and measure each step.
 */
async function runSelftest(paths: string): Promise<void> {
  try {
    console.log('[selftest] model:', modelDir(), modelStatus().state, englishReady() ? '+ english' : '(no english)')
    if (modelStatus().state !== 'ready') await downloadModel((s) => console.log(`[selftest] download ${Math.round(s.progress * 100)}%`))
    if (!englishReady()) console.log(`[selftest] english download ${(await ensureEnglishModel()) ? 'ok' : 'FAILED'}`)
    const t0 = Date.now()
    await warmUp()
    if (wantsLocal(selftestMode())) await warmLocal()
    console.log(`[selftest] models loaded in ${Date.now() - t0} ms`)
    const s = store.getSettings()
    const { key } = store.loadApiKey()
    const ctx = selftestApp()
    for (const path of paths.split(',')) {
      const { samples, sampleRate } = readWav(path)
      warmClaude()
      const t1 = Date.now()
      const { text: raw, english } = await transcribe(samples, sampleRate)
      const sttMs = Date.now() - t1
      const res = await cleanText(raw, { mode: selftestMode(), key, model: s.claudeModel, style: 'auto', polish: s.polish, app: ctx, dict: store.listDictionary(), english })
      console.log(`\n[selftest] ${path.split('/').pop()} ${(samples.length / sampleRate).toFixed(1)}s · stt ${sttMs} ms · ${res.cleanedBy}${res.fallbackReason ? ` (${res.fallbackReason})` : ''} ${res.ms} ms`)
      console.log(`  vi:  ${raw}`)
      console.log(`  en:  ${english ?? '—'}`)
      console.log(`  out: ${res.text.replace(/\n/g, '\n       ')}`)
      if (res.rejected) console.log(`  rejected: ${res.rejected}`)
    }
    console.log(`\n[selftest] hook:  ${(await startHook()) ? 'started' : 'not allowed (accessibility)'}`)
    app.exit(0)
  } catch (e) {
    console.error('[selftest] FAILED', e)
    app.exit(1)
  }
}

/**
 * `SPARK_DATA_DIR=<demo data> electron . --screenshots=<dir>` saves PNGs of every hub page in light
 * and dark, and of the bubble while it writes (no microphone involved), for the README and the blog.
 * The demo data folder keeps your own history out of the pictures.
 */
async function runScreenshots(dir: string): Promise<void> {
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
  const save = async (win: BrowserWindow, name: string) => {
    writeFileSync(join(dir, `${name}.png`), (await win.webContents.capturePage()).toPNG())
    console.log(`[screenshots] ${name}.png`)
  }
  asSetUp = true
  try {
    mkdirSync(dir, { recursive: true })
    registerIpc()
    overlay = createOverlay()
    openHub()
    await new Promise<void>((r) => hub!.once('ready-to-show', () => r()))
    await wait(1500)
    for (const theme of ['light', 'dark'] as const) {
      store.updateSettings({ theme })
      nativeTheme.themeSource = theme
      broadcast()
      for (const [i, page] of ['home', 'history', 'dictionary', 'settings'].entries()) {
        await hub!.webContents.executeJavaScript(`document.querySelectorAll('.nav-item')[${i}].click()`)
        await wait(1600)
        await save(hub!, `hub-${page}-${theme}`)
      }
      // Settings again, at the choice between Gemma on the Mac and Claude.
      await hub!.webContents.executeJavaScript(`document.getElementById('cleanup-title').scrollIntoView({ block: 'start' })`)
      await wait(600)
      await save(hub!, `hub-cleanup-${theme}`)
    }
    placeOverlay(overlay)
    overlay.showInactive()
    overlay.webContents.send('overlay:command', { type: 'view', view: { phase: 'cleaning' } })
    overlay.webContents.send('overlay:command', { type: 'partial', text: 'phích cái bắp ở file index chấm ts rồi commit và tút lên bờ ran may nhé' })
    await wait(1200)
    await save(overlay, 'bubble')
    app.exit(0)
  } catch (e) {
    console.error('[screenshots] FAILED', e)
    app.exit(1)
  }
}

app.on('second-instance', () => openHub())
app.on('activate', () => openHub())
app.on('window-all-closed', () => {
  // keep running in the tray / menu bar
})
app.on('before-quit', () => {
  quitting = true
})
app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  stopHook()
})

/**
 * `electron . --selftest-clean="<raw>[ >> <english hearing>][ | <raw>…]"` runs the cleanup step with the
 * saved key on each transcript and prints the result and timing.
 */
async function runCleanSelftest(input: string): Promise<void> {
  const s = store.getSettings()
  const { key, source } = store.loadApiKey()
  console.log(`[selftest] cleanup ${selftestMode()}, Claude ${s.claudeModel}, key ${source}`)
  if (wantsLocal(selftestMode())) await warmLocal()
  for (const item of input.split('|')) {
    const [raw, english] = item.split('>>').map((x) => x.trim())
    const res = await cleanText(raw, { mode: selftestMode(), key, model: s.claudeModel, style: 'auto', polish: s.polish, app: selftestApp(), dict: store.listDictionary(), english })
    console.log(`\n[selftest] ${res.cleanedBy}${res.fallbackReason ? ` (fallback: ${res.fallbackReason})` : ''} in ${res.ms} ms\n  in:  ${raw}${english ? `\n  en:  ${english}` : ''}\n  out: ${res.text.replace(/\n/g, '\n       ')}${res.rejected ? `\n  rejected: ${res.rejected}` : ''}`)
  }
  app.exit(0)
}

/**
 * `electron . --selftest-live=<wav>` plays a WAV in 300 ms slices, the way the bubble streams audio
 * while you talk, and prints each live read (what the bubble would show) with how long it took.
 */
async function runLiveSelftest(path: string): Promise<void> {
  await warmUp()
  const { samples, sampleRate } = readWav(path)
  const slice = Math.round(sampleRate * 0.3)
  for (let end = slice; end < samples.length + slice; end += slice) {
    const heard = samples.subarray(Math.max(0, Math.min(end, samples.length) - sampleRate * 12), Math.min(end, samples.length))
    const t0 = Date.now()
    const text = await transcribePartial(heard, sampleRate)
    console.log(`[live] ${(Math.min(end, samples.length) / sampleRate).toFixed(1)}s heard · read in ${Date.now() - t0} ms · ${text.toLocaleLowerCase('vi')}`)
  }
  app.exit(0)
}

/**
 * `electron . --selftest-release=<wav>[,<wav>…]` times what happens after you let go of the key:
 * the old way (record the 200 ms tail, read, then clean up) against starting the cleanup at release
 * from what was heard so far. Each clip runs twice: released right at the last word, and after a
 * 0.4 s pause. Uses the saved Claude key and cleanup setting.
 */
async function runReleaseSelftest(paths: string): Promise<void> {
  await warmUp()
  if (wantsLocal(store.getSettings().cleanup)) await warmLocal()
  const s = store.getSettings()
  const { key } = store.loadApiKey()
  const opts = (english?: string) => ({ mode: s.cleanup, key, model: s.claudeModel, style: s.style, polish: s.polish, app: { name: 'Notes', bundleId: 'com.apple.Notes', category: 'docs' as const }, dict: store.listDictionary(), english })
  const TAIL = 200
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
  const same = (a: string, b: string) => a.toLocaleLowerCase('vi').split(/\s+/).join(' ') === b.toLocaleLowerCase('vi').split(/\s+/).join(' ')
  for (const path of paths.split(',')) {
    const clip = readWav(path)
    for (const pause of [0, 0.4]) {
      const pad = Math.round(clip.sampleRate * pause)
      const full = new Float32Array(clip.samples.length + pad + Math.round((clip.sampleRate * TAIL) / 1000))
      full.set(clip.samples)
      const heardAtRelease = full.subarray(0, clip.samples.length + pad)
      // Old: tail, read, clean.
      let t0 = Date.now()
      await wait(TAIL)
      const a = await transcribe(full, clip.sampleRate)
      await cleanText(a.text, opts(a.english))
      const oldMs = Date.now() - t0
      // New: after a pause the cleanup started ~0.3 s before release (two identical live reads);
      // released right at the last word, it starts at release from what was heard so far.
      const ahead = pause > 0 ? 300 : 0
      t0 = Date.now()
      const earlyHeard = transcribe(heardAtRelease, clip.sampleRate)
      const earlyClean = earlyHeard.then((t) => cleanText(t.text, opts(t.english)))
      await wait(ahead)
      const released = Date.now()
      await wait(TAIL)
      const fin = await transcribe(full, clip.sampleRate)
      const match = same((await earlyHeard).text, fin.text)
      const res = match ? await earlyClean : await cleanText(fin.text, opts(fin.english))
      const newMs = Date.now() - released
      void t0
      console.log(`[release] ${path.split('/').pop()} pause ${pause}s · old ${oldMs} ms → new ${newMs} ms · early ${match ? 'used' : 'missed'} · ${res.cleanedBy} · ${res.text.slice(0, 60)}`)
    }
  }
  app.exit(0)
}

app.whenReady().then(async () => {
  if (selftest) return runSelftest(selftest)
  if (selftestClean) return runCleanSelftest(selftestClean)
  if (selftestLive) return runLiveSelftest(selftestLive)
  if (selftestRelease) return runReleaseSelftest(selftestRelease)
  if (screenshots) return runScreenshots(screenshots)
  nativeTheme.themeSource = store.getSettings().theme
  // The on-device model takes longest to load (~3 s), so it starts first.
  if (wantsLocal(store.getSettings().cleanup)) void warmLocal()

  Menu.setApplicationMenu(
    Menu.buildFromTemplate([...(mac ? [{ role: 'appMenu' as const }] : []), { role: 'editMenu' as const }, { role: 'windowMenu' as const }]),
  )
  registerIpc()
  overlay = createOverlay()
  initDictation({
    overlay: () => overlay,
    openHub,
    onPhase: (p) => {
      updateTray(p)
      broadcast()
    },
    onEntry: (entry) => hub?.webContents.send('history:new', entry),
  })

  if (mac) app.dock?.setIcon(appIcon)
  tray = new Tray(trayIcon(false))
  if (!mac) tray.on('click', openHub)
  await applyHotkeys()
  // Pick up permissions granted in System Settings without needing a restart or window focus.
  setInterval(() => {
    if (accessibilityStatus() !== 'granted' || micStatus() !== 'granted' || hookWasAllowed !== (accessibilityStatus() === 'granted')) void refreshPermissions()
  }, 2000)
  if (modelStatus().state === 'ready') void ensureEnglishModel().then(() => warmUp())
  applyLoginItem(store.getSettings())
  openHub()
})
