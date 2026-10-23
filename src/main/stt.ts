import { existsSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import bpeVocab from '../../resources/zipformer-vi-bpe.vocab?raw'
import { englishFiles, englishReady, modelDir, modelFiles } from './models'
import { listDictionary } from './store'

type Recognizer = {
  createStream(hotwords?: string): { acceptWaveform(w: { samples: Float32Array; sampleRate: number }): void }
  decodeAsync(stream: unknown): Promise<{ text: string }>
}

/**
 * English words developers say in the middle of Vietnamese. The Vietnamese model can spell them
 * but usually writes what it hears instead ("cơ mít" for commit). Naming them as hotwords nudges
 * its search toward the English spelling. The user's dictionary words are added to these.
 * Words said letter by letter, like API, are left out: the nudge only turned them into junk ("APIENO").
 */
const DEV_WORDS = [
  'COMMIT', 'PUSH', 'MERGE', 'BRANCH', 'PULL REQUEST', 'REPO', 'DEPLOY', 'STAGING', 'PRODUCTION', 'RELEASE',
  'REVIEW', 'TEST', 'BUILD', 'DEBUG', 'REFACTOR', 'CONFIG', 'SETUP', 'UPDATE', 'DATABASE', 'QUERY', 'ENDPOINT',
  'SERVER', 'FRONTEND', 'BACKEND', 'COMPONENT', 'FUNCTION', 'PROMPT', 'DOCKER', 'DEADLINE', 'FEATURE',
  'PIPELINE', 'TERMINAL', 'GITHUB',
]

/** How hard hotwords pull: at 2 they fixed test clips without breaking any; from 2.5 they began to drop nearby words. */
const HOTWORD_SCORE = 2

/** Every character the Vietnamese model has a piece for; a hotword with anything else is skipped. */
const VOCAB_CHARS = new Set(bpeVocab.split('\n').flatMap((line) => [...line.split('\t')[0].replace(/^<.*>$/, '').replace(/▁/g, '')]))

/**
 * The Vietnamese model's word pieces and their scores (its bpe.model, which the download lacks), so
 * hotwords are split into pieces the way the model splits words. Written next to the model on first load.
 */
function vocabFile(): string | null {
  const path = join(modelDir(), 'bpe.vocab')
  try {
    if (!existsSync(path) || statSync(path).size !== Buffer.byteLength(bpeVocab)) writeFileSync(path, bpeVocab)
    return path
  } catch (e) {
    console.error('[spark] could not write bpe.vocab, dictating without hotwords:', e)
    return null
  }
}

let hotwordsOn = false

/** This dictation's hotwords, in the capitals the model writes: developer words, then dictionary words. */
function hotwords(): string | undefined {
  if (!hotwordsOn) return undefined
  const dict = listDictionary().map((d) => d.word.normalize('NFC').toLocaleUpperCase('vi').replace(/[^\p{L}\p{N}]+/gu, ' ').trim())
  const usable = dict.filter((w) => w && [...w.replace(/ /g, '')].every((c) => VOCAB_CHARS.has(c)))
  return [...new Set([...DEV_WORDS, ...usable])].join('/')
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
  const vocab = vocabFile()
  const r = (await (await sherpa()).OfflineRecognizer.createAsync({
    featConfig: { sampleRate: 16000, featureDim: 80 },
    modelConfig: {
      transducer: { encoder: f.encoder, decoder: f.decoder, joiner: f.joiner },
      tokens: f.tokens,
      numThreads: 2,
      provider: 'cpu',
      debug: 0,
      ...(vocab && { modelingUnit: 'bpe', bpeVocab: vocab }),
    },
    // Weighs several alternatives instead of one greedy guess (8.8% → 8.4% WER), and gives the
    // hotwords room: with 4 paths they fixed 6 of 99 test words, with 8 paths 10, ~15 ms more.
    decodingMethod: 'modified_beam_search',
    maxActivePaths: 8,
    hotwordsScore: HOTWORD_SCORE,
  })) as Recognizer
  hotwordsOn = vocab !== null
  return r
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

async function decode(r: Recognizer, samples: Float32Array, sampleRate: number, hotwords?: string): Promise<string> {
  let stream: ReturnType<Recognizer['createStream']>
  try {
    stream = hotwords ? r.createStream(hotwords) : r.createStream()
  } catch (e) {
    console.error('[spark] hotwords rejected, decoding without them:', e)
    stream = r.createStream()
  }
  stream.acceptWaveform({ samples, sampleRate })
  return (await r.decodeAsync(stream)).text.trim()
}

/** Vietnamese only, for the live preview while you talk; the final pass still uses both models. */
export async function transcribePartial(samples: Float32Array, sampleRate: number): Promise<string> {
  return decode(await vietnamese(), samples, sampleRate, hotwords())
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
  const text = await vietnamese().then((r) => decode(r, samples, sampleRate, hotwords()))
  const englishText = await Promise.race([en, new Promise<undefined>((r) => setTimeout(() => r(undefined), ENGLISH_GRACE_MS))])
  return { text, english: englishText || undefined }
}
