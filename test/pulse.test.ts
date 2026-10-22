import { describe, expect, it } from 'vitest'
import { VoicePulse } from '../src/renderer/pulse'

/** Feeds a level envelope (sampled every ms) at `fps` and records energy and kicks. */
function run(levels: number[], fps = 60) {
  const p = new VoicePulse()
  const step = 1000 / fps
  const out: { energy: number; kick: number }[] = []
  for (let t = 0; t < levels.length; t += step) {
    p.update(levels[Math.floor(t)], step / 1000)
    out.push({ energy: p.energy, kick: p.kick })
  }
  return out
}
const hold = (level: number, ms: number) => Array<number>(ms).fill(level)
/** A real syllable: the mic level rises over ~60 ms, holds, and falls away (as the recorder reports it). */
const syllable = (peak: number, ms: number) => Array.from({ length: ms }, (_, i) => peak * Math.min(1, i / 60) * Math.min(1, (ms - i) / 50))
const hits = (out: { kick: number }[]) => out.filter((o, i) => i > 0 && o.kick - out[i - 1].kick > 0.3).length

describe('VoicePulse', () => {
  it('turns a normal speaking voice into high energy, not a timid fraction', () => {
    const out = run([...hold(0.02, 300), ...hold(0.35, 400)])
    expect(out.at(-1)!.energy).toBeGreaterThan(0.75)
  })
  it('gates out room noise', () => {
    const out = run(hold(0.04, 1000))
    expect(Math.max(...out.map((o) => o.energy))).toBeLessThan(0.05)
    expect(Math.max(...out.map((o) => o.kick))).toBe(0)
  })
  it('lands a hit on every syllable and lets it fade between them', () => {
    const syllables = [...hold(0.02, 200), ...hold(0.4, 180), ...hold(0.05, 140), ...hold(0.45, 160), ...hold(0.05, 140), ...hold(0.38, 200)]
    const out = run(syllables)
    expect(hits(out)).toBe(3)
    expect(Math.max(...out.map((o) => o.kick))).toBeGreaterThan(0.8)
    expect(out.at(-1)!.kick).toBeLessThan(0.5)
  })
  it('catches syllables that ramp up, the same at 30 and 60 frames a second', () => {
    const speech = [...hold(0.02, 200), ...syllable(0.4, 200), ...hold(0.04, 120), ...syllable(0.45, 180), ...hold(0.04, 120), ...syllable(0.35, 220), ...hold(0.03, 200)]
    expect(hits(run(speech, 60))).toBe(3)
    expect(hits(run(speech, 30))).toBe(3)
  })
})
