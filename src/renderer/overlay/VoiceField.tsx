import { useEffect, useRef } from 'react'
import { type FieldMood, FieldMotion } from '../fieldMotion'
import { fitCanvas, smoothstep } from '../pixels'

export type FieldMode = 'waiting' | 'listening' | 'working' | 'done' | 'error'

const PITCH = 5 // px between dots
/** Patch size in noise units per dot: about three patches across the bubble, as on Home's page. */
const SCALE = 0.1
type RGB = [number, number, number]
/** Light-on-dark versions of Home's colours: neutral, warming toward red as you talk, cool while writing. */
const NEUTRAL: RGB = [228, 230, 240]
const VOICE: RGB = [255, 128, 116]
const WORK: RGB = [196, 210, 255]
const OK: RGB = [96, 214, 146]
const BAD: RGB = [255, 128, 118]
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
const MOOD: Record<FieldMode, FieldMood> = { waiting: 'idle', listening: 'listening', working: 'working', done: 'done', error: 'error' }

/**
 * The recording bubble's only visual: the same animated bit field as Home (FieldMotion), filling the
 * capsule edge to edge, drawn light on dark at the bubble's scale.
 */
export function VoiceField({ mode, level }: { mode: FieldMode; level: () => number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const modeRef = useRef({ mode, since: performance.now() })
  useEffect(() => {
    modeRef.current = { mode, since: performance.now() }
  }, [mode])

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    let w = 0
    let h = 0
    let cols = 0
    let rows = 0
    let ox = 0
    let oy = 0
    let glow = new Float32Array(0)
    // The capsule changes width when a message appears, so the grid is rebuilt on resize.
    const layout = () => {
      ;({ w, h } = fitCanvas(canvas, ctx))
      cols = Math.max(1, Math.floor(w / PITCH))
      rows = Math.max(1, Math.floor(h / PITCH))
      ox = (w - (cols - 1) * PITCH) / 2
      oy = (h - (rows - 1) * PITCH) / 2
      glow = new Float32Array(cols * rows).fill(0.12)
    }
    layout()
    const ro = new ResizeObserver(layout)
    ro.observe(canvas)
    // Reduce Motion drops movement (the shove and the bump), never the light pulsing with your voice.
    const gentle = () => document.documentElement.dataset.motion === 'reduced'
    const motion = new FieldMotion()
    let rgb: RGB = NEUTRAL
    let last = performance.now()
    let raf = 0

    const draw = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      const { mode: m, since } = modeRef.current
      const mood = MOOD[m]
      const age = (now - since) / 1000
      const calm = gentle()
      motion.step(dt, mood, m === 'listening' ? Math.min(1, level()) : 0, age, calm)

      const goal =
        m === 'listening' ? mix(NEUTRAL, VOICE, 0.35 + 0.55 * motion.voice)
        : m === 'working' ? WORK
        : m === 'done' ? (age < 1.2 ? OK : NEUTRAL)
        : m === 'error' ? (age < 1.6 ? BAD : NEUTRAL)
        : NEUTRAL
      rgb = mix(rgb, goal, Math.min(1, dt * 5))
      // The capsule itself swells softly on each word (see .pill in overlay.css).
      canvas.parentElement?.style.setProperty('--kick', motion.beat.toFixed(3))
      ctx.clearRect(0, 0, w, h)
      ctx.fillStyle = `rgb(${rgb.map(Math.round).join(',')})`
      const push = PITCH * motion.push(calm)
      const ease = motion.ease(dt, mood)
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const i = y * cols + x
          const d = motion.dot(x, y, SCALE)
          glow[i] += (d.target - glow[i]) * ease
          // Soft ends, so the field melts into the capsule's round caps.
          const g = Math.min(1, glow[i]) * smoothstep(-1, 3, x) * smoothstep(cols, cols - 4, x)
          if (g < 0.03) continue
          // A touch brighter than Home's, since it sits on dark glass instead of paper.
          ctx.globalAlpha = Math.min(1, motion.alpha(g) * 1.35)
          ctx.beginPath()
          ctx.arc(ox + x * PITCH + d.dx * push, oy + y * PITCH + d.dy * push, motion.radius(g) * PITCH * 1.2, 0, Math.PI * 2)
          ctx.fill()
        }
      }
      ctx.globalAlpha = 1
    }

    const loop = (now: number) => {
      draw(now)
      raf = requestAnimationFrame(loop)
    }
    draw(performance.now())
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [level])

  return <canvas ref={ref} className="voice-field" aria-hidden />
}
