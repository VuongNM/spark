import { useEffect, useState } from 'react'
import { acceleratorFromEvent, holdKeyLabel } from '../../../shared/accelerator'
import type { AppState, ClaudeModel, HoldKey, Settings as S, Style } from '../../../shared/types'
import { Keys, SheetHead } from '../ui'
import { MODEL_LABEL } from './Home'

interface Props {
  state: AppState
  setState: (s: AppState) => void
}

const MODEL_NOTE: Record<ClaudeModel, string> = {
  'claude-haiku-5-5': 'khoảng 1 giây, hợp để đọc nhất',
  'claude-sonnet-5-5': 'giỏi hơn, khoảng 2 giây',
  'claude-opus-5-5': 'giỏi nhất, chậm nhất',
}

export function Settings({ state, setState }: Props) {
  const { settings, setup } = state
  const mac = setup.platform === 'darwin'
  const update = (patch: Partial<S>) => void window.spark.updateSettings(patch).then(setState)

  return (
    <>
      <SheetHead left={<span className="aside">Tự động lưu</span>} />
      <div className="content fade-in">
        <h1 className="page-title">Cài đặt</h1>
        <ShortcutSection state={state} update={update} />
        <MicSection deviceId={settings.micDeviceId} update={update} />
        <CleanupSection state={state} setState={setState} update={update} />

        <section aria-labelledby="general-title">
          <h2 id="general-title" className="section-title">Chung</h2>
          <div className="card list">
            <Toggle label="Phát tiếng báo khi bắt đầu và dừng thu" checked={settings.sounds} onChange={(v) => update({ sounds: v })} />
            <Toggle label="Lưu lịch sử trên máy này" checked={settings.keepHistory} onChange={(v) => update({ keepHistory: v })} />
            <Toggle label="Trả lại nội dung đã copy sau khi dán" checked={settings.restoreClipboard} onChange={(v) => update({ restoreClipboard: v })} />
            <Toggle
              label="Giữ 20 bản ghi âm gần nhất trên máy để dò lỗi nhận giọng. Tắt đi thì Spark xoá hết."
              checked={settings.keepRecordings}
              onChange={(v) => update({ keepRecordings: v })}
            />
            <Toggle label="Mở Spark khi đăng nhập" checked={settings.launchAtLogin} onChange={(v) => update({ launchAtLogin: v })} />
            <label className="check">
              <span>Giao diện</span>
              <select className="select" value={settings.theme} onChange={(e) => update({ theme: e.target.value as S['theme'] })} aria-label="Giao diện">
                <option value="system">Theo hệ thống</option>
                <option value="light">Sáng</option>
                <option value="dark">Tối</option>
              </select>
            </label>
            <label className="check">
              <span className="row-main">
                <span>Hiệu ứng chuyển động</span>
                {setup.systemReducedMotion && <span className="muted small">macOS đang bật Giảm chuyển động, nên “Theo hệ thống” giữ hiệu ứng ở mức tối thiểu.</span>}
              </span>
              <select className="select" value={settings.motion} onChange={(e) => update({ motion: e.target.value as S['motion'] })} aria-label="Hiệu ứng chuyển động">
                <option value="system">Theo hệ thống</option>
                <option value="full">Luôn đầy đủ</option>
              </select>
            </label>
          </div>
        </section>

        <section aria-labelledby="data-title">
          <h2 id="data-title" className="section-title">Dữ liệu</h2>
          <div className="card row" style={{ gap: 20 }}>
            <p className="row-main muted">Lịch sử, từ điển và cài đặt chỉ nằm trên máy này. macOS mã hoá khoá API của bạn trong Keychain.</p>
            <button className="btn" onClick={() => void window.spark.openDataFolder()}>
              Mở thư mục
            </button>
          </div>
        </section>
      </div>
    </>
  )
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="check">
      {label}
      <input className="switch" type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  )
}

const GLOBE_ACTION: Partial<Record<AppState['setup']['globeKey'], string>> = {
  'input-source': 'đổi bộ gõ',
  emoji: 'mở bảng emoji',
  dictation: 'bật Đọc chính tả của Apple',
}

