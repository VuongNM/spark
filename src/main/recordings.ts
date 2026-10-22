import { app } from 'electron'
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { RecordedAudio } from '../shared/types'

const KEEP = 20
export const recordingsDir = (): string => join(app.getPath('userData'), 'recordings')

function wav({ samples, sampleRate }: RecordedAudio): Buffer {
  const data = Buffer.alloc(samples.length * 2)
  for (let i = 0; i < samples.length; i++) data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), i * 2)
  const h = Buffer.alloc(44)
  h.write('RIFF', 0)
  h.writeUInt32LE(36 + data.length, 4)
  h.write('WAVEfmt ', 8)
  h.writeUInt32LE(16, 16)
  h.writeUInt16LE(1, 20)
  h.writeUInt16LE(1, 22)
  h.writeUInt32LE(sampleRate, 24)
  h.writeUInt32LE(sampleRate * 2, 28)
  h.writeUInt16LE(2, 32)
  h.writeUInt16LE(16, 34)
  h.write('data', 36)
  h.writeUInt32LE(data.length, 40)
  return Buffer.concat([h, data])
}

/** Keeps the newest recordings on this computer (opt-in, for troubleshooting accuracy). */
export function saveRecording(audio: RecordedAudio, id: string, transcript: string): void {
  const dir = recordingsDir()
  mkdirSync(dir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  writeFileSync(join(dir, `${stamp}_${id}.wav`), wav(audio))
  writeFileSync(join(dir, `${stamp}_${id}.txt`), transcript)
  const files = readdirSync(dir).filter((f) => f.endsWith('.wav')).sort()
  for (const f of files.slice(0, Math.max(0, files.length - KEEP))) {
    rmSync(join(dir, f), { force: true })
    rmSync(join(dir, f.replace(/\.wav$/, '.txt')), { force: true })
  }
}

export function clearRecordings(): void {
  rmSync(recordingsDir(), { recursive: true, force: true })
}
