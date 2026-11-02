import { useCallback, useEffect, useRef, useState } from 'react'
import type { OverlayView } from '../../shared/types'
import { type FieldMode, VoiceField } from './VoiceField'
import { chime, Recorder } from './recorder'

export function Overlay() {
  const [view, setView] = useState<OverlayView>({ phase: 'idle' })
  const [live, setLive] = useState(false)
  /** Words heard so far, streamed back from the speech model while you talk. */
  const [partial, setPartial] = useState('')
  const recorder = useRef(new Recorder())
  const sounds = useRef(true)
  const shown = useRef(false)
  const liveRef = useRef(false)
  const level = useCallback(() => recorder.current.level, [])

  // The start chime means "Spark can hear you now": it waits until audio is really arriving
  // and the overlay is on screen, whichever happens last.
  const maybeChime = () => {
    if (shown.current && liveRef.current && sounds.current) chime('start')
  }

  useEffect(() => {
    const r = recorder.current
    void r.prepare().catch(() => {})
    r.onLive = () => {
      liveRef.current = true
      setLive(true)
      maybeChime()
    }
    const off = () => void r.release()
    window.addEventListener('beforeunload', off)
    return () => {
      window.removeEventListener('beforeunload', off)
      off()
    }
  }, [])

  useEffect(() => {
    const sync = () =>
      void window.spark.getState().then((s) => {
        const html = document.documentElement
        html.dataset.motion = s.settings.motion === 'system' && s.setup.systemReducedMotion ? 'reduced' : 'full'
      })
    sync()
    return window.spark.overlay.onCommand((c) => c.type === 'start' && sync())
  }, [])

  useEffect(
    () =>
      window.spark.overlay.onCommand(async (cmd) => {
        const r = recorder.current
        if (cmd.type === 'view') {
          const firstShow = cmd.view.phase === 'recording' && !shown.current
          if (cmd.view.phase === 'recording') shown.current = true
          setView(cmd.view)
          if (firstShow) maybeChime()
          return
        }
        if (cmd.type === 'partial') return setPartial(cmd.text)
        if (cmd.type === 'start') {
          setPartial('')
          sounds.current = cmd.sounds
          shown.current = false
          liveRef.current = false
          setLive(false)
          try {
            await r.start(cmd.deviceId)
          } catch (e) {
            window.spark.overlay.micError(e instanceof Error ? e.message : String(e))
          }
        }
        if (cmd.type === 'stop') {
          // Hand over what was heard up to the release right away; Spark starts reading it while the tail records.
          const heard = r.takeNew()
          window.spark.overlay.partialAudio(heard, r.sampleRate, true)
          if (sounds.current) chime('stop')
          const openMs = r.openMs ?? undefined
          const audio = await r.stop()
          await window.spark.overlay.sendAudio({ ...audio, openMs })
        }
        if (cmd.type === 'cancel') {
          setPartial('')
          shown.current = false
          liveRef.current = false
          setLive(false)
          setView({ phase: 'idle' })
          await r.release()
        }
      }),
    [],
  )

  useEffect(() => {
    if (view.phase !== 'recording') return
    let raf = 0
    const loop = () => {
      // Streamed to Home every frame, so its field reacts on the same beat as your voice.
      window.spark.overlay.level(Math.min(1, recorder.current.level))
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [view.phase])

  // Stream fresh audio to the speech model about three times a second while recording.
  useEffect(() => {
    if (view.phase !== 'recording') return
    const r = recorder.current
    const id = setInterval(() => {
      if (!liveRef.current) return
      const pcm = r.takeNew()
      if (pcm.length) window.spark.overlay.partialAudio(pcm, r.sampleRate)
    }, 300)
    return () => clearInterval(id)
  }, [view.phase])

  useEffect(() => {
    if (view.phase === 'error' && sounds.current) chime('error')
    if (view.phase === 'done' || view.phase === 'error' || view.phase === 'idle') setPartial('')
  }, [view.phase])

  if (view.phase === 'idle') return null

  const mode: FieldMode =
    view.phase === 'recording' ? (live ? 'listening' : 'waiting') : view.phase === 'transcribing' || view.phase === 'cleaning' ? 'working' : view.phase
  // While talking (and while Spark writes) the bubble shows the words heard so far; otherwise words
  // appear only when there is something to read or do.
  const streaming = (mode === 'listening' || mode === 'working') && !!partial
  const text = streaming ? partial : view.phase === 'recording' ? (view.handsFree ? 'Hands-free' : undefined) : view.phase === 'done' || view.phase === 'error' ? view.message : undefined
  const spoken = { waiting: 'Đang mở microphone', listening: 'Đang nghe', working: 'Đang viết', done: 'Xong', error: 'Có lỗi' }[mode]

  return (
    <div className={`pill ${mode}${text ? ' with-text' : ''}${streaming ? ' streaming' : ''}`} role="status" aria-live="polite" aria-label={streaming ? spoken : (text ?? spoken)}>
      <VoiceField mode={mode} level={level} />
      {streaming ? (
        <span className="pill-stream">
          <span>{partial}</span>
        </span>
      ) : (
        text && <span className="pill-text">{text}</span>
      )}
    </div>
  )
}
