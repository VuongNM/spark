/**
 * Push-to-talk gestures, modeled on Wispr Flow:
 *  - hold the key, talk, let go → stop and paste
 *  - a quick single tap does nothing (cancelled)
 *  - double-tap, or key + Space → hands-free; the next press stops
 *  - the key used as a modifier (key + another key, early on) → cancelled, it was typing
 */
export const TAP_MS = 250
export const DOUBLE_TAP_MS = 450
export const CHORD_WINDOW_MS = 800
export const SPACE_KEYCODES = new Set([49, 57]) // macOS kVK_Space, uiohook Space

export interface HoldState {
  pressedAt: number
  lastTapAt: number
  handsFree: boolean
  /** True while the current recording was started by this key (not by the toggle shortcut). */
  owns: boolean
}

export type HoldAction = 'start' | 'stop' | 'cancel' | 'lock' | 'none'
export type HoldEvent = { type: 'down' } | { type: 'up' } | { type: 'chord'; keycode: number }

export const initialHold = (): HoldState => ({ pressedAt: 0, lastTapAt: -Infinity, handsFree: false, owns: false })

export function onHold(s: HoldState, ev: HoldEvent, now: number, recording: boolean): [HoldState, HoldAction] {
  switch (ev.type) {
    case 'down':
      if (recording) return [{ ...s, handsFree: false, owns: false }, 'stop']
      return [{ ...s, pressedAt: now, handsFree: false, owns: true }, 'start']

    case 'up': {
      if (!recording || !s.owns || s.handsFree) return [s, 'none']
      if (now - s.pressedAt >= TAP_MS) return [{ ...s, owns: false }, 'stop']
      if (now - s.lastTapAt <= DOUBLE_TAP_MS) return [{ ...s, handsFree: true, lastTapAt: -Infinity }, 'lock']
      return [{ ...s, owns: false, lastTapAt: now }, 'cancel']
    }

    case 'chord':
      if (!recording || !s.owns || s.handsFree) return [s, 'none']
      if (SPACE_KEYCODES.has(ev.keycode)) return [{ ...s, handsFree: true }, 'lock']
      if (now - s.pressedAt <= CHORD_WINDOW_MS) return [{ ...s, owns: false }, 'cancel']
      return [s, 'none']
  }
}
