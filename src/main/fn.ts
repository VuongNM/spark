import { app } from 'electron'
import { type ChildProcess, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { createInterface } from 'node:readline'

export interface FnHandlers {
  down: () => void
  up: () => void
  chord: (keycode: number) => void
}

export type FnStatus = 'ready' | 'permission' | 'missing' | 'stopped'

const helperPath = () => (app.isPackaged ? join(process.resourcesPath, 'bin', 'fn-watcher') : join(app.getAppPath(), 'resources', 'bin', 'fn-watcher'))

let proc: ChildProcess | null = null
let handlers: FnHandlers | null = null
let wanted = false
let restartTimer: NodeJS.Timeout | undefined

/** Starts the native Fn/Globe key watcher (macOS). Resolves once it reports ready or fails. */
export function startFn(h: FnHandlers): Promise<FnStatus> {
  handlers = h
  wanted = true
  if (proc) return Promise.resolve('ready')
  const path = helperPath()
  if (!existsSync(path)) return Promise.resolve('missing')

  return new Promise((resolve) => {
    const child = spawn(path, [], { stdio: ['pipe', 'pipe', 'ignore'] })
    proc = child
    let settled = false
    let ran = false
    const settle = (s: FnStatus) => {
      if (s === 'ready') ran = true
      if (!settled) {
        settled = true
        resolve(s)
      }
    }
    createInterface({ input: child.stdout! }).on('line', (line) => {
      const [kind, arg] = line.trim().split(' ')
      if (kind === 'ready') settle('ready')
      else if (kind === 'error') settle(arg === 'permission' ? 'permission' : 'missing')
      else if (kind === 'down') handlers?.down()
      else if (kind === 'up') handlers?.up()
      else if (kind === 'chord') handlers?.chord(Number(arg))
    })
    child.on('exit', () => {
      proc = null
      settle('missing')
      // Restart after a crash; a permission refusal waits until permissions are re-checked.
      if (wanted && ran && handlers) {
        const h = handlers
        restartTimer = setTimeout(() => void startFn(h), 2000)
      }
    })
    child.on('error', () => settle('missing'))
  })
}

export function stopFn(): void {
  wanted = false
  clearTimeout(restartTimer)
  proc?.stdin?.end()
  proc?.kill()
  proc = null
}
