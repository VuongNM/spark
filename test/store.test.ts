import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let dir = ''
vi.mock('electron', () => ({
  app: { getPath: () => dir },
  safeStorage: { isEncryptionAvailable: () => false },
}))

/** Loads store.ts fresh, as on a new launch, with `settings` (if given) already on disk. */
async function launch(settings?: object) {
  if (settings) writeFileSync(join(dir, 'settings.json'), JSON.stringify(settings))
  vi.resetModules()
  return import('../src/main/store')
}

describe('first-run tour', () => {
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'spark-store-'))
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('shows on a new install', async () => {
    expect((await launch()).getSettings().onboarded).toBe(false)
  })

  it('stays hidden for people who already use Spark', async () => {
    expect((await launch({ version: 3, mode: 'hold' })).getSettings().onboarded).toBe(true)
  })

  it('remembers an unfinished tour across launches', async () => {
    expect((await launch({ version: 4, onboarded: false })).getSettings().onboarded).toBe(false)
  })

  it('stays done once finished', async () => {
    const store = await launch()
    store.updateSettings({ onboarded: true })
    expect((await launch()).getSettings().onboarded).toBe(true)
  })
})
