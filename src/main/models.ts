import { app } from 'electron'
import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream, existsSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { ModelStatus } from '../shared/types'

interface ModelSpec {
  dir: string
  repo: string
  files: { name: string; size: number; sha256: string }[]
}

/** Vietnamese speech model: required for dictation. */
const VI: ModelSpec = {
  dir: 'zipformer-vi-30m',
  repo: 'https://huggingface.co/csukuangfj2/sherpa-onnx-zipformer-vi-30M-int8-2026-02-09/resolve/main',
  files: [
    { name: 'encoder.int8.onnx', size: 27699063, sha256: '8ef5286dd427eb108055c2ddc1982aa31e544706072d5ea228729292dacade68' },
    { name: 'decoder.onnx', size: 5165084, sha256: 'cf2aa385b82c9d5d40cd29c3188af52d0249b3b78f0d4b7eb84ad502d50c7e7f' },
    { name: 'joiner.int8.onnx', size: 1033417, sha256: '7311d2e17b810ecea515d79c71cc4668af8759256a06fa01d27047772320c821' },
    { name: 'tokens.txt', size: 23238, sha256: 'ca8171f8bbd516c050b627582f2125c8f5f1f6ed967ab41b0fa9aae2cf61b492' },
  ],
}

/**
 * English speech model (Moonshine tiny): an optional second listener on the same audio. It catches
 * English words the Vietnamese model has no spelling for ("report" → "lừa đảo"); cleanup uses it as a hint.
 */
const EN: ModelSpec = {
  dir: 'moonshine-tiny-en',
  repo: 'https://huggingface.co/csukuangfj2/sherpa-onnx-moonshine-tiny-en-quantized-2026-02-27/resolve/main',
  files: [
    { name: 'encoder_model.ort', size: 13281600, sha256: '94e90a4654fc45cdfedb77c4c08e1739f48862998e58fada384b25118134f221' },
    { name: 'decoder_model_merged.ort', size: 30412256, sha256: 'cf524c4862d36e9e5ab032eddc73637efd822d70e868ac575cf1a46e1e4708a0' },
    { name: 'tokens.txt', size: 549350, sha256: '2870d843e14c1e187bf1913a521562a63b53933814bd7f2145120468f494a049' },
  ],
}

/** Gemma 4 E2B (Apache-2.0) for on-device cleanup; downloaded only when the user picks it. */
const LLM: ModelSpec = {
  dir: 'gemma-4-e2b',
  repo: 'https://huggingface.co/unsloth/gemma-4-E2B-it-GGUF/resolve/0314792d7f1f7e229411f620751375812bb9faf2',
  files: [{ name: 'gemma-4-E2B-it-Q4_K_M.gguf', size: 3106738272, sha256: '740185b21d22ceb83a11c3aa62ad5842ef32c70f6096d756bbee85a1e4ec34b8' }],
}

const ALL = [VI, EN]
const bytes = (specs: ModelSpec[]) => specs.reduce((n, s) => n + s.files.reduce((m, f) => m + f.size, 0), 0)

const dirOf = (spec: ModelSpec): string => join(app.getPath('userData'), 'models', spec.dir)
export const modelDir = (): string => dirOf(VI)

export const modelFiles = () => ({
  encoder: join(dirOf(VI), 'encoder.int8.onnx'),
  decoder: join(dirOf(VI), 'decoder.onnx'),
  joiner: join(dirOf(VI), 'joiner.int8.onnx'),
  tokens: join(dirOf(VI), 'tokens.txt'),
})

export const englishFiles = () => ({
  encoder: join(dirOf(EN), 'encoder_model.ort'),
  mergedDecoder: join(dirOf(EN), 'decoder_model_merged.ort'),
  tokens: join(dirOf(EN), 'tokens.txt'),
})

const present = (spec: ModelSpec): boolean =>
  spec.files.every((f) => {
    const p = join(dirOf(spec), f.name)
    return existsSync(p) && statSync(p).size === f.size
  })

export const englishReady = (): boolean => present(EN)

let status: ModelStatus = { state: 'missing', progress: 0, sizeMb: Math.round(bytes(ALL) / 1e6) }

