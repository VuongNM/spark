import { useEffect, useRef, useState } from 'react'
import type { AppState, ClaudeModel, HistoryEntry } from '../../../shared/types'
import { DotVeil } from '../DotVeil'
import { MicIcon, StopIcon } from '../icons'
import { blockers, type Page, triggerKey } from '../state'
import { Entry, Keys, SetupRow, SheetHead, useToast } from '../ui'

export const MODEL_LABEL: Record<ClaudeModel, string> = {
  'claude-opus-5-5': 'Claude Opus 5.5',
  'claude-sonnet-5-5': 'Claude Sonnet 5.5',
  'claude-haiku-5-5': 'Claude Haiku 5.5',
}

interface Props {
  state: AppState
  setState: (s: AppState) => void
  go: (p: Page, focusId?: string) => void
}

const isToday = (ts: number) => new Date(ts).toDateString() === new Date().toDateString()
const countWords = (t: string) => t.split(/\s+/).filter(Boolean).length

function SetupList({ state, setState, go }: Props) {
  const { setup, settings } = state
  const mac = setup.platform === 'darwin'
  const blocking = blockers(setup)
  const primary = (id: string) => (blocking[0] === id ? 'btn primary' : 'btn')
  const { model, mic, accessibility, claude } = setup
  const devName = mac ? ' (hiện là “Electron” khi đang phát triển)' : ''
  const fallback = claude.configured ? 'Claude' : 'cách dọn cơ bản'

  return (
    <div className="card list">
      {model.state === 'ready' && <SetupRow tone="ok" title="Nhận giọng nói">Sẵn sàng. Máy tự nhận tiếng Việt, không cần mạng.</SetupRow>}
      {model.state === 'downloading' && (
        <SetupRow
          tone="todo"
          title="Nhận giọng nói"
          action={
            <div className="progress" role="progressbar" aria-valuenow={Math.round(model.progress * 100)} aria-valuemin={0} aria-valuemax={100}>
              <div style={{ width: `${model.progress * 100}%` }} />
            </div>
          }
        >
          Đang tải… {Math.round(model.progress * 100)}% của {model.sizeMb} MB
        </SetupRow>
      )}
      {(model.state === 'missing' || model.state === 'error') && (
        <SetupRow
          tone={model.state === 'error' ? 'bad' : 'todo'}
          title="Nhận giọng nói"
          action={
            <button className={primary('model')} onClick={() => void window.spark.downloadModel().then(setState)}>
              {model.state === 'error' ? 'Thử lại' : `Tải về · ${model.sizeMb} MB`}
            </button>
          }
        >
          {model.state === 'error' ? model.error : 'Spark cần bộ nhận tiếng Việt. Tải một lần, sau đó chạy không cần mạng.'}
        </SetupRow>
      )}

      {mic === 'granted' && <SetupRow tone="ok" title="Micro">Đã cho phép.</SetupRow>}
      {mic === 'not-determined' && (
        <SetupRow tone="todo" title="Micro" action={<button className="btn" onClick={() => void window.spark.requestMic().then(setState)}>Cho phép</button>}>
          macOS sẽ hỏi bạn một lần.
        </SetupRow>
      )}
      {mic === 'denied' && (
        <SetupRow tone="bad" title="Micro" action={<button className={primary('mic')} onClick={() => void window.spark.openMicSettings()}>Mở Cài đặt</button>}>
          macOS đang chặn micro. Bật Spark{devName} trong mục Micro rồi quay lại đây.
        </SetupRow>
      )}

      {mac && accessibility === 'granted' && <SetupRow tone="ok" title="Tự dán">Đã bật. Chữ vào thẳng ứng dụng bạn đang dùng.</SetupRow>}
      {mac && accessibility !== 'granted' && (
        <SetupRow tone="todo" title="Tự dán" action={<button className="btn" onClick={() => void window.spark.requestAccessibility().then(setState)}>Bật</button>}>
          Chưa bật thì Spark chỉ copy chữ, bạn tự nhấn ⌘V. Bật Spark{devName} trong mục Trợ năng.
        </SetupRow>
      )}

      {!setup.hotkey.ok && (
        <SetupRow
          tone="bad"
          title="Phím tắt"
          action={
            setup.hotkey.reason === 'permission' ? (
              <button className={primary('hotkey')} onClick={() => void window.spark.requestAccessibility().then(setState)}>
                Bật
              </button>
            ) : (
              <button className={primary('hotkey')} onClick={() => go('settings')}>
                Đổi phím
              </button>
            )
          }
        >
          {setup.hotkey.error}
        </SetupRow>
      )}

      {settings.cleanup === 'local' ? (
        setup.localModel.state === 'ready' ? (
          <SetupRow tone="ok" title="Dọn chữ trên máy">
            Đang dùng Gemma 4{claude.configured ? ', Claude dự phòng.' : '.'}
          </SetupRow>
        ) : (
          <SetupRow tone="todo" title="Dọn chữ trên máy" action={<button className="btn" onClick={() => go('settings')}>{setup.localModel.state === 'downloading' ? 'Xem' : 'Tải về'}</button>}>
            {setup.localModel.state === 'downloading' ? `Đang tải Gemma 4… ${Math.round(setup.localModel.progress * 100)}%.` : 'Chưa tải Gemma 4.'} Trong lúc chờ, Spark dùng {fallback}.
          </SetupRow>
        )
      ) : settings.cleanup === 'basic' ? (
        <SetupRow tone="off" title="Dọn chữ bằng Claude" action={<button className="btn" onClick={() => go('settings')}>Bật</button>}>
          Đang tắt. Spark chỉ dọn cơ bản.
        </SetupRow>
      ) : claude.configured ? (
        <SetupRow tone="ok" title="Dọn chữ bằng Claude">
          Đang dùng {MODEL_LABEL[settings.claudeModel]}
          {claude.source === 'env' ? ', khoá lấy từ ANTHROPIC_API_KEY.' : `, khoá ${claude.keyHint}.`}
        </SetupRow>
      ) : (
        <SetupRow tone="off" title="Dọn chữ bằng Claude" action={<button className="btn" onClick={() => go('settings', 'apikey')}>Thêm khoá API</button>}>
          Claude thêm dấu câu, chữ số, danh sách và sửa tên riêng. Chưa có khoá thì Spark chỉ dọn cơ bản.
        </SetupRow>
      )}
    </div>
  )
}

