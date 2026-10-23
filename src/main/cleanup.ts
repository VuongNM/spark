import Anthropic from '@anthropic-ai/sdk'
import { app, net, session } from 'electron'
import type { ClaudeModel, CleanedBy, CleanupMode, DictEntry, FallbackReason, Style } from '../shared/types'
import type { AppContext } from './context'
import { basicFormat, checkDivergence, hasSelfCorrection, unspokenNumbers, usableEnglish, words } from './format'
import { cleanLocal, localLoaded, warmLocal } from './local-llm'
import { resolveStyle, SYSTEM, userMessage } from './prompt'

export interface CleanResult {
  text: string
  cleanedBy: CleanedBy
  fallbackReason?: FallbackReason
  ms: number
  /** A model's text that failed the checks (for troubleshooting only). */
  rejected?: string
}

class CleanupError extends Error {
  constructor(readonly reason: FallbackReason, message: string) {
    super(message)
  }
}

const API = 'https://api.anthropic.com'

// Chromium's network stack (net.fetch) keeps one HTTP/2 connection to the API open between
// dictations, and warmClaude() can open it ahead of time while the user is still talking.
let cached: { key: string; client: Anthropic } | null = null
function client(key: string): Anthropic {
  if (cached?.key !== key) {
    const fetch = (url: string | URL | Request, init?: RequestInit) => (app.isReady() ? net.fetch(url as string, init) : globalThis.fetch(url, init))
    cached = { key, client: new Anthropic({ apiKey: key, timeout: 15_000, maxRetries: 1, fetch }) }
  }
  return cached.client
}

/** Opens the connection to Claude now, so the cleanup request right after release doesn't pay for the handshake. */
export function warmClaude(): void {
  if (app.isReady()) session.defaultSession.preconnect({ url: API, numSockets: 1 })
}

function modelParams(model: ClaudeModel): Partial<Anthropic.Beta.MessageCreateParamsNonStreaming> {
  switch (model) {
    case 'claude-haiku-5-5':
      return { thinking: { type: 'disabled' } }
    case 'claude-sonnet-5-5':
    case 'claude-opus-5-5':
      return { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' }
  }
}

async function cleanWithClaude(content: string, key: string, model: ClaudeModel): Promise<string> {
  try {
    const res = await client(key).beta.messages.create({
      model,
      max_tokens: 2048,
      system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content }],
      output_config: { effort: 'low' },
      ...modelParams(model),
    })
    if (res.stop_reason === 'refusal') throw new CleanupError('refused', 'Claude declined to clean this text')
    return res.content
      .flatMap((b) => (b.type === 'text' ? [b.text] : []))
      .join('')
      .trim()
      .replace(/^"(.*)"$/s, '$1')
  } catch (e) {
    if (e instanceof CleanupError) throw e
    if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) throw new CleanupError('bad-key', 'Claude rejected the API key')
    if (e instanceof Anthropic.APIConnectionError) throw new CleanupError('offline', 'Could not reach Claude')
    throw new CleanupError('error', e instanceof Error ? e.message : String(e))
  }
}

/** Phrases this short come out the same from Gemma on the Mac, only faster (≈0.45 s vs ≈1 s). */
const SHORT_PHRASE_WORDS = 4

/**
 * Cleans a transcript with the chosen engine. Every model result must pass two checks (it still
 * says what was said; every number in it was spoken) or it isn't used.
 * - claude: Claude, except very short phrases, which Gemma does when it's loaded; Gemma also
 *   steps in when Claude can't be reached or there is no key yet.
 * - local: Gemma, except self-corrections, which need Claude; Claude backs it up when a key is set.
 * - basic: offline rules only. Everything falls back to basic as a last resort.
 */
