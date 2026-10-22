/** Voice dynamics for the dot fields; no DOM, so it can be unit-tested. */

/**
 * Turns the raw mic level into something that feels like speech hitting the screen:
 * - `energy` (0–1): loudness normalised to how loud *you* are right now, so a normal speaking
 *   voice reaches the top instead of a timid 0.3, with room noise gated out.
 * - `kick` (0–1): jumps on every syllable onset and dies away in a fraction of a second, the
 *   "impact" of each word.
 */
export class VoicePulse {
  energy = 0
  kick = 0
  private peak = 0.3
  /** The level a moment ago (~80 ms lag), so an onset is measured over time, not per frame. */
  private slow = 0
  private quiet = 1

  update(raw: number, dt: number): void {
    const GATE = 0.05
    this.peak = Math.max(raw, this.peak * Math.pow(0.55, dt), 0.18)
    const norm = Math.max(0, Math.min(1, (raw - GATE) / (this.peak - GATE)))
    this.energy += (norm - this.energy) * Math.min(1, dt * (norm > this.energy ? 30 : 6))
    // An onset: the level climbs well above where it was ~80 ms ago, after a moment of relative
    // quiet (a new syllable or word). Comparing against a time-based follower instead of the previous
    // frame keeps it the same at 30 or 60 frames a second.
    const rise = norm - this.slow
    this.slow += (norm - this.slow) * Math.min(1, dt / 0.08)
    this.quiet = norm < 0.35 ? this.quiet + dt : this.quiet
    if (rise > 0.22 && norm > 0.3 && this.quiet > 0.06) {
      this.kick = Math.min(1, this.kick + 0.55 + rise)
      this.quiet = 0
    }
    this.kick *= Math.exp(-dt / 0.2)
  }

  reset(): void {
    this.energy = this.kick = this.slow = 0
    this.quiet = 1
  }
}