export function Home(props: Props) {
  const { state, go } = props
  const { setup, settings, phase } = state
  const mac = setup.platform === 'darwin'
  const blocking = blockers(setup)
  const canTry = setup.model.state === 'ready' && setup.mic !== 'denied'
  // Once everything works, Home shows no setup at all; it comes back by itself if something breaks.
  const ready = blocking.length === 0 && setup.mic === 'granted' && (!mac || setup.accessibility === 'granted')
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [toast, showToast] = useToast()
  const tryRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    void window.spark.listHistory('').then(setHistory)
    return window.spark.onHistory((e) => {
      setHistory((h) => [e, ...h])
      // Without auto-paste the text only reaches the clipboard; put it in the try box anyway.
      const box = tryRef.current
      if (box && document.activeElement === box && e.inserted === 'clipboard') box.setRangeText(`${e.text} `, box.selectionStart, box.selectionEnd, 'end')
    })
  }, [])

  const wordsToday = history.filter((h) => isToday(h.createdAt)).reduce((n, h) => n + countWords(h.text), 0)
  const live = phase === 'recording'
  const working = phase === 'transcribing' || phase === 'cleaning'

  const tryIt = () => {
    tryRef.current?.focus()
    void window.spark.toggleDictation()
  }

  return (
    <>
      <SheetHead
        left={<span className="crumb">{new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'long' })}</span>}
        right={<span className="aside">{wordsToday.toLocaleString('vi-VN')} chữ hôm nay</span>}
      />
      <DotVeil phase={phase} />
      <div className="content fade-in">
        <section className="hero" aria-labelledby="hero-title">
          <h1 id="hero-title" className={`display hero-line${live ? ' pressed' : ''}`}>
            {settings.mode === 'hold' ? (
              <>
                Giữ <kbd className="kbd hero-key">{triggerKey(settings, setup.platform)}</kbd> rồi nói.
              </>
            ) : (
              <>
                Nhấn <Keys accelerator={settings.shortcut} platform={setup.platform} /> rồi nói.
              </>
            )}
          </h1>
        </section>

        {!ready && (
          <section aria-labelledby="setup-title">
            <h2 id="setup-title" className="section-title">
              Thiết lập
            </h2>
            <SetupList {...props} />
          </section>
        )}

        <section aria-label="Thử đọc">
          <div className={`try-card${live ? ' live' : ''}`}>
            <textarea ref={tryRef} className="try" aria-label="Thử đọc ở đây" placeholder={live ? 'Đang nghe…' : 'Chữ bạn đọc sẽ hiện ở đây.'} />
            <div className="try-bar">
              <span className="muted small">{live ? 'Nói xong thì bấm Xong.' : working ? 'Đang viết…' : ''}</span>
              <button className={`mic-btn${live ? ' live' : ''}`} onClick={tryIt} disabled={!canTry || working} title={canTry ? undefined : 'Cần thiết lập xong trước'}>
                {live ? <StopIcon /> : <MicIcon />}
                {live ? 'Xong' : working ? 'Đang viết…' : 'Thử đọc'}
              </button>
            </div>
          </div>
        </section>

        <section aria-labelledby="recent-title">
          <div className="inline" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
            <h2 id="recent-title" className="section-title">
              Gần đây
            </h2>
            {history.length > 3 && (
              <button className="link" onClick={() => go('history')}>
                Xem tất cả
              </button>
            )}
          </div>
          {history.length === 0 ? (
            <p className="empty">Những gì bạn đọc sẽ hiện ở đây.</p>
          ) : (
            <div className="entries">
              {history.slice(0, 3).map((e, i) => (
                <Entry
                  key={e.id}
                  index={i}
                  entry={e}
                  actions={
                    <button
                      className="btn ghost sm"
                      onClick={() => {
                        void window.spark.copy(e.text)
                        showToast('Đã copy')
                      }}
                    >
                      Copy
                    </button>
                  }
                />
              ))}
            </div>
          )}
        </section>
      </div>
      {toast}
    </>
  )
}
