import { englishFiles, englishReady, modelFiles } from './models'

type Recognizer = {
  createStream(): { acceptWaveform(w: { samples: Float32Array; sampleRate: number }): void }
  decodeAsync(stream: unknown): Promise<{ text: string }>
}

export interface Transcript {
  /** What the Vietnamese model heard. */
  text: string
  /** What the English model heard in the same audio, when it is installed. */
  english?: string
}

async function sherpa() {
  const mod = await import('sherpa-onnx-node')
  return (mod as unknown as { default?: typeof mod }).default ?? mod
}

async function loadVietnamese(): Promise<Recognizer> {
  const f = modelFiles()
  return (await sherpa()).OfflineRecognizer.createAsync({
    featConfig: { sampleRate: 16000, featureDim: 80 },
    modelConfig: {
      transducer: { encoder: f.encoder, decoder: f.decoder, joiner: f.joiner },
      tokens: f.tokens,
      numThreads: 2,
      provider: 'cpu',
      debug: 0,
    },
    // Weighs a few alternatives instead of one greedy guess: 8.8% → 8.4% WER for ~20 ms more.
    decodingMethod: 'modified_beam_search',
    maxActivePaths: 4,
  }) as Promise<Recognizer>
}

async function loadEnglish(): Promise<Recognizer> {
  const f = englishFiles()
  return (await sherpa()).OfflineRecognizer.createAsync({
    featConfig: { sampleRate: 16000, featureDim: 80 },
    modelConfig: { moonshine: { encoder: f.encoder, mergedDecoder: f.mergedDecoder }, tokens: f.tokens, numThreads: 2, provider: 'cpu', debug: 0 },
  }) as Promise<Recognizer>
}

/** Loads a recognizer once and shares the in-flight load between callers. */
function lazy(load: () => Promise<Recognizer>) {
  let ready: Recognizer | null = null
  let loading: Promise<Recognizer> | null = null
  return (): Promise<Recognizer> => {
    if (ready) return Promise.resolve(ready)
    loading ??= load()
      .then((r) => (ready = r))
      .finally(() => (loading = null))
    return loading
  }
}

const vietnamese = lazy(loadVietnamese)
const english = lazy(loadEnglish)

export async function warmUp(): Promise<void> {
  await Promise.all([vietnamese(), englishReady() ? english().catch((e) => console.error('[spark] English model failed to load:', e)) : null])
}

async function decode(r: Recognizer, samples: Float32Array, sampleRate: number): Promise<string> {
  const stream = r.createStream()
  stream.acceptWaveform({ samples, sampleRate })
  return (await r.decodeAsync(stream)).text.trim()
}

/** Vietnamese only, for the live preview while you talk; the final pass still uses both models. */
export async function transcribePartial(samples: Float32Array, sampleRate: number): Promise<string> {
  return decode(await vietnamese(), samples, sampleRate)
}

/** After the Vietnamese read, the English hint gets this long to finish, or Spark goes on without it. */
const ENGLISH_GRACE_MS = 120

/** Both models listen to the same audio in parallel; the English one is only a hint, so it never holds things up. */
export async function transcribe(samples: Float32Array, sampleRate: number): Promise<Transcript> {
  const en = englishReady()
    ? english()
        .then((r) => decode(r, samples, sampleRate))
        .catch(() => undefined)
    : Promise.resolve(undefined)
  const text = await vietnamese().then((r) => decode(r, samples, sampleRate))
  const englishText = await Promise.race([en, new Promise<undefined>((r) => setTimeout(() => r(undefined), ENGLISH_GRACE_MS))])
  return { text, english: englishText || undefined }
}
