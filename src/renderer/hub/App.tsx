import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { AppState } from '../../shared/types'
import { Dictionary } from './pages/Dictionary'
import { History } from './pages/History'
import { Home } from './pages/Home'
import { Settings } from './pages/Settings'
import { blockers, type Page, useAppState } from './state'
import { DotVeil } from './DotVeil'
import { Welcome } from './Welcome'
import { BookIcon, HistoryIcon, HomeIcon, Logo, SlidersIcon } from './icons'

const PAGES: { id: Page; label: string; Icon: typeof HomeIcon }[] = [
  { id: 'home', label: 'Trang chủ', Icon: HomeIcon },
  { id: 'history', label: 'Lịch sử', Icon: HistoryIcon },
  { id: 'dictionary', label: 'Từ điển', Icon: BookIcon },
  { id: 'settings', label: 'Cài đặt', Icon: SlidersIcon },
]

/** What Spark is doing right now; the how-to lives on Home, so this stays a single line. */
function StatusCard({ state }: { state: AppState }) {
  const { phase, setup } = state
  const blocked = blockers(setup).length > 0
  const [dot, label] =
    phase === 'recording' ? ['live', 'Đang nghe…'] : phase === 'transcribing' || phase === 'cleaning' ? ['ok', 'Đang viết…'] : blocked ? ['todo', 'Cần thiết lập'] : ['ok', 'Sẵn sàng']
  return (
    <div className="side-status" role="status" aria-live="polite">
      <span className="line">
        <span className={`dot ${dot}`} aria-hidden />
        {label}
      </span>
    </div>
  )
}

export function App() {
  const [state, setState] = useAppState()
  const [page, setPage] = useState<Page>('home')
  /** Switches page, optionally scrolling to and focusing a field there (e.g. the API key). */
  const go = (p: Page, focusId?: string) => {
    setPage(p)
    if (focusId)
      setTimeout(() => {
        const el = document.getElementById(focusId)
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        el?.focus({ preventScroll: true })
      }, 380)
  }
  const navRefs = useRef<Partial<Record<Page, HTMLButtonElement | null>>>({})
  const [pill, setPill] = useState<{ y: number; h: number } | null>(null)

  useLayoutEffect(() => {
    const place = () => {
      const el = navRefs.current[page]
      if (el) setPill({ y: el.offsetTop, h: el.offsetHeight })
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [page, !!state, state?.settings.onboarded])

  useEffect(() => {
    if (!state) return
    const html = document.documentElement
    html.dataset.platform = state.setup.platform
    html.dataset.glass = html.dataset.mock ? 'css' : state.setup.glass ? 'native' : 'none'
    html.dataset.motion = state.settings.motion === 'system' && state.setup.systemReducedMotion ? 'reduced' : 'full'
  }, [state?.setup.platform, state?.setup.glass, state?.settings.motion, state?.setup.systemReducedMotion])

  if (!state) return null
  if (!state.settings.onboarded)
    return (
      <Welcome
        state={state}
        setState={setState}
        done={(p) => {
          setPage(p ?? 'home')
          void window.spark.updateSettings({ onboarded: true }).then(setState)
        }}
      />
    )
  const mac = state.setup.platform === 'darwin'
  const needsSetup = blockers(state.setup).length > 0

  return (
    <div className="app">
      <nav className={`sidebar${mac ? ' mac' : ''}`} aria-label="Các mục">
        <DotVeil phase={state.phase} fade="up" className="side-veil" />
        <div className="brand">
          <Logo live={state.phase === 'recording'} />
          <span className="wordmark">Spark</span>
        </div>
        <div className="nav-list">
          {pill && <span className="nav-pill" style={{ transform: `translateY(${pill.y}px)`, height: pill.h }} aria-hidden />}
          {PAGES.map((p) => (
            <button
              key={p.id}
              ref={(el) => {
                navRefs.current[p.id] = el
              }}
              className="nav-item"
              aria-current={page === p.id ? 'page' : undefined}
              onClick={() => setPage(p.id)}
            >
              <p.Icon />
              {p.label}
              {p.id === 'home' && needsSetup && <span className="nav-badge" title="Cần thiết lập" />}
            </button>
          ))}
        </div>
        <StatusCard state={state} />
      </nav>
      <main className="sheet" key={page}>
        {page === 'home' && <Home state={state} setState={setState} go={go} />}
        {page === 'history' && <History state={state} />}
        {page === 'dictionary' && <Dictionary />}
        {page === 'settings' && <Settings state={state} setState={setState} />}
      </main>
    </div>
  )
}
