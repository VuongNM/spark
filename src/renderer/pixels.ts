/** Shared maths for Spark's dot fields (Home background and the recording bubble). */

export { VoicePulse } from './pulse'

/** Cheap smooth wave in [-1, 1]. */
export const wave = (x: number, y: number, t: number): number =>
  (Math.sin(x * 0.71 + t * 1.1) + Math.sin(y * 0.93 - t * 0.83) + Math.sin((x + y) * 0.47 + t * 0.61)) / 3

/** Deterministic hash of three integers to [0, 1). */
export function hash3(x: number, y: number, z: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1274126177)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10)
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

/** Smooth 3D value noise in [0, 1]. */
export function noise3(x: number, y: number, z: number): number {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const zi = Math.floor(z)
  const u = fade(x - xi)
  const v = fade(y - yi)
  const w = fade(z - zi)
  const c = (dx: number, dy: number, dz: number) => hash3(xi + dx, yi + dy, zi + dz)
  return lerp(
    lerp(lerp(c(0, 0, 0), c(1, 0, 0), u), lerp(c(0, 1, 0), c(1, 1, 0), u), v),
    lerp(lerp(c(0, 0, 1), c(1, 0, 1), u), lerp(c(0, 1, 1), c(1, 1, 1), u), v),
    w,
  )
}

export const smoothstep = (a: number, b: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/**
 * One dot of a drifting "bit field": soft patches of lit dots carried along by a slow current,
 * plus the odd bit flipping on. `flow` is the integrated drift (speed it up and the field moves
 * faster without jumping); `energy` (0–1, usually the voice level) lights more bits, makes them
 * pulse brighter, and pushes the dots around.
 *
 * Returns brightness 0–1 and a displacement in grid units.
 */
export function bit(x: number, y: number, scale: number, flow: number, time: number, energy: number, sparkle = 1): { v: number; dx: number; dy: number } {
  const sx = x * scale
  const sy = y * scale
  const n = 0.65 * noise3(sx + flow * 0.7, sy - flow * 0.35, flow * 0.25) + 0.35 * noise3(sx * 2.1 + 17, sy * 2.1 - 9, flow * 0.6)
  const threshold = 0.54 - 0.22 * energy
  const on = smoothstep(threshold - 0.09, threshold + 0.09, n)
  // Texture inside the patches, so they read as data rather than flat blobs.
  const grain = noise3(sx * 5.3 - flow * 1.4, sy * 5.3 + 31, flow * 1.1)
  // Bits that blink on for a moment, a little more often when there's energy.
  const slot = Math.floor(time * (1.5 + 4 * energy) + hash3(x, y, 7) * 50)
  const blink = sparkle > 0 && hash3(x, y, slot) > 0.992 - 0.02 * energy ? 0.7 * sparkle : 0
  const angle = noise3(sx * 0.6 - 40, sy * 0.6 + 40, flow * 0.5) * Math.PI * 4
  const push = energy * (0.25 + 0.75 * on)
  return { v: Math.min(1, 0.14 + on * (0.3 + 0.35 * grain + 0.35 * energy) + blink), dx: Math.cos(angle) * push, dy: Math.sin(angle) * push }
}

/** VU-meter smoothing: rises fast, falls back slower. */
export const followLevel = (current: number, target: number, dt: number): number =>
  current + (target - current) * Math.min(1, dt * (target > current ? 22 : 7))

/** Sizes a canvas for crisp dots on Retina screens; returns its CSS size. */
export function fitCanvas(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): { w: number; h: number } {
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const w = canvas.clientWidth
  const h = canvas.clientHeight
  canvas.width = Math.round(w * dpr)
  canvas.height = Math.round(h * dpr)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  return { w, h }
}

/** Parses '#rrggbb' or 'rgb(r, g, b)' into numbers (for blending CSS colours on a canvas). */
export function rgbOf(css: string): [number, number, number] {
  const hex = css.trim().match(/^#([0-9a-f]{6})$/i)
  if (hex) return [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16)) as [number, number, number]
  const nums = css.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0]
  return [nums[0] ?? 0, nums[1] ?? 0, nums[2] ?? 0]
}
