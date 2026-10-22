import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { AppCategory } from '../shared/types'

const run = promisify(execFile)

export interface AppContext {
  name: string
  bundleId: string
  category: AppCategory
}

const CATEGORIES: [AppCategory, RegExp][] = [
  ['chat', /slack|messenger|zalo|discord|telegram|whatsapp|messages|signal|teams|skype|line|viber|wechat/i],
  ['email', /mail|outlook|spark|airmail|thunderbird|superhuman|mimestream/i],
  ['code', /code|cursor|xcode|terminal|iterm|warp|ghostty|intellij|pycharm|webstorm|sublime|zed|android studio|windsurf/i],
  ['docs', /word|pages|notion|obsidian|docs|bear|notes|craft|evernote|onenote|google docs/i],
]

export function categorize(name: string, bundleId = ''): AppCategory {
  const hay = `${name} ${bundleId}`
  return CATEGORIES.find(([, re]) => re.test(hay))?.[0] ?? 'other'
}

async function frontmostMac(): Promise<{ name: string; bundleId: string }> {
  const { stdout: asn } = await run('lsappinfo', ['front'])
  const { stdout } = await run('lsappinfo', ['info', '-only', 'name', '-only', 'bundleid', asn.trim()])
  const name = /"(?:LSDisplayName|name)"="([^"]*)"/.exec(stdout)?.[1] ?? ''
  const bundleId = /"CFBundleIdentifier"="([^"]*)"/.exec(stdout)?.[1] ?? ''
  return { name, bundleId }
}

const WIN_SCRIPT = `
Add-Type @"
using System; using System.Runtime.InteropServices;
public class W { [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
[DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint p); }
"@
$p = 0; [void][W]::GetWindowThreadProcessId([W]::GetForegroundWindow(), [ref]$p)
$proc = Get-Process -Id $p; "$($proc.ProcessName)|$($proc.MainWindowTitle)"`

async function frontmostWindows(): Promise<{ name: string; bundleId: string }> {
  const { stdout } = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', WIN_SCRIPT], { timeout: 4000 })
  const [proc = '', title = ''] = stdout.trim().split('|')
  return { name: proc, bundleId: title }
}

export async function frontmostApp(): Promise<AppContext> {
  try {
    const { name, bundleId } = process.platform === 'darwin' ? await frontmostMac() : process.platform === 'win32' ? await frontmostWindows() : { name: '', bundleId: '' }
    return { name, bundleId, category: categorize(name, bundleId) }
  } catch {
    return { name: '', bundleId: '', category: 'other' }
  }
}
