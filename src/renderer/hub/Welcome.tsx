import { type ReactNode, useEffect, useRef, useState } from 'react'
import type { AppState, HistoryEntry, Phase } from '../../shared/types'
import { DotVeil } from './DotVeil'
import { BookIcon, CheckIcon, HistoryIcon, Logo, SlidersIcon, TrayGlyph } from './icons'
import { MODEL_LABEL } from './pages/Home'
import { GLOBE_ACTION } from './pages/Settings'
import { type Page, triggerKey } from './state'
import { CLEANED_BY, Keys, SetupRow } from './ui'

/**
 * First-run tour: what Spark does, the setup it needs, three sentences to read out loud with the
 * real hotkey, then a few tips. Shown until it is finished or skipped; Settings can show it again.
 */

type Step = 'hello' | 'setup' | 'try' | 'tips'
const STEPS: Step[] = ['hello', 'setup', 'try', 'tips']

interface Props {
  state: AppState
  setState: (s: AppState) => void
  /** Ends the tour (finished or skipped) and opens a page of the app. */
  done: (page?: Page) => void
}

/**
 * Sentences to read out loud, picked by running TTS clips through the real pipeline: plain Vietnamese
 * with fillers comes out right on every engine, and these English words survive speech-to-text.
 */
const SAMPLES: { text: string; hint: string; basicHint?: string }[] = [
  { text: 'Ờ, chiều nay ba giờ mình họp với cả team, ừm, nhớ mang theo máy tính nhé.', hint: 'Cứ nói ờ, ừm như bình thường, Spark bỏ giúp bạn.' },
  { text: 'Bạn review giúp mình cái function này trước khi lên production nhé.', hint: 'Từ tiếng Anh cứ đọc như lúc nói chuyện với team.' },
  {
    text: 'Tuần này mình cần làm ba việc: sửa lỗi đăng nhập, viết thêm test, và cập nhật tài liệu.',
    hint: 'Đọc như đang liệt kê, Spark tách thành danh sách.',
    basicHint: 'Câu dài hơn một chút, cứ đọc liền một hơi.',
  },
]

/** True when an LLM rewrites the text (Claude with a key, or Gemma on this Mac). */
const hasLlm = (s: AppState) => s.settings.cleanup !== 'basic' && (s.setup.claude.configured || s.setup.localModel.state === 'ready')

export function Welcome({ state, setState, done }: Props) {
  const [step, setStep] = useState<Step>('hello')
  const at = STEPS.indexOf(step)
  const go = (by: number) => setStep(STEPS[Math.min(STEPS.length - 1, Math.max(0, at + by))])
  const mac = state.setup.platform === 'darwin'

  return (
    <div className="welcome">
      <div className="welcome-sheet">
        <DotVeil phase={state.phase} />
        <header className={`welcome-head${mac ? ' mac' : ''}`}>
          <div className="brand">
            <Logo live={state.phase === 'recording'} />
            <span className="wordmark">Spark</span>
          </div>
          {step !== 'tips' && (
            <button className="btn ghost sm" onClick={() => done()}>
              Bỏ qua hướng dẫn
            </button>
          )}
        </header>
        <div className="welcome-body" key={step}>
          {step === 'hello' && <Hello state={state} next={() => go(1)} />}
          {step === 'setup' && <Setup state={state} setState={setState} done={done} back={() => go(-1)} next={() => go(1)} />}
          {step === 'try' && <Try state={state} back={() => go(-1)} next={() => go(1)} />}
          {step === 'tips' && <Tips state={state} back={() => go(-1)} finish={() => done()} />}
        </div>
      </div>
    </div>
  )
}

function Foot({ at, back, hint, next }: { at: number; back?: () => void; hint?: ReactNode; next: ReactNode }) {
  return (
    <footer className="welcome-foot">
      <div className="welcome-foot-side">
        {back && (
          <button className="btn ghost" onClick={back}>
            Quay lại
          </button>
        )}
      </div>
      <ol className="steps" aria-label={`Bước ${at + 1} trên ${STEPS.length}`}>
        {STEPS.map((s, i) => (
          <li key={s} className={i === at ? 'on' : i < at ? 'past' : undefined} />
        ))}
      </ol>
      <div className="welcome-foot-side end">
        {hint && <span className="muted small">{hint}</span>}
        {next}
      </div>
    </footer>
  )
}

