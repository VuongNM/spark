import { useEffect, useRef } from 'react'
import type { Phase } from '../../shared/types'
import { FieldMotion } from '../fieldMotion'
import { fitCanvas, rgbOf, smoothstep } from '../pixels'

/**
 * Home's background: a fine "bit field" across the top of the page, edge to edge. Soft patches
 * of dots drift slowly like clouds of data, with the odd bit blinking. When you speak, every
 * syllable lands as a hit: the field flashes, bits swell and get thrown, and it surges forward.
 * It warms toward red while recording, sweeps faster while Spark writes, and flashes green or red
 * at the end. Canvas 2D at ≤30 fps; it fades out downward so the page below stays calm.
 */
const PITCH = 11 // px between dots
const SCALE = 0.06 // noise scale per dot: larger = smaller patches
const FRAME_MS = 1000 / 30

type Mode = 'idle' | 'listening' | 'working' | 'done' | 'error'
const modeOf = (p: Phase): Mode =>
  p === 'recording' ? 'listening' : p === 'transcribing' || p === 'cleaning' ? 'working' : p === 'done' ? 'done' : p === 'error' ? 'error' : 'idle'

type RGB = [number, number, number]
function readColors(): Record<'accent' | 'rec' | 'work' | 'ok' | 'bad', RGB> {
  const css = getComputedStyle(document.documentElement)
  const v = (n: string) => rgbOf(css.getPropertyValue(n))
  return { accent: v('--accent'), rec: v('--rec'), work: v('--accent-2'), ok: v('--ok'), bad: v('--danger') }
}
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]

/**
 * `fade`: 'down' melts the field away toward the bottom (Home's hero); 'up' rises from the
 * bottom (the sidebar). `className` positions the canvas.
 */
export function DotVeil({ phase, fade = 'down', className = 'hero-veil' }: { phase: Phase; fade?: 'down' | 'up'; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const live = useRef({ mode: modeOf(phase), level: 0, since: performance.now() })

  useEffect(() => {
    live.current.mode = modeOf(phase)
    live.current.since = performance.now()
    if (phase !== 'recording') live.current.level = 0
  }, [phase])
  useEffect(() => window.spark.onLevel?.((l) => (live.current.level = Math.min(1, l))), [])

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    let colors = readColors()
    const scheme = matchMedia('(prefers-color-scheme: dark)')
    const onScheme = () => (colors = readColors())
    scheme.addEventListener('change', onScheme)

    let w = 0
    let h = 0
    let cols = 0
    let rows = 0
    let fadeRow = new Float32Array(0)
    let glow = new Float32Array(0)
    const layout = () => {
      ;({ w, h } = fitCanvas(canvas, ctx))
      cols = Math.ceil(w / PITCH)
      rows = Math.ceil(h / PITCH)
      // Full strength at the top, melting away over the lower half.
      fadeRow = Float32Array.from({ length: rows }, (_, r) => (fade === 'down' ? smoothstep(h, h * 0.35, r * PITCH) : smoothstep(0, h * 0.7, r * PITCH)))
      glow = new Float32Array(cols * rows).fill(0.1)
    }
    layout()
    const ro = new ResizeObserver(layout)
    ro.observe(canvas)

    const gentle = () => document.documentElement.dataset.motion === 'reduced'
    const motion = new FieldMotion()
    let color: RGB = colors.accent
    let last = performance.now()
    let raf = 0

    const draw = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      const calm = gentle()
      const { mode, level, since } = live.current
      const age = (now - since) / 1000
      motion.step(dt, mode, level, age, calm)
      const lvl = motion.voice

      const goal =
        mode === 'listening' ? mix(colors.accent, colors.rec, 0.35 + 0.55 * lvl)
        : mode === 'working' ? colors.work
        : mode === 'done' ? (age < 1.2 ? colors.ok : colors.accent)
        : mode === 'error' ? (age < 1.6 ? colors.bad : colors.accent)
        : colors.accent
      color = mix(color, goal, Math.min(1, dt * 5))
      ctx.clearRect(0, 0, w, h)
      ctx.fillStyle = `rgb(${color.map(Math.round).join(',')})`

      const push = PITCH * motion.push(calm)
      const ease = motion.ease(dt, mode)
      for (let r = 0; r < rows; r++) {
        const fade = fadeRow[r]
        if (fade < 0.02) continue
        for (let c = 0; c < cols; c++) {
          const i = r * cols + c
          const d = motion.dot(c, r, SCALE)
          glow[i] += (d.target - glow[i]) * ease
          const g = Math.min(1, glow[i]) * fade
          if (g < 0.03) continue
          ctx.globalAlpha = motion.alpha(g)
          ctx.beginPath()
          ctx.arc(c * PITCH + PITCH / 2 + d.dx * push, r * PITCH + PITCH / 2 + d.dy * push, motion.radius(g) * PITCH, 0, Math.PI * 2)
          ctx.fill()
        }
      }
      ctx.globalAlpha = 1
    }

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      if (now - last < FRAME_MS - 2) return
      draw(now)
    }
    draw(performance.now()) // first frame right away, even where animation frames are paused
    raf = requestAnimationFrame(loop)

    const onVisibility = () => {
      cancelAnimationFrame(raf)
      if (!document.hidden) {
        last = performance.now()
        raf = requestAnimationFrame(loop)
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('visibilitychange', onVisibility)
      scheme.removeEventListener('change', onScheme)
      ro.disconnect()
    }
  }, [fade])

  return <canvas ref={canvasRef} className={className} aria-hidden />
}
