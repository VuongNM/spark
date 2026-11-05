import type { SVGProps } from 'react'

/** The app mark: navy glass tile with a voice waveform (same artwork as resources/icon.svg). */
/** Same pattern as the app icon (scripts/make-icons.mjs): five voice bars as lit dots on a 9×9 LED grid. */
const GRID = 9
const BARS = [3, 0, 5, 0, 7, 0, 5, 0, 3]
const LOGO_DOTS = Array.from({ length: GRID * GRID }, (_, i) => {
  const c = i % GRID
  const r = Math.floor(i / GRID)
  return { c, r, lit: Math.abs(r - (GRID - 1) / 2) <= (BARS[c] - 1) / 2 }
})

export function Logo({ size = 30, live = false }: { size?: number; live?: boolean }) {
  const pitch = 25.6 / GRID
  const dot = pitch * 0.74
  const start = 3.2 + (pitch - dot) / 2
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className={`logo${live ? ' live' : ''}`}>
      <defs>
        <linearGradient id="logo-body" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={live ? '#ff7b80' : '#2a4fa8'} />
          <stop offset="0.55" stopColor={live ? '#e5484d' : '#0f2a6b'} />
          <stop offset="1" stopColor={live ? '#8a1d21' : '#06143d'} />
        </linearGradient>
        <radialGradient id="logo-glow" cx="0.28" cy="0.18" r="0.8">
          <stop offset="0" stopColor="#fff" stopOpacity="0.4" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="32" height="32" rx="7.5" fill="url(#logo-body)" />
      <rect width="32" height="32" rx="7.5" fill="url(#logo-glow)" />
      <rect x="0.5" y="0.5" width="31" height="31" rx="7" fill="none" stroke="#fff" strokeOpacity="0.25" />
      {LOGO_DOTS.map(({ c, r, lit }) => (
        <rect
          key={`${c}-${r}`}
          className={lit ? 'logo-dot' : undefined}
          // Each lit dot shakes on its own beat while recording.
          style={lit ? { animationDelay: `${((c * 7 + r * 3) % 9) * -47}ms` } : undefined}
          x={start + c * pitch}
          y={start + r * pitch}
          width={dot}
          height={dot}
          rx={dot * 0.28}
          fill="#fff"
          fillOpacity={lit ? 1 : 0.12}
        />
      ))}
    </svg>
  )
}

const base = (p: SVGProps<SVGSVGElement>) => ({
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  ...p,
})

export const HomeIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z" />
  </svg>
)
export const HistoryIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" />
    <path d="M3.5 4.5v4h4" />
    <path d="M12 8v4.2l2.8 1.8" />
  </svg>
)
export const BookIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M5 4.5h10.5A3.5 3.5 0 0 1 19 8v11.5H8.5A3.5 3.5 0 0 1 5 16z" />
    <path d="M5 16a3.5 3.5 0 0 1 3.5-3.5H19" />
  </svg>
)
export const SlidersIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
    <circle cx="15" cy="7" r="2" />
    <circle cx="9" cy="17" r="2" />
  </svg>
)
export const MicIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <rect x="9" y="3.5" width="6" height="11" rx="3" />
    <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v2.5" />
  </svg>
)
export const StopIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)} fill="currentColor" stroke="none">
    <rect x="7" y="7" width="10" height="10" rx="2.5" />
  </svg>
)
export const CheckIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </svg>
)

/** The menu bar / system tray glyph (same dots as trayIcon in src/main/windows.ts), in the current colour. */
export function TrayGlyph({ size = 18 }: { size?: number }) {
  const pitch = 30 / GRID
  const dot = pitch * 0.78
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden fill="currentColor">
      {LOGO_DOTS.filter((d) => d.lit).map(({ c, r }) => (
        <rect key={`${c}-${r}`} x={1 + c * pitch + (pitch - dot) / 2} y={1 + r * pitch + (pitch - dot) / 2} width={dot} height={dot} rx={0.6} />
      ))}
    </svg>
  )
}
