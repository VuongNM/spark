import type { RecordedAudio } from '../../shared/types'

// Loaded from a Blob so it works both from the dev server and from file:// in production.
const WORKLET = `
class SparkRecorder extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0] && inputs[0][0]
    if (ch) this.port.postMessage(ch.slice(0))
    return true
  }
}
registerProcessor('spark-recorder', SparkRecorder)`

/** Keeps listening this long after release so the last syllable isn't clipped. */
export const TAIL_MS = 200

/**
 * The audio graph (context + worklet) stays built between dictations so only the microphone
 * has to open on start. The microphone itself is fully released when not recording.
 */
export class Recorder {
  private chunks: Float32Array[] = []
  /** How many chunks takeNew() has already handed out. */
  private sent = 0
  private ctx: AudioContext | null = null
  private node: AudioWorkletNode | null = null
  private ready: Promise<void> | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private stream: MediaStream | null = null
  /** Bumped by every start and release; an older start that finishes late closes its own mic. */
  private session = 0
  private startedAt = 0
  /** Milliseconds from start() to the first audio actually arriving; null until then. */
  openMs: number | null = null
  level = 0
  onLive: (() => void) | null = null

  /** Builds the context and worklet once, ahead of the first dictation. */
  prepare(): Promise<void> {
    this.ready ??= (async () => {
      let ctx: AudioContext
      try {
        ctx = new AudioContext({ sampleRate: 16000 })
      } catch {
        ctx = new AudioContext()
      }
      const url = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }))
      try {
        await ctx.audioWorklet.addModule(url)
      } finally {
        URL.revokeObjectURL(url)
      }
      const node = new AudioWorkletNode(ctx, 'spark-recorder')
      node.port.onmessage = (e: MessageEvent<Float32Array>) => this.onChunk(e.data)
      const silent = ctx.createGain()
      silent.gain.value = 0
      node.connect(silent).connect(ctx.destination)
      await ctx.suspend()
      this.ctx = ctx
      this.node = node
    })().catch((e) => {
      this.ready = null
      throw e
    })
    return this.ready
  }

  private onChunk(data: Float32Array): void {
    if (!this.stream) return
    if (this.openMs === null) {
      this.openMs = Math.round(performance.now() - this.startedAt)
      this.onLive?.()
    }
    this.chunks.push(data)
    let sum = 0
    for (const s of data) sum += s * s
    this.level = Math.max(Math.sqrt(sum / data.length) * 6, this.level * 0.85)
  }

  get active(): boolean {
    return this.stream !== null
  }

  async start(deviceId: string): Promise<void> {
    this.teardown()
    const session = this.session
    this.startedAt = performance.now()
    this.openMs = null

    // The audio graph wakes up while the microphone opens instead of after it.
    const graph = this.prepare().then(() => this.ctx?.resume())
    const [stream] = await Promise.all([
      navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: deviceId && deviceId !== 'default' ? { ideal: deviceId } : undefined,
          channelCount: 1,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: true,
        },
      }),
      graph,
    ])
    if (session !== this.session || !this.ctx || !this.node) {
      stream.getTracks().forEach((t) => t.stop())
      return
    }
    this.stream = stream
    this.source = this.ctx.createMediaStreamSource(stream)
    this.source.connect(this.node)
  }

  async stop(): Promise<RecordedAudio> {
    await new Promise((r) => setTimeout(r, TAIL_MS))
    const sampleRate = this.ctx?.sampleRate ?? 16000
    const chunks = this.chunks
    await this.release()
    const length = chunks.reduce((n, c) => n + c.length, 0)
    const samples = new Float32Array(length)
    let offset = 0
    for (const c of chunks) {
      samples.set(c, offset)
      offset += c.length
    }
    return { samples, sampleRate }
  }

  /** Turns the microphone off and forgets any audio; also cancels a start that is still opening. */
  private teardown(): void {
    this.session++
    this.source?.disconnect()
    this.source = null
    this.stream?.getTracks().forEach((t) => t.stop())
    this.stream = null
    this.chunks = []
    this.sent = 0
    this.level = 0
  }

  /** Audio recorded since the previous call (for live transcription). */
  takeNew(): Float32Array {
    const fresh = this.chunks.slice(this.sent)
    this.sent = this.chunks.length
    const out = new Float32Array(fresh.reduce((n, c) => n + c.length, 0))
    let offset = 0
    for (const c of fresh) {
      out.set(c, offset)
      offset += c.length
    }
    return out
  }

  get sampleRate(): number {
    return this.ctx?.sampleRate ?? 16000
  }

  /** Turns the microphone off and lets the audio graph sleep. Safe to call at any time, any number of times. */
  async release(): Promise<void> {
    this.teardown()
    if (this.ctx && this.ctx.state === 'running') await this.ctx.suspend().catch(() => {})
  }
}

let soundCtx: AudioContext | null = null
/** Short two-note chime; rising for start, falling for stop. */
export function chime(kind: 'start' | 'stop' | 'error'): void {
  soundCtx ??= new AudioContext()
  const ctx = soundCtx
  const notes = kind === 'start' ? [660, 880] : kind === 'stop' ? [880, 660] : [330, 262]
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    const t = ctx.currentTime + i * 0.07
    osc.type = 'sine'
    osc.frequency.value = freq
    gain.gain.setValueAtTime(0, t)
    gain.gain.linearRampToValueAtTime(0.08, t + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.12)
    osc.connect(gain).connect(ctx.destination)
    osc.start(t)
    osc.stop(t + 0.13)
  })
}