function ShortcutSection({ state, update }: { state: AppState; update: (p: Partial<S>) => void }) {
  const { settings, setup } = state
  const [recording, setRecording] = useState(false)

  useEffect(() => {
    if (!recording) return
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault()
      if (e.key === 'Escape') return setRecording(false)
      const acc = acceleratorFromEvent(e, setup.platform)
      if (acc) {
        update({ shortcut: acc })
        setRecording(false)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [recording, setup.platform])

  const holdValue = settings.mode === 'hold' ? settings.holdKey : 'off'
  const needsAccess = setup.platform === 'darwin' && setup.accessibility !== 'granted'

  const mac = setup.platform === 'darwin'
  const keys: HoldKey[] = mac ? ['Fn', 'AltRight', 'MetaRight', 'CtrlRight'] : ['CtrlRight', 'AltRight', 'MetaRight']

  return (
    <section aria-labelledby="shortcut-title">
      <h2 id="shortcut-title" className="section-title">Phím tắt</h2>
      <div className="card list">
        <div className="row">
          <div className="row-main">
            <label className="row-title" htmlFor="hold">
              Giữ để nói
            </label>
            <span className="muted small">
              {needsAccess && holdValue !== 'off'
                ? 'Cần bật Tự dán (Trợ năng) ở Trang chủ.'
                : 'Giữ phím trong lúc nói, thả ra là dán. Nhấn đúp, hoặc nhấn cùng Space, để nói rảnh tay.'}
            </span>
          </div>
          <select
            id="hold"
            className="select"
            value={holdValue}
            onChange={(e) => (e.target.value === 'off' ? update({ mode: 'toggle' }) : update({ mode: 'hold', holdKey: e.target.value as HoldKey }))}
          >
            {keys.map((k) => (
              <option key={k} value={k}>
                {holdKeyLabel(k, setup.platform)}
              </option>
            ))}
            <option value="off">Tắt</option>
          </select>
        </div>
        {mac && holdValue === 'Fn' && setup.globeKey !== 'nothing' && setup.globeKey !== 'n/a' && (
          <div className="row">
            <div className="row-main">
              <span className="row-title">Phím fn của macOS</span>
              <span className="muted small">
                Khi bạn nhấn riêng fn, macOS cũng {GLOBE_ACTION[setup.globeKey] ?? 'làm việc khác'}. Nếu thấy vướng, chọn “Nhấn phím 🌐 để” là Không làm gì
                {setup.globeKey === 'input-source' ? ', rồi đổi Telex/ABC bằng ⌃Space.' : '.'}
              </span>
            </div>
            <button className="btn" onClick={() => void window.spark.openKeyboardSettings()}>
              Mở Bàn phím
            </button>
          </div>
        )}
        <div className="row">
          <div className="row-main">
            <span className="row-title">Phím rảnh tay</span>
            <span className="muted small">{recording ? 'Nhấn tổ hợp phím mới. Esc để huỷ.' : 'Nhấn một lần để bắt đầu, nhấn lần nữa để xong.'}</span>
          </div>
          {recording ? <span className="kbd" style={{ minWidth: 120 }}>…</span> : <Keys accelerator={settings.shortcut} platform={setup.platform} />}
          <button className="btn" onClick={() => setRecording((r) => !r)}>
            {recording ? 'Huỷ' : 'Đổi'}
          </button>
        </div>
        {!setup.hotkey.ok && (
          <p className="note bad" role="alert" style={{ margin: 12 }}>
            {setup.hotkey.error}
          </p>
        )}
      </div>
    </section>
  )
}

function MicSection({ deviceId, update }: { deviceId: string; update: (p: Partial<S>) => void }) {
  const [mics, setMics] = useState<MediaDeviceInfo[]>([])
  useEffect(() => {
    const load = () => void navigator.mediaDevices.enumerateDevices().then((d) => setMics(d.filter((x) => x.kind === 'audioinput' && x.deviceId !== 'default')))
    load()
    navigator.mediaDevices.addEventListener('devicechange', load)
    return () => navigator.mediaDevices.removeEventListener('devicechange', load)
  }, [])
  const missing = deviceId !== 'default' && mics.length > 0 && !mics.some((m) => m.deviceId === deviceId)
  return (
    <section aria-labelledby="mic-title">
      <h2 id="mic-title" className="section-title">Micro</h2>
      <div className="card card-pad field">
        <label htmlFor="mic">Thu từ</label>
        <select id="mic" className="select" value={missing ? 'default' : deviceId} onChange={(e) => update({ micDeviceId: e.target.value })} style={{ maxWidth: 360 }}>
          <option value="default">Theo hệ thống</option>
          {mics.map((m, i) => (
            <option key={m.deviceId} value={m.deviceId}>
              {m.label || `Micro ${i + 1}`}
            </option>
          ))}
        </select>
        {missing && <span className="muted small">Micro bạn chọn đang không cắm, Spark dùng micro của hệ thống.</span>}
      </div>
    </section>
  )
}

function LocalModelPanel({ state, setState }: Props) {
  const { localModel: m, claude } = state.setup
  const gb = (m.sizeMb / 1000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })
  const fallback = claude.configured ? 'Claude' : 'cách dọn cơ bản'
  const backup = claude.configured ? 'Khi kết quả có vẻ sai, Spark nhờ Claude làm lại.' : 'Khi kết quả có vẻ sai, Spark dọn cơ bản. Thêm khoá Claude để Claude làm lại thay.'
  return (
    <div className="card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {m.state === 'ready' && <span>Sẵn sàng. {backup}</span>}
      {m.state === 'downloading' && (
        <>
          <div className="progress" style={{ width: '100%', maxWidth: 360 }} role="progressbar" aria-label="Đang tải Gemma 4" aria-valuenow={Math.round(m.progress * 100)} aria-valuemin={0} aria-valuemax={100}>
            <div style={{ width: `${m.progress * 100}%` }} />
          </div>
          <span className="muted small">
            Đang tải Gemma 4… {Math.round(m.progress * 100)}% của {gb} GB. Trong lúc chờ, Spark dùng {fallback}.
          </span>
        </>
      )}
      {(m.state === 'missing' || m.state === 'error') && (
        <div className="inline">
          <button className="btn primary" onClick={() => void window.spark.downloadLocalModel().then(setState)}>
            {m.state === 'error' ? 'Thử lại' : `Tải Gemma 4 · ${gb} GB`}
          </button>
          <span className={`small ${m.state === 'error' ? '' : 'muted'}`} style={m.state === 'error' ? { color: 'var(--danger)' } : undefined}>{m.state === 'error' ? m.error : `Trong lúc chờ, Spark dùng ${fallback}.`}</span>
        </div>
      )}
    </div>
  )
}

function CleanupSection({ state, setState, update }: Props & { update: (p: Partial<S>) => void }) {
  const { settings, setup } = state
  const [key, setKey] = useState('')
  const [test, setTest] = useState<{ ok: boolean; message: string } | 'running' | null>(null)

  const runTest = async (k?: string) => {
    setTest('running')
    setTest(await window.spark.testApiKey(k))
  }
  const saveKey = async () => {
    const k = key.trim()
    if (!k) return
    setState(await window.spark.saveApiKey(k))
    setKey('')
    await runTest()
  }

  return (
    <section aria-labelledby="cleanup-title">
      <h2 id="cleanup-title" className="section-title">Dọn chữ</h2>
      <div className="card list">
        <label className="choice">
          <input type="radio" name="cleanup" checked={settings.cleanup === 'claude'} onChange={() => update({ cleanup: 'claude' })} />
          <div className="row-main">
            <span className="row-title">Claude</span>
            <span className="muted small">
              Viết lại thành chữ hoàn chỉnh: dấu câu, chữ số, danh sách, tên riêng, bỏ từ đệm, đúng giọng ứng dụng bạn đang dùng. Spark gửi chữ (không gửi âm thanh) sang Anthropic. Mất khoảng 1 giây.
            </span>
          </div>
        </label>
        <label className="choice">
          <input type="radio" name="cleanup" checked={settings.cleanup === 'local'} onChange={() => update({ cleanup: 'local' })} />
          <div className="row-main">
            <span className="row-title">Trên máy</span>
            <span className="muted small">
              Gemma 4 dọn chữ ngay trên Mac: miễn phí, riêng tư, không cần mạng, khoảng nửa giây. Gemma sai nhiều hơn Claude nên Spark kiểm tra từng kết quả trước khi gõ. Cần tải {(setup.localModel.sizeMb / 1000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} GB và chiếm khoảng 2 GB bộ nhớ khi Spark chạy.
            </span>
          </div>
        </label>
        {settings.cleanup === 'local' && <LocalModelPanel state={state} setState={setState} />}
        <label className="choice">
          <input type="radio" name="cleanup" checked={settings.cleanup === 'basic'} onChange={() => update({ cleanup: 'basic' })} />
          <div className="row-main">
            <span className="row-title">Cơ bản</span>
            <span className="muted small">Không cần mạng, xong ngay. Bỏ ờ, ừm, sửa từ theo từ điển, viết hoa đầu câu và thêm dấu chấm. Không thêm dấu phẩy hay chữ số.</span>
          </div>
        </label>

        {settings.cleanup !== 'basic' && (
          <Toggle label="Viết lại cho gọn: bỏ chỗ lặp, nối lời nói thành câu hoàn chỉnh" checked={settings.polish} onChange={(v) => update({ polish: v })} />
        )}

        {settings.cleanup === 'claude' && (
          <div className="card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="field">
              <label htmlFor="model">Mô hình</label>
              <select id="model" className="select" value={settings.claudeModel} onChange={(e) => update({ claudeModel: e.target.value as ClaudeModel })} style={{ maxWidth: 360 }}>
                {(Object.keys(MODEL_NOTE) as ClaudeModel[]).map((m) => (
                  <option key={m} value={m}>
                    {MODEL_LABEL[m]} · {MODEL_NOTE[m]}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="style">Giọng viết</label>
              <select id="style" className="select" value={settings.style} onChange={(e) => update({ style: e.target.value as Style })} style={{ maxWidth: 360 }}>
                <option value="auto">Theo ứng dụng (thân mật khi nhắn tin, trang trọng khi viết email)</option>
                <option value="casual">Luôn thân mật</option>
                <option value="formal">Luôn trang trọng</option>
              </select>
            </div>

            <div className="field">
              <label htmlFor="apikey">Khoá API</label>
              {setup.claude.source === 'saved' ? (
                <div className="inline">
                  <span>Đã lưu khoá {setup.claude.keyHint}</span>
                  <button className="btn sm" onClick={() => void runTest()} disabled={test === 'running'}>
                    Kiểm tra
                  </button>
                  <button className="btn sm danger" onClick={() => void window.spark.saveApiKey(null).then(setState)}>
                    Xoá
                  </button>
                </div>
              ) : (
                <>
                  {setup.claude.source === 'env' && <span className="muted small">Spark đang dùng ANTHROPIC_API_KEY trong máy. Dán khoá khác vào dưới đây nếu muốn đổi.</span>}
                  <div className="inline">
                    <input
                      id="apikey"
                      className="input"
                      type="password"
                      placeholder="sk-ant-…"
                      autoComplete="off"
                      value={key}
                      onChange={(e) => setKey(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && void saveKey()}
                      style={{ flex: 1, maxWidth: 360 }}
                    />
                    <button className="btn primary" onClick={() => void saveKey()} disabled={!key.trim()}>
                      Lưu
                    </button>
                  </div>
                  <span className="muted small">
                    Lấy khoá ở{' '}
                    <button className="link" onClick={() => void window.spark.openUrl('https://console.anthropic.com/settings/keys')}>
                      console.anthropic.com
                    </button>
                    . Anthropic tính phí vào tài khoản của bạn.
                  </span>
                </>
              )}
              {test === 'running' && <span className="muted small">Đang kiểm tra…</span>}
              {test && test !== 'running' && (
                <p className={`note ${test.ok ? 'good' : 'bad'}`} role="status" style={{ whiteSpace: 'pre-wrap' }}>
                  {test.message}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