/** Ready as soon as the Vietnamese model is in place; the English one is a bonus that can arrive later. */
export function modelStatus(): ModelStatus {
  if (status.state === 'downloading') return status
  status = present(VI) ? { ...status, state: 'ready', progress: 1, error: undefined } : status.state === 'error' ? status : { ...status, state: 'missing', progress: 0 }
  return status
}

async function sha256(path: string): Promise<string> {
  const h = createHash('sha256')
  await pipeline(createReadStream(path), h)
  return h.digest('hex')
}

async function fetchSpec(spec: ModelSpec, onBytes: (n: number) => void): Promise<void> {
  mkdirSync(dirOf(spec), { recursive: true })
  for (const f of spec.files) {
    const dest = join(dirOf(spec), f.name)
    if (existsSync(dest) && statSync(dest).size === f.size) {
      onBytes(f.size)
      continue
    }
    const res = await fetch(`${spec.repo}/${f.name}`)
    if (!res.ok || !res.body) throw new Error(`Tải ${f.name} thất bại (mã ${res.status}). Thử lại.`)
    const part = `${dest}.part`
    const body = Readable.fromWeb(res.body as import('node:stream/web').ReadableStream)
    body.on('data', (chunk: Buffer) => onBytes(chunk.length))
    await pipeline(body, createWriteStream(part))
    if ((await sha256(part)) !== f.sha256) {
      rmSync(part, { force: true })
      throw new Error(`${f.name} tải về bị hỏng. Thử lại.`)
    }
    renameSync(part, dest)
  }
}

/** Setup download: the Vietnamese model, then the English one. A failed English download doesn't block dictation. */
export async function downloadModel(onProgress: (s: ModelStatus) => void): Promise<void> {
  if (status.state === 'downloading') return
  status = { ...status, state: 'downloading', progress: 0, error: undefined }
  onProgress(status)
  const total = bytes(ALL)
  let done = 0
  let last = 0
  const onBytes = (n: number) => {
    done += n
    const progress = done / total
    if (progress - last > 0.01) {
      last = progress
      status = { ...status, progress }
      onProgress(status)
    }
  }
  try {
    await fetchSpec(VI, onBytes)
  } catch (e) {
    status = { ...status, state: 'error', error: e instanceof Error ? e.message : String(e) }
    onProgress(status)
    return
  }
  await fetchSpec(EN, onBytes).catch((e) => console.error('[spark] English model download failed:', e))
  status = { ...status, state: 'ready', progress: 1 }
  onProgress(status)
}

export const llmFile = (): string => join(dirOf(LLM), LLM.files[0].name)
export const llmReady = (): boolean => present(LLM)

let llm: ModelStatus = { state: 'missing', progress: 0, sizeMb: Math.round(bytes([LLM]) / 1e6) }
export function llmStatus(): ModelStatus {
  if (llm.state === 'downloading') return llm
  llm = llmReady() ? { ...llm, state: 'ready', progress: 1, error: undefined } : llm.state === 'error' ? llm : { ...llm, state: 'missing', progress: 0 }
  return llm
}

export async function downloadLlm(onProgress: (s: ModelStatus) => void): Promise<void> {
  if (llm.state === 'downloading') return
  llm = { ...llm, state: 'downloading', progress: 0, error: undefined }
  onProgress(llm)
  const total = bytes([LLM])
  let done = 0
  let last = 0
  try {
    await fetchSpec(LLM, (n) => {
      done += n
      if (done / total - last > 0.005) {
        last = done / total
        llm = { ...llm, progress: last }
        onProgress(llm)
      }
    })
    llm = { ...llm, state: 'ready', progress: 1 }
  } catch (e) {
    llm = { ...llm, state: 'error', error: e instanceof Error ? e.message : String(e) }
  }
  onProgress(llm)
}

let fetchingEnglish: Promise<boolean> | null = null
/** Quietly adds the English model for people who set up Spark before it existed. */
export function ensureEnglishModel(): Promise<boolean> {
  if (englishReady()) return Promise.resolve(true)
  fetchingEnglish ??= fetchSpec(EN, () => {})
    .then(() => true)
    .catch((e) => {
      console.error('[spark] English model download failed:', e)
      return false
    })
    .finally(() => (fetchingEnglish = null))
  return fetchingEnglish
}
