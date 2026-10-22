import type { HoldKey } from './types'

export function formatAccelerator(acc: string, platform: string): string {
  const mac = platform === 'darwin'
  const map: Record<string, string> = mac
    ? { CommandOrControl: '⌘', CmdOrCtrl: '⌘', Command: '⌘', Cmd: '⌘', Control: '⌃', Ctrl: '⌃', Alt: '⌥', Option: '⌥', Shift: '⇧', Super: '⌘' }
    : { CommandOrControl: 'Ctrl', CmdOrCtrl: 'Ctrl', Command: 'Win', Control: 'Ctrl', Ctrl: 'Ctrl', Alt: 'Alt', Shift: 'Shift', Super: 'Win' }
  const parts = acc.split('+').map((p) => map[p] ?? p)
  return mac ? parts.join('') : parts.join('+')
}

export function acceleratorKeys(acc: string, platform: string): string[] {
  return formatAccelerator(acc, platform)
    .split(platform === 'darwin' ? /(?<=[⌘⌃⌥⇧])/ : '+')
    .filter(Boolean)
}

export function holdKeyLabel(key: HoldKey, platform: string): string {
  const mac = platform === 'darwin'
  const labels: Record<HoldKey, [string, string]> = {
    Fn: ['fn', 'Fn'],
    AltRight: ['⌥ Option phải', 'Alt phải'],
    MetaRight: ['⌘ Command phải', 'phím Windows phải'],
    CtrlRight: ['⌃ Control phải', 'Ctrl phải'],
  }
  return labels[key][mac ? 0 : 1]
}

const CODE_TO_KEY: Record<string, string> = { Space: 'Space', Enter: 'Enter', Tab: 'Tab', Backquote: '`', Minus: '-', Equal: '=', Comma: ',', Period: '.', Slash: '/', Semicolon: ';', Quote: "'", BracketLeft: '[', BracketRight: ']', Backslash: '\\', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right' }

/** Builds an Electron accelerator from a keydown, or null while only modifiers are held. */
export function acceleratorFromEvent(e: { code: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean }, platform: string): string | null {
  let key: string | undefined
  if (/^Key[A-Z]$/.test(e.code)) key = e.code.slice(3)
  else if (/^Digit[0-9]$/.test(e.code)) key = e.code.slice(5)
  else if (/^F([1-9]|1[0-9]|2[0-4])$/.test(e.code)) key = e.code
  else key = CODE_TO_KEY[e.code]
  if (!key) return null
  const mods: string[] = []
  if (e.metaKey) mods.push(platform === 'darwin' ? 'Command' : 'Super')
  if (e.ctrlKey) mods.push('Control')
  if (e.altKey) mods.push('Alt')
  if (e.shiftKey) mods.push('Shift')
  if (mods.length === 0 && !/^F\d+$/.test(key)) return null
  return [...mods, key].join('+')
}