function Hello({ state, next }: { state: AppState; next: () => void }) {
  const key = triggerKey(state.settings, state.setup.platform)
  return (
    <>
      <div className="welcome-main">
        <h1 className="display">Speech to text tiếng Việt</h1>
        <p className="lede">
          Giữ <kbd className="kbd sm">{key}</kbd> rồi nói, thả ra là Spark paste text vào ô đang focus: Cursor, VS Code, Terminal, Slack, app nào cũng được.
        </p>
        <div className="hello-demo" aria-hidden>
          <div className="hello-field">
            <span className="hello-text">Chiều nay 3 giờ mình họp với cả team nhé.</span>
            <span className="hello-caret" />
          </div>
          <div className="hello-keys">
            <kbd className="kbd hello-key">{key}</kbd>
            <span className="hello-bubble">
              <i />
              <i />
              <i />
              <i />
              <i />
            </span>
          </div>
        </div>
        <p className="muted">Thiết lập và đọc thử vài câu mất khoảng hai phút.</p>
      </div>
      <Foot
        at={0}
        next={
          <button className="btn primary" onClick={next}>
            Bắt đầu
          </button>
        }
      />
    </>
  )
}

function Setup({ state, setState, done, back, next }: Props & { back: () => void; next: () => void }) {
  const { setup, settings } = state
  const { model, mic, accessibility, hotkey } = setup
  const mac = setup.platform === 'darwin'
  const key = triggerKey(settings, setup.platform)
  // The speech model is required and small, so it starts downloading as soon as you get here.
  const started = useRef(false)
  useEffect(() => {
    if (model.state === 'missing' && !started.current) {
      started.current = true
      void window.spark.downloadModel().then(setState)
    }
  }, [model.state])

  const missing =
    model.state !== 'ready'
      ? model.state === 'downloading'
        ? 'Đang tải model STT…'
        : 'Cần tải model STT'
      : mic !== 'granted'
        ? 'Cho phép Microphone để đi tiếp'
        : mac && accessibility !== 'granted'
          ? 'Bật Accessibility để đi tiếp'
          : !hotkey.ok
            ? 'Sửa hotkey để đi tiếp'
            : null
  const first = (id: string) => (missing && id === firstMissing(state) ? 'btn primary' : 'btn')
  const showGlobe = mac && settings.mode === 'hold' && settings.holdKey === 'Fn' && setup.globeKey !== 'nothing' && setup.globeKey !== 'n/a'

  return (
    <>
      <div className="welcome-main">
        <h1 className="page-title">Thiết lập</h1>
        <p className="lede">
          {mac ? 'Spark cần model STT, quyền dùng Microphone và Accessibility.' : 'Spark cần model STT và quyền dùng Microphone.'} Audio được xử lý ngay trên máy, không gửi đi đâu.
        </p>
        <div className="card list">
          {model.state === 'ready' && <SetupRow tone="ok" title="Model STT">Đã tải. STT chạy on-device, không cần mạng.</SetupRow>}
          {model.state === 'downloading' && (
            <SetupRow
              tone="todo"
              title="Model STT"
              action={
                <div className="progress" role="progressbar" aria-label="Đang tải model STT" aria-valuenow={Math.round(model.progress * 100)} aria-valuemin={0} aria-valuemax={100}>
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
              title="Model STT"
              action={
                <button className={first('model')} onClick={() => void window.spark.downloadModel().then(setState)}>
                  {model.state === 'error' ? 'Thử lại' : `Tải về · ${model.sizeMb} MB`}
                </button>
              }
            >
              {model.state === 'error' ? model.error : 'Model STT tiếng Việt, tải một lần rồi chạy offline.'}
            </SetupRow>
          )}

          {mic === 'granted' && <SetupRow tone="ok" title="Microphone">Đã cho phép.</SetupRow>}
          {mic === 'not-determined' && (
            <SetupRow tone="todo" title="Microphone" action={<button className={first('mic')} onClick={() => void window.spark.requestMic().then(setState)}>Cho phép</button>}>
              Spark chỉ bật microphone lúc bạn giữ phím.
            </SetupRow>
          )}
          {mic === 'denied' && (
            <SetupRow tone="bad" title="Microphone" action={<button className={first('mic')} onClick={() => void window.spark.openMicSettings()}>{mac ? 'Mở System Settings' : 'Mở Settings'}</button>}>
              {mac
                ? 'macOS đang chặn microphone. Bật Spark trong System Settings → Privacy & Security → Microphone rồi quay lại đây.'
                : 'Windows đang chặn microphone. Vào Settings → Privacy & security → Microphone, bật “Let desktop apps access your microphone” rồi quay lại đây.'}
            </SetupRow>
          )}

          {mac && accessibility === 'granted' && <SetupRow tone="ok" title="Accessibility">Đã bật.</SetupRow>}
          {mac && accessibility !== 'granted' && (
            <SetupRow tone="todo" title="Accessibility" action={<button className={first('accessibility')} onClick={() => void window.spark.requestAccessibility().then(setState)}>Bật</button>}>
              Để Spark nghe phím {key} và paste text vào ô đang focus. Bấm Bật rồi bật Spark trong System Settings → Privacy & Security → Accessibility.
            </SetupRow>
          )}

          {!hotkey.ok && hotkey.reason !== 'permission' && (
            <SetupRow tone="bad" title="Hotkey" action={<button className={first('hotkey')} onClick={() => done('settings')}>Mở Cài đặt</button>}>
              {hotkey.error}
            </SetupRow>
          )}
        </div>

        <section aria-labelledby="optional-title">
          <h2 id="optional-title" className="section-title">
            Không bắt buộc
          </h2>
          <div className="card list">
            <CleanupRow state={state} setState={setState} />
            {showGlobe && (
              <SetupRow tone="off" title="Phím 🌐" action={<button className="btn" onClick={() => void window.spark.openKeyboardSettings()}>Mở Keyboard Settings</button>}>
                Nhấn riêng fn thì macOS cũng {GLOBE_ACTION[setup.globeKey] ?? 'làm việc khác'}. Nếu thấy vướng, chọn “Do Nothing” ở “Press 🌐 key to”
                {setup.globeKey === 'input-source' ? ', rồi đổi Telex/ABC bằng ⌃Space.' : '.'}
              </SetupRow>
            )}
          </div>
        </section>
      </div>
      <Foot
        at={1}
        back={back}
        hint={missing}
        next={
          <button className="btn primary" onClick={next} disabled={!!missing}>
            Tiếp tục
          </button>
        }
      />
    </>
  )
}

function firstMissing({ setup }: AppState): string | null {
  if (setup.model.state !== 'ready') return 'model'
  if (setup.mic !== 'granted') return 'mic'
  if (setup.platform === 'darwin' && setup.accessibility !== 'granted') return 'accessibility'
  if (!setup.hotkey.ok) return 'hotkey'
  return null
}

/** Optional: Gemma on this Mac or a Claude key, so the practice sentences come out properly written. */
function CleanupRow({ state, setState }: { state: AppState; setState: (s: AppState) => void }) {
  const { setup, settings } = state
  const m = setup.localModel
  const [keyOpen, setKeyOpen] = useState(false)
  const [key, setKey] = useState('')
  const [test, setTest] = useState<{ ok: boolean; message: string } | 'running' | null>(null)
  const gb = (m.sizeMb / 1000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })

  const saveKey = async () => {
    const k = key.trim()
    if (!k) return
    setTest('running')
    const result = await window.spark.testApiKey(k)
    setTest(result)
    if (!result.ok) return
    if (settings.cleanup !== 'claude') await window.spark.updateSettings({ cleanup: 'claude' })
    setState(await window.spark.saveApiKey(k))
    setKey('')
  }
  const getGemma = async () => {
    // Picking Gemma here means you want it: make it the cleanup engine, then fetch it.
    setState(await window.spark.updateSettings({ cleanup: 'local' }))
    setState(await window.spark.downloadLocalModel())
  }

  if (settings.cleanup !== 'local' && setup.claude.configured) return <SetupRow tone="ok" title="LLM cleanup">Đang dùng {MODEL_LABEL[settings.claudeModel]}.</SetupRow>
  if (m.state === 'ready') return <SetupRow tone="ok" title="LLM cleanup">Gemma 4 chạy local, đã sẵn sàng.</SetupRow>
  if (m.state === 'downloading')
    return (
      <SetupRow
        tone="todo"
        title="LLM cleanup"
        action={
          <div className="progress" role="progressbar" aria-label="Đang tải Gemma 4" aria-valuenow={Math.round(m.progress * 100)} aria-valuemin={0} aria-valuemax={100}>
            <div style={{ width: `${m.progress * 100}%` }} />
          </div>
        }
      >
        Đang tải Gemma 4… {Math.round(m.progress * 100)}% của {gb} GB. Cứ đọc thử trong lúc chờ.
      </SetupRow>
    )
  return (
    <>
      <SetupRow tone="off" title="LLM cleanup">
        {m.state === 'error' ? m.error : 'Thêm dấu phẩy, chữ số, danh sách và viết đúng từ tiếng Anh. Chưa có thì Spark chỉ bỏ ờ, ừm và thêm dấu chấm.'}
        <span className="inline row-actions">
          <button className="btn" onClick={() => void getGemma()}>
            {m.state === 'error' ? 'Tải lại Gemma 4' : `Tải Gemma 4 · ${gb} GB · chạy local`}
          </button>
          {!keyOpen && (
            <button className="btn ghost" onClick={() => setKeyOpen(true)}>
              Dùng Claude API key
            </button>
          )}
        </span>
      </SetupRow>
      {keyOpen && (
        <div className="card-pad field key-pad">
          <label htmlFor="tour-apikey">Anthropic API key</label>
          <div className="inline">
            <input
              id="tour-apikey"
              className="input"
              type="password"
              placeholder="sk-ant-…"
              autoComplete="off"
              autoFocus
              value={key}
              onChange={(e) => setKey(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void saveKey()}
              style={{ flex: 1, maxWidth: 360 }}
            />
            <button className="btn primary" onClick={() => void saveKey()} disabled={!key.trim() || test === 'running'}>
              {test === 'running' ? 'Đang kiểm tra…' : 'Lưu'}
            </button>
          </div>
          {test && test !== 'running' && !test.ok ? (
            <p className="note bad" role="status">
              {test.message}
            </p>
          ) : (
            <span className="muted small">
              Lấy API key ở{' '}
              <button className="link" onClick={() => void window.spark.openUrl('https://console.anthropic.com/settings/keys')}>
                console.anthropic.com
              </button>
              . Anthropic tính phí vào tài khoản của bạn, Spark chỉ gửi text, không gửi audio.
            </span>
          )}
        </div>
      )}
    </>
  )
}

type Miss = 'short' | 'error' | null

function Try({ state, back, next }: { state: AppState; back: () => void; next: () => void }) {
  const { settings, setup, phase } = state
  const hold = settings.mode === 'hold'
  const key = triggerKey(settings, setup.platform)
  const [i, setI] = useState(0)
  const [result, setResult] = useState<HistoryEntry | null>(null)
  const [miss, setMiss] = useState<Miss>(null)
  const box = useRef<HTMLTextAreaElement>(null)
  const prev = useRef<Phase>(phase)

  useEffect(() => box.current?.focus(), [i])

  // Follow the dictation through its phases to say what is happening, or what went wrong.
  useEffect(() => {
    const was = prev.current
    prev.current = phase
    if (phase === 'recording' && was !== 'recording') {
      setMiss(null)
      // Spark pastes where the cursor is: select the last try so a new reading replaces it.
      const b = box.current
      if (b) {
        b.focus()
        b.select()
      }
    } else if (was === 'recording' && phase === 'idle') setMiss('short')
    else if (phase === 'error') setMiss('error')
  }, [phase])

  useEffect(
    () =>
      window.spark.onHistory((e) => {
        setResult(e)
        setMiss(null)
        const b = box.current
        if (!b) return
        // Without auto-paste the text only reaches the clipboard, or the paste may have landed elsewhere.
        if (e.inserted === 'clipboard') b.value = e.text
        else setTimeout(() => !b.value.includes(e.text) && (b.value = e.text), 400)
      }),
    [],
  )

  const sample = SAMPLES[i]
  const llm = hasLlm(state)
  const live = phase === 'recording'
  const working = phase === 'transcribing' || phase === 'cleaning'
  const last = i === SAMPLES.length - 1
  const shortcut = <Keys accelerator={settings.shortcut} platform={setup.platform} small />
  const advance = () => {
    if (last) return next()
    setI(i + 1)
    setResult(null)
    setMiss(null)
    if (box.current) box.current.value = ''
  }

  let status: ReactNode
  if (live) status = hold ? `Đang nghe… đọc xong thì thả ${key}.` : <>Đang nghe… đọc xong thì nhấn {shortcut}.</>
  else if (working) status = 'Đang viết…'
  else if (miss === 'short') status = hold ? `Bạn thả ${key} sớm quá. Giữ ${key} suốt lúc đọc, đọc xong mới thả.` : 'Spark đã huỷ. Thử lại nhé.'
  else if (miss === 'error') status = 'Spark chưa nghe rõ. Thử lại, nói to và gần microphone hơn.'
  else if (result)
    status = (
      <span className="tried">
        <CheckIcon width={16} height={16} /> Được rồi.
      </span>
    )
  else status = 'Trong lúc bạn nói, bubble ở cuối màn hình hiện những chữ Spark nghe được.'

  return (
    <>
      <div className="welcome-main">
        <div className="eyebrow">
          Câu {i + 1}/{SAMPLES.length}
        </div>
        <h1 className={`display try-line${live ? ' pressed' : ''}`}>
          {hold ? (
            <>
              Giữ <kbd className="kbd hero-key">{key}</kbd> rồi đọc câu này
            </>
          ) : (
            <>
              Nhấn <Keys accelerator={settings.shortcut} platform={setup.platform} /> rồi đọc câu này
            </>
          )}
        </h1>
        <figure className="sample" key={i}>
          <blockquote>{sample.text}</blockquote>
          <figcaption className="muted small">{llm || !sample.basicHint ? sample.hint : sample.basicHint}</figcaption>
        </figure>
        <div className={`try-card${live ? ' live' : ''}`}>
          <textarea ref={box} className="try" aria-label="Chữ Spark viết" placeholder={live ? 'Đang nghe…' : hold ? `Thả ${key} ra là chữ hiện ở đây.` : 'Nhấn lần nữa để dừng, chữ sẽ hiện ở đây.'} />
          <div className="try-bar">
            <span className="muted small" role="status" aria-live="polite">
              {status}
            </span>
          </div>
        </div>
        {result && !live && !working && (
          <div className="heard">
            <div className="entry-foot">
              <span className="tag">Cleanup: {CLEANED_BY[result.cleanedBy]}</span>
            </div>
            <p className="entry-raw">Spark nghe được: {result.raw.toLocaleLowerCase('vi')}</p>
            {result.cleanedBy === 'basic' && (
              <p className="note">
                Basic cleanup chưa thêm dấu phẩy và chữ số.{' '}
                {setup.localModel.state === 'downloading' ? 'Gemma 4 tải xong thì câu sẽ gọn hơn.' : 'Tải Gemma 4 hoặc thêm API key ở bước Thiết lập để câu gọn hơn.'}
              </p>
            )}
          </div>
        )}
      </div>
      <Foot
        at={2}
        back={back}
        next={
          <button className={result ? 'btn primary' : 'btn'} onClick={advance}>
            {last ? 'Tiếp tục' : 'Câu tiếp'}
          </button>
        }
      />
    </>
  )
}

function Tip({ visual, title, children }: { visual: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="tip">
      <div className="tip-visual" aria-hidden>
        {visual}
      </div>
      <div className="row-main">
        <span className="row-title">{title}</span>
        <span className="muted small">{children}</span>
      </div>
    </div>
  )
}

function Tips({ state, back, finish }: { state: AppState; back: () => void; finish: () => void }) {
  const { settings, setup } = state
  const mac = setup.platform === 'darwin'
  const hold = settings.mode === 'hold'
  const key = triggerKey(settings, setup.platform)
  return (
    <>
      <div className="welcome-main">
        <h1 className="page-title">Xong rồi</h1>
        <p className="lede">
          Từ giờ, click vào ô cần gõ ở app nào cũng được rồi {hold ? `giữ ${key}` : 'nhấn hotkey'} để nói. Thêm mấy mẹo nhỏ:
        </p>
        <div className="card list">
          {hold && (
            <Tip
              visual={
                <span className="inline" style={{ gap: 4 }}>
                  <kbd className="kbd sm">{key}</kbd>
                  <kbd className="kbd sm">{key}</kbd>
                </span>
              }
              title={`Nói dài thì nhấn ${key} hai lần`}
            >
              Spark nghe tiếp mà không cần giữ phím. Nhấn {key} lần nữa để dừng.
            </Tip>
          )}
          <Tip visual={<kbd className="kbd sm">esc</kbd>} title="Đổi ý thì nhấn Esc">
            Spark bỏ đoạn đang nói, không paste gì.
          </Tip>
          <Tip
            visual={
              <span className="tray-strip">
                <TrayGlyph />
              </span>
            }
            title={mac ? 'Spark chạy trên menu bar' : 'Spark chạy ở system tray'}>
            Đóng cửa sổ này thì Spark vẫn chạy. Bấm icon Spark {mac ? 'trên menu bar' : 'ở system tray'} để mở lại.
          </Tip>
          <Tip
            visual={
              <span className="inline tip-icons">
                <HistoryIcon width={18} height={18} />
                <BookIcon width={18} height={18} />
                <SlidersIcon width={18} height={18} />
              </span>
            }
            title="Lịch sử, Từ điển, Cài đặt"
          >
            Lịch sử giữ mọi câu bạn đã nói. Từ điển dạy Spark những tên riêng hay bị nghe sai. Cài đặt để đổi hotkey, chọn Gemma hay Claude.
          </Tip>
        </div>
      </div>
      <Foot
        at={3}
        back={back}
        next={
          <button className="btn primary" onClick={finish}>
            Bắt đầu dùng Spark
          </button>
        }
      />
    </>
  )
}
