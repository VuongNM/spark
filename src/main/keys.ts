import { systemPreferences } from 'electron'
import type { HoldKey } from '../shared/types'
import { startFn, stopFn } from './fn'

export interface HoldHandlers {
  down: () => void
  up: () => void
  chord: (keycode: number) => void
}

type Hook = typeof import('uiohook-napi')
let hook: Hook | null = null
let started = false
const held = new Set<number>()
let holdHandler: { code: number; h: HoldHandlers } | null = null

async function lib(): Promise<Hook | null> {
  if (hook) return hook
  try {
    const mod = await import('uiohook-napi')
    hook = ((mod as { default?: Hook }).default ?? mod) as Hook
  } catch (e) {
    console.error('[spark] keyboard hook unavailable:', e)
  }
  return hook
}

export const hookAllowed = (): boolean => process.platform !== 'darwin' || systemPreferences.isTrustedAccessibilityClient(false)

/** Starts the global keyboard listener. On macOS this needs Accessibility permission. */
export async function startHook(): Promise<boolean> {
  if (started) return true
  if (!hookAllowed()) return false
  const h = await lib()
  if (!h) return false
  try {
    h.uIOhook.removeAllListeners('keydown')
    h.uIOhook.removeAllListeners('keyup')
    h.uIOhook.on('keydown', (e) => {
      const repeat = held.has(e.keycode)
      held.add(e.keycode)
      if (!holdHandler || repeat) return
      if (e.keycode === holdHandler.code) holdHandler.h.down()
      else if (held.has(holdHandler.code)) holdHandler.h.chord(e.keycode)
    })
    h.uIOhook.on('keyup', (e) => {
      held.delete(e.keycode)
      if (holdHandler && e.keycode === holdHandler.code) holdHandler.h.up()
    })
    h.uIOhook.start()
    started = true
  } catch (e) {
    console.error('[spark] could not start keyboard hook:', e)
  }
  return started
}

/** Routes push-to-talk events from the chosen key: Fn via the native watcher, other keys via the hook. */
export async function setHoldKey(key: HoldKey | null, handlers: HoldHandlers): Promise<'ok' | 'permission' | 'unavailable'> {
  holdHandler = null
  if (key !== 'Fn') stopFn()
  if (!key) return 'ok'
  if (!hookAllowed()) return 'permission'
  if (key === 'Fn') {
    if (process.platform !== 'darwin') return 'unavailable'
    const status = await startFn(handlers)
    return status === 'ready' ? 'ok' : status === 'permission' ? 'permission' : 'unavailable'
  }
  const h = await lib()
  if (!h || !(await startHook())) return 'unavailable'
  holdHandler = { code: h.UiohookKey[key], h: handlers }
  return 'ok'
}

/** Waits until shortcut modifiers are let go, so the paste isn't read as ⌘⇧V or similar. */
export async function waitForModifiersReleased(timeoutMs = 800): Promise<void> {
  if (!started || !hook) return
  const K = hook.UiohookKey
  const mods = [K.Shift, K.ShiftRight, K.Ctrl, K.CtrlRight, K.Alt, K.AltRight, K.Meta, K.MetaRight]
  const end = Date.now() + timeoutMs
  while (mods.some((m) => held.has(m)) && Date.now() < end) await new Promise((r) => setTimeout(r, 20))
}

export async function tapPaste(): Promise<boolean> {
  const h = await lib()
  if (!h) return false
  try {
    const K = h.UiohookKey
    h.uIOhook.keyTap(K.V, [process.platform === 'darwin' ? K.Meta : K.Ctrl])
    return true
  } catch (e) {
    console.error('[spark] paste keystroke failed:', e)
    return false
  }
}

export function stopHook(): void {
  stopFn()
  if (started && hook) hook.uIOhook.stop()
  started = false
}
