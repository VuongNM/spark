import { bit } from './pixels'
import { VoicePulse } from './pulse'

export type FieldMood = 'idle' | 'listening' | 'working' | 'done' | 'error'

/**
 * The one animation behind every dot field in Spark (Home, the sidebar and the recording bubble),
 * so they all move alike. Soft patches of dots drift slowly with the odd bit blinking; while you
 * talk the field stirs with your voice, swells softly on each word and gives the dots a gentle
 * shove; it hums while Spark writes and settles after. Each caller only chooses its grid, its
 * colours and how its dots are drawn.
 */
export class FieldMotion {
  private pulse = new VoicePulse()
  /** How stirred-up the field is (0–1). */
  energy = 0
  /** The beat of your words, softened so each word swells instead of strobing. */
  beat = 0
  /** Your loudness right now (0–1), for colour. */
  voice = 0
  private flow = 0
  private t = 0

  step(dt: number, mood: FieldMood, level: number, age: number, calm: boolean): void {
    this.t += dt
    if (mood === 'listening') this.pulse.update(level, dt)
    else this.pulse.reset()
    this.voice = this.pulse.energy
    this.beat += (this.pulse.kick - this.beat) * Math.min(1, dt * 9)
    // The voice while recording, a steady hum while writing, a short afterglow at the end.
    const want = mood === 'listening' ? 0.2 + this.voice * 0.8 : mood === 'working' ? 0.35 : mood === 'done' || mood === 'error' ? Math.max(0, 0.6 - age) : 0
    this.energy += (want - this.energy) * Math.min(1, dt * (want > this.energy ? 18 : 5))
    // Each word nudges the whole field forward. Reduce Motion keeps the light, drops the surge.
    this.flow += dt * (calm ? 0.03 + this.energy * 0.2 : 0.05 + this.energy * 0.9 + this.beat * 2)
  }

  /** How quickly a dot follows its new brightness this frame. */
  ease(dt: number, mood: FieldMood): number {
    return Math.min(1, dt * (mood === 'listening' ? 12 : 8))
  }

  /** The dot at grid (c, r): brightness to ease toward, and which way it is shoved. */
  dot(c: number, r: number, scale: number): { target: number; dx: number; dy: number } {
    const b = bit(c, r, scale, this.flow, this.t, Math.min(1, this.energy + this.beat * 0.3), 0.35)
    return { target: Math.min(1, b.v * (1 + this.beat * 0.4)), dx: b.dx, dy: b.dy }
  }

  /** Shove distance, in grid pitches. */
  push(calm: boolean): number {
    return calm ? 0 : 0.5 + this.beat * 0.7
  }

  /** Opacity of a dot showing brightness g. */
  alpha(g: number): number {
    return Math.min(1, g * (0.55 + this.beat * 0.15))
  }

  /** Radius of a dot showing brightness g, in grid pitches (Home's 11 px grid: 0.8–3.6 px). */
  radius(g: number): number {
    return (0.8 + g * (1.1 + this.beat * 0.7)) / 11
  }
}