export async function cleanText(
  raw: string,
  opts: { mode: CleanupMode; key: string | null; model: ClaudeModel; style: Style; app: AppContext; dict: DictEntry[]; english?: string; polish?: boolean },
): Promise<CleanResult> {
  const t0 = Date.now()
  const done = (r: Omit<CleanResult, 'ms'>): CleanResult => ({ ...r, ms: Date.now() - t0 })
  const basic = (fallbackReason?: FallbackReason, rejected?: string) => done({ text: basicFormat(raw, opts.dict), cleanedBy: 'basic', fallbackReason, rejected })
  if (opts.mode === 'basic') return basic()

  const english = usableEnglish(opts.english, raw)
  const content = userMessage(raw, { style: resolveStyle(opts.style, opts.app.category), app: opts.app, dict: opts.dict, english, polish: opts.polish })
  const passes = (text: string) => checkDivergence(raw, text, opts.dict, english ? [english] : []).ok && unspokenNumbers(raw, text, opts.dict).length === 0

  let localIssue: FallbackReason | undefined
  let rejected: string | undefined
  /** Gemma's text if it is loaded and passes the checks; otherwise notes why not. */
  const viaLocal = async (): Promise<string | null> => {
    if (!localLoaded()) {
      localIssue = 'local-loading'
      void warmLocal()
      return null
    }
    try {
      const text = await cleanLocal(content, raw)
      if (text && passes(text)) return text
      localIssue = 'local-rejected'
      rejected = text
    } catch (e) {
      console.error('[spark] on-device cleanup failed:', e)
      localIssue = 'local-error'
    }
    return null
  }

  const correction = hasSelfCorrection(raw)
  const localFirst =
    opts.mode === 'local' ? !(opts.key && correction) : localLoaded() && !correction && words(raw).length <= SHORT_PHRASE_WORDS
  if (localFirst) {
    const text = await viaLocal()
    if (text) return done({ text, cleanedBy: 'local' })
    if (opts.mode === 'claude') localIssue = undefined // a short phrase simply goes to Claude
  }

  if (!opts.key) {
    if (opts.mode === 'local') return basic(localIssue, rejected)
    // No key yet: Gemma, when it's on this Mac, still beats the basic rules ("cơ mít" → "commit").
    if (!localFirst) {
      const text = await viaLocal()
      if (text) return done({ text, cleanedBy: 'local', fallbackReason: 'no-key' })
    }
    return basic('no-key', rejected)
  }
  try {
    const text = await cleanWithClaude(content, opts.key, opts.model)
    if (!passes(text)) return basic('diverged', text)
    return done({ text, cleanedBy: 'claude', fallbackReason: localIssue, rejected })
  } catch (e) {
    const reason: FallbackReason = e instanceof CleanupError ? e.reason : 'error'
    // Offline or Claude down: Gemma, when it's loaded, still beats the basic rules.
    if (opts.mode === 'claude' && (reason === 'offline' || reason === 'error') && localLoaded()) {
      const text = await viaLocal()
      if (text) return done({ text, cleanedBy: 'local', fallbackReason: reason })
    }
    return basic(reason, rejected)
  }
}

export async function testKey(key: string, model: ClaudeModel): Promise<{ ok: boolean; message: string }> {
  try {
    const content = userMessage('ờ danh sách đi chợ gồm có trứng sữa bánh mì rau cải', { style: 'neutral', app: { name: 'Spark', bundleId: '', category: 'other' }, dict: [] })
    const text = await cleanWithClaude(content, key, model)
    return { ok: true, message: `Dùng được. “ờ danh sách đi chợ gồm có trứng sữa bánh mì rau cải” thành:\n\n${text}` }
  } catch (e) {
    const reason = e instanceof CleanupError ? e.reason : 'error'
    const message =
      reason === 'bad-key' ? 'Anthropic từ chối khoá này. Copy lại khoá ở console.anthropic.com.' : reason === 'offline' ? 'Không gọi được Claude. Kiểm tra mạng.' : e instanceof Error ? e.message : String(e)
    return { ok: false, message }
  }
}
