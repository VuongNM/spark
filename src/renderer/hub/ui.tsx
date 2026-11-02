import type React from 'react'
import { type ReactNode, useCallback, useRef, useState } from 'react'
import { acceleratorKeys } from '../../shared/accelerator'
import type { FallbackReason, HistoryEntry } from '../../shared/types'
import { timeAgo } from './state'

export function Keys({ accelerator, platform, small }: { accelerator: string; platform: string; small?: boolean }) {
  return (
    <span className="inline" style={{ gap: 5 }} aria-label={accelerator.replace(/\+/g, ' ')}>
      {acceleratorKeys(accelerator, platform).map((k, i) => (
        <kbd key={i} className={`kbd${small ? ' sm' : ''}`}>
          {k}
        </kbd>
      ))}
    </span>
  )
}

export type Tone = 'ok' | 'todo' | 'bad' | 'off'

export function SetupRow({ tone, title, children, action }: { tone: Tone; title: string; children: ReactNode; action?: ReactNode }) {
  const label = { ok: 'Xong', todo: 'Cần làm', bad: 'Có lỗi', off: 'Đang tắt' }[tone]
  return (
    <div className="row">
      <span className={`dot ${tone}`} role="img" aria-label={label} />
      <div className="row-main">
        <span className="row-title">{title}</span>
        <span className="muted small">{children}</span>
      </div>
      {action}
    </div>
  )
}

export function SheetHead({ left, right }: { left?: ReactNode; right?: ReactNode }) {
  return (
    <header className="sheet-head">
      <div>{left}</div>
      <div className="inline">{right}</div>
    </header>
  )
}

const FALLBACK: Record<FallbackReason, string> = {
  'no-key': 'chưa có API key',
  'bad-key': 'API key bị từ chối',
  offline: 'không gọi được Claude',
  diverged: 'Claude sửa quá tay',
  refused: 'Claude từ chối',
  error: 'Claude API lỗi',
  'local-loading': 'model local chưa load xong',
  'local-rejected': 'output của Gemma bị loại',
  'local-error': 'model local bị lỗi',
}

const CLEANED_BY: Record<HistoryEntry['cleanedBy'], string> = { claude: 'Claude', local: 'Gemma 4 (local)', basic: 'Basic cleanup' }

export function Entry({ entry, showRaw, details, actions, index = 0 }: { entry: HistoryEntry; showRaw?: boolean; details?: boolean; actions: ReactNode; index?: number }) {
  return (
    <article className="entry" style={{ '--i': Math.min(index, 8) } as React.CSSProperties}>
      <div className="entry-foot">
        <div className="eyebrow">
          <span>{entry.app || 'Không rõ app'}</span>
          <span aria-hidden>·</span>
          <span>{timeAgo(entry.createdAt)}</span>
          {details && (
            <>
              <span aria-hidden>·</span>
              <span>nói {entry.durationSec.toLocaleString('vi-VN')} giây</span>
            </>
          )}
        </div>
        <div className="entry-actions">{actions}</div>
      </div>
      <p className="prose">{entry.text}</p>
      {showRaw && <p className="entry-raw">Transcript: {entry.raw}</p>}
      {details && (
        <div className="entry-foot">
          <span className="tag">{CLEANED_BY[entry.cleanedBy]}</span>
          {entry.fallbackReason && <span className="tag warn">{FALLBACK[entry.fallbackReason]}</span>}
          {entry.inserted === 'clipboard' && <span className="tag">mới copy, chưa paste</span>}
        </div>
      )}
    </article>
  )
}

export function useToast(): [ReactNode, (message: string, action?: { label: string; run: () => void }) => void] {
  const [toast, setToast] = useState<{ message: string; action?: { label: string; run: () => void } } | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const show = useCallback((message: string, action?: { label: string; run: () => void }) => {
    window.clearTimeout(timer.current)
    setToast({ message, action })
    timer.current = window.setTimeout(() => setToast(null), action ? 6000 : 1800)
  }, [])
  const node = toast && (
    <div className="toast" role="status">
      {toast.message}
      {toast.action && (
        <button
          className="btn sm"
          onClick={() => {
            toast.action?.run()
            setToast(null)
          }}
        >
          {toast.action.label}
        </button>
      )}
    </div>
  )
  return [node, show]
}
