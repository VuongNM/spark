import { useEffect, useState } from 'react'
import { holdKeyLabel } from '../../shared/accelerator'
import type { AppState, Settings, Setup } from '../../shared/types'

export function useAppState(): [AppState | null, (s: AppState) => void] {
  const [state, setState] = useState<AppState | null>(null)
  useEffect(() => {
    void window.spark.getState().then(setState)
    return window.spark.onState(setState)
  }, [])
  return [state, setState]
}

export type Page = 'home' | 'history' | 'dictionary' | 'settings'

/** Setup items that stop dictation from working at all. */
export function blockers(setup: Setup): string[] {
  const out: string[] = []
  if (setup.model.state !== 'ready') out.push('model')
  if (setup.mic === 'denied') out.push('mic')
  if (!setup.hotkey.ok) out.push('hotkey')
  return out
}

export function timeAgo(ts: number): string {
  const s = Math.round((Date.now() - ts) / 1000)
  if (s < 60) return 'vừa xong'
  if (s < 3600) return `${Math.floor(s / 60)} phút trước`
  const d = new Date(ts)
  const today = new Date().toDateString() === d.toDateString()
  return today ? d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString('vi-VN', { day: 'numeric', month: 'numeric' })
}

/** The key you hold to dictate, as printed on the keyboard ("fn", "Right ⌥ Option"…). */
export const triggerKey = (settings: Settings, platform: string): string =>
  settings.holdKey === 'Fn' && platform === 'darwin' ? 'fn' : holdKeyLabel(settings.holdKey, platform)
