import { createHash } from 'node:crypto'
import { existsSync, readdirSync, rmSync, statSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import type { ChatHistoryItem, Llama, LlamaChatSession, LlamaContext, LlamaContextSequence, LlamaModel } from 'node-llama-cpp'
import type { CleanupMode } from '../shared/types'
import { llmFile, llmReady } from './models'
import { maxOutputTokens, SYSTEM } from './prompt'

/**
 * Cleanup on this Mac with Gemma 4 E2B (llama.cpp on the GPU). The system prompt is read once
 * and kept in the cache, so each dictation only reads its own transcript: about 0.25 s before
 * the first word, then ~30 tokens a second on an M1.
 *
 * Reading the 1.8k-token system prompt takes ~6 s on an M1, so the result is saved to a small
 * state file (~17 MB) and restored in milliseconds on the next launch. Startup is then ~3 s,
 * almost all of it the GPU taking in the 3.1 GB model.
 */
interface Engine {
  llama: Llama
  model: LlamaModel
  context: LlamaContext
  session: LlamaChatSession
  base: ChatHistoryItem[]
}

let engine: Engine | null = null
let loading: Promise<Engine> | null = null
/** One dictation at a time: they share the cached prompt. */
let queue: Promise<unknown> = Promise.resolve()

const TIMEOUT_MS = 8000
const CONTEXT_SIZE = 4096

/**
 * Where the read-in system prompt is saved. The name changes whenever anything that shaped it
 * changes (prompt, model file, runtime, settings), so a stale state is never loaded.
 */
function statePath(version: string): string {
  const model = llmFile()
  const key = [SYSTEM, basename(model), statSync(model).size, version, CONTEXT_SIZE, 'swa-full', 'gemma4-no-reasoning'].join('\n')
  return join(dirname(model), `prompt-${createHash('sha256').update(key).digest('hex').slice(0, 16)}.state`)
}

/** Restores the saved system prompt, or reads it once and saves it for next time. */
async function primeSystemPrompt(session: LlamaChatSession, sequence: LlamaContextSequence, version: string): Promise<'restored' | 'read'> {
  const file = statePath(version)
  if (existsSync(file)) {
    try {
      await sequence.loadStateFromFile(file, { acceptRisk: true })
      return 'restored'
    } catch (e) {
      console.error('[spark] saved prompt state unusable, reading the prompt again:', e)
      rmSync(file, { force: true })
      await sequence.clearHistory()
    }
  }
  await session.preloadPrompt('')
  for (const f of readdirSync(dirname(file))) if (/^prompt-.*\.state$/.test(f)) rmSync(join(dirname(file), f), { force: true })
  await sequence.saveStateToFile(file).catch((e) => console.error('[spark] could not save prompt state:', e))
  return 'read'
}

async function load(): Promise<Engine> {
  const { getLlama, Gemma4ChatWrapper, LlamaChatSession, LlamaLogLevel } = await import('node-llama-cpp')
  const t0 = Date.now()
  const llama = await getLlama({ build: 'never', logLevel: LlamaLogLevel.error })
  const model = await llama.loadModel({ modelPath: llmFile(), gpuLayers: 'max' })
  const t1 = Date.now()
  // Gemma uses sliding-window attention; the full cache is what lets the system prompt be reused.
  const context = await model.createContext({ contextSize: CONTEXT_SIZE, swaFullCache: true })
  const sequence = context.getSequence()
  const session = new LlamaChatSession({ contextSequence: sequence, systemPrompt: SYSTEM, chatWrapper: new Gemma4ChatWrapper({ reasoning: false }) })
  const base = session.getChatHistory()
  const runtime = `${llama.llamaCppRelease.repo}@${llama.llamaCppRelease.release}/${llama.buildType}/${llama.gpu}`
  const how = await primeSystemPrompt(session, sequence, runtime)
  // One token now, so the GPU's first-generation setup isn't paid by the first real dictation.
  await session.prompt('<transcript>\nxin chào\n</transcript>', { temperature: 0, maxTokens: 1 })
  session.setChatHistory(base)
  console.log(`[spark] on-device cleanup ready in ${Date.now() - t0} ms (model ${t1 - t0} ms, prompt ${how}, ${llama.gpu || 'cpu'})`)
  return { llama, model, context, session, base }
}

/** Loads the model and reads the system prompt, once. Safe to call often. */
export function warmLocal(): Promise<void> {
  if (!llmReady()) return Promise.resolve()
  if (engine) return Promise.resolve()
  loading ??= load()
    .then((e) => (engine = e))
    .finally(() => (loading = null))
  return loading.then(
    () => undefined,
    (e) => console.error('[spark] on-device cleanup failed to load:', e),
  )
}

export const localLoaded = (): boolean => engine !== null

/** Gemma stays loaded for on-device cleanup, and in Claude mode to take short phrases and offline moments. */
export const wantsLocal = (cleanup: CleanupMode): boolean => llmReady() && cleanup !== 'basic'

export async function cleanLocal(content: string, raw: string): Promise<string> {
  const run = async (): Promise<string> => {
    if (!engine) throw new Error('on-device model not loaded')
    const { session, base } = engine
    session.setChatHistory(base)
    const signal = AbortSignal.timeout(TIMEOUT_MS)
    const text = await session.prompt(content, { temperature: 0, maxTokens: maxOutputTokens(raw), signal, stopOnAbortSignal: true })
    if (signal.aborted) throw new Error('on-device cleanup took too long')
    return text.trim()
  }
  const job = queue.then(run, run)
  queue = job.catch(() => undefined)
  return job
}

/** Frees the ~2 GB the model holds, e.g. when the user switches to another cleanup. */
export async function unloadLocal(): Promise<void> {
  const e = engine ?? (loading ? await loading.catch(() => null) : null)
  engine = null
  if (!e) return
  await e.context.dispose()
  await e.model.dispose()
  await e.llama.dispose()
}
