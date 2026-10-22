import type { DictEntry } from '../shared/types'

// Hesitation sounds only. "ừ" (yes), "à"/"ạ"/"nhé" (particles) carry meaning and are kept.
const FILLER = /^(ờ+|ơ+|ừ+m+|ư+m+|ừm+|hừ+m*|h+m+|um+|uh+|ừ+ừ+)$/u

const QUESTION_END = new Set(['không', 'chưa', 'hả', 'hở', 'nhỉ', 'à', 'sao', 'gì', 'nào', 'đâu', 'chứ', 'hông', 'ko'])
const QUESTION_START = ['tại sao', 'vì sao', 'có phải', 'bao giờ', 'bao nhiêu', 'mấy giờ', 'ở đâu', 'làm sao']

export function words(text: string): string[] {
  return text
    .normalize('NFC')
    .toLocaleLowerCase('vi')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
}

export function removeFillers(text: string): string {
  const kept = text.split(/\s+/).filter((w) => w && !FILLER.test(w.toLocaleLowerCase('vi')))
  return kept.join(' ')
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export function applyDictionary(text: string, dict: DictEntry[]): { text: string; replacements: number } {
  let out = text
  let replacements = 0
  for (const entry of dict) {
    for (const variant of [...entry.heardAs, entry.word]) {
      if (!variant.trim()) continue
      const re = new RegExp(`(?<![\\p{L}\\p{N}])${escape(variant.trim())}(?![\\p{L}\\p{N}])`, 'giu')
      out = out.replace(re, (m) => {
        if (m !== entry.word) replacements++
        return entry.word
      })
    }
  }
  return { text: out, replacements }
}

function isQuestion(lower: string): boolean {
  const ws = lower.split(/\s+/)
  return QUESTION_END.has(ws[ws.length - 1] ?? '') || QUESTION_START.some((q) => lower.startsWith(q))
}

function capitalize(s: string): string {
  return s.replace(/^(\P{L}*)(\p{L})/u, (_, pre: string, ch: string) => pre + ch.toLocaleUpperCase('vi'))
}

/** Offline cleanup used when Claude is off, unreachable, or its output can't be trusted. */
export function basicFormat(raw: string, dict: DictEntry[] = []): string {
  let t = raw.normalize('NFC').toLocaleLowerCase('vi').replace(/\s+/g, ' ').trim()
  t = removeFillers(t)
  if (!t) return ''
  const question = isQuestion(t)
  t = applyDictionary(t, dict).text
  t = capitalize(t)
  if (!/[.?!…]$/.test(t)) t += question ? '?' : '.'
  return t
}

export interface Divergence {
  ok: boolean
  overlap: number
  lengthRatio: number
}

/** Rough first-sound family, so an English word can be matched to the Vietnamese spelling the speech model gave it. */
const SOUND: Record<string, string> = { c: 'k', k: 'k', q: 'k', g: 'k', s: 's', x: 's', z: 's', j: 's', d: 'd', t: 'd', p: 'p', b: 'p', f: 'p', r: 'r', l: 'r', m: 'm', n: 'm', h: 'h', v: 'v' }
function firstSound(word: string): string {
  const c = word.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd')[0] ?? ''
  return SOUND[c] ?? (/[aeiouyw]/.test(c) ? 'a' : c)
}
const isEnglishLike = (w: string): boolean => /^[a-z]{2,}$/.test(w)
const toneless = (w: string): string => w.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd')

/**
 * Checks that cleaned text is still what the user said. Catches the model answering,
 * translating, or expanding a dictated request instead of just cleaning it up.
 *
 * An English word the speaker mixed in reaches us spelled as Vietnamese syllables
 * ("đét lai" for "deadline"), so it counts as heard when the English model heard it
 * (`hints`), or when it starts with the same sound as an unused word at that spot in the
 * transcript. Position matters: a translation can't borrow sounds from anywhere.
 */
export function checkDivergence(raw: string, cleaned: string, dict: DictEntry[] = [], hints: string[] = []): Divergence {
  const rawWords = words(raw)
  const outWords = words(cleaned)
  if (outWords.length === 0) return { ok: rawWords.length === 0, overlap: 0, lengthRatio: 0 }

  const free = new Set(dict.flatMap((d) => words(d.word)))
  const heard = new Set(hints.flatMap((h) => words(h)))
  const used = rawWords.map(() => false)
  const pos = outWords.map(() => -1)
  const counted = outWords.map((w) => !/\d/.test(w)) // numbers are rewritten from spoken words to digits
  const matched = outWords.map(() => false)

  // Pass 1: words said as-is, preferring the next occurrence after the previous match.
  let last = 0
  outWords.forEach((w, i) => {
    if (!counted[i]) return
    let at = rawWords.findIndex((r, j) => j >= last && !used[j] && r === w)
    if (at < 0) at = rawWords.findIndex((r, j) => !used[j] && r === w)
    if (at >= 0) {
      used[at] = true
      pos[i] = at
      matched[i] = true
      if (at >= last) last = at + 1
    } else if (free.has(w) || heard.has(w)) matched[i] = true
  })

  // Pass 2: words with a corrected tone ("tảo" → "tạo"), then English words matched by sound,
  // each to an unused word between their neighbours.
  const near = (i: number, same: (r: string) => boolean) => {
    const prev = pos.slice(0, i).filter((p) => p >= 0).pop() ?? -1
    const next = pos.slice(i + 1).find((p) => p >= 0) ?? rawWords.length
    const hi = next > prev ? next : rawWords.length
    for (let j = prev + 1; j < hi; j++) {
      if (!used[j] && same(rawWords[j])) {
        used[j] = true
        pos[i] = j
        matched[i] = true
        return
      }
    }
  }
  outWords.forEach((w, i) => {
    if (counted[i] && !matched[i]) near(i, (r) => toneless(r) === toneless(w))
  })
  outWords.forEach((w, i) => {
    if (counted[i] && !matched[i] && isEnglishLike(w)) near(i, (r) => firstSound(r) === firstSound(w))
  })

  const compared = counted.filter(Boolean).length
  const overlap = compared === 0 ? 1 : matched.filter((m, i) => m && counted[i]).length / compared
  const lengthRatio = outWords.length / Math.max(rawWords.length, 1)
  const tooLong = outWords.length > rawWords.length * 1.6 + 3
  return { ok: overlap >= 0.6 && !tooLong, overlap, lengthRatio }
}

const UNIT: Record<string, number> = { không: 0, một: 1, mốt: 1, hai: 2, ba: 3, bốn: 4, tư: 4, năm: 5, lăm: 5, nhăm: 5, sáu: 6, bảy: 7, bẩy: 7, tám: 8, chín: 9 }
const SCALE: Record<string, number> = { nghìn: 1e3, ngàn: 1e3, triệu: 1e6, tỷ: 1e9, tỉ: 1e9 }
const NUMBER_WORDS = new Set([...Object.keys(UNIT), ...Object.keys(SCALE), 'mười', 'mươi', 'chục', 'trăm', 'lẻ', 'linh', 'rưỡi'])

/** Value of a run of Vietnamese number words ("một trăm hai mươi lăm" → 125), or null. */
function numberValue(run: string[]): number | null {
  let total = 0
  let cur = 0
  let last = -1 // the most recent unit digit, so "mươi"/"trăm" can scale it
  let prevUnit = false
  for (const w of run) {
    if (w in UNIT) {
      const d = UNIT[w]
      cur = prevUnit ? cur - last + last * 10 + d : cur + d // "hai ba" said for 23
      last = d
      prevUnit = true
      continue
    }
    prevUnit = false
    if (w === 'mười') cur += 10
    else if (w === 'mươi' || w === 'chục') cur += last >= 0 ? last * 9 : 0
    else if (w === 'trăm') cur += last >= 0 ? last * 99 : 100
    else if (w in SCALE) {
      total += (cur || 1) * SCALE[w]
      cur = 0
    } else if (w !== 'lẻ' && w !== 'linh') return null
    last = -1
  }
  return total + cur
}

/** Every number a cleanup could fairly write for what was said. */
function spokenNumbers(raw: string, dict: DictEntry[]): Set<number> {
  const ok = new Set<number>()
  const add = (n: number) => {
    ok.add(n)
    if (n >= 1 && n <= 11) ok.add(n + 12) // "3 giờ chiều" may be written as 15 giờ
  }
  const all = [raw, ...dict.map((d) => d.word)].join(' ')
  for (const m of all.matchAll(/\d+/g)) add(Number(m[0]))
  const ws = words(raw)
  for (let i = 0; i < ws.length; i++) {
    if (!NUMBER_WORDS.has(ws[i])) continue
    let j = i
    while (j < ws.length && NUMBER_WORDS.has(ws[j])) j++
    for (let a = i; a < j; a++) for (let b = a + 1; b <= j; b++) {
      const v = numberValue(ws.slice(a, b))
      if (v !== null) add(v)
    }
    if (ws.slice(i, j).includes('rưỡi')) [5, 30, 50].forEach(add)
    i = j - 1
  }
  return ok
}

/**
 * Numbers in the cleaned text that nobody said. Catches a model turning "năm giờ" into "9 giờ".
 * List numbering ("1.", "2.") and thousands separators ("13.000") are understood.
 */
export function unspokenNumbers(raw: string, cleaned: string, dict: DictEntry[] = []): number[] {
  const ok = spokenNumbers(raw, dict)
  const body = cleaned.replace(/^\s*\d+[.)]\s/gm, '')
  const bad: number[] = []
  for (const m of body.matchAll(/\d+(?:[.,]\d+)*/g)) {
    const s = m[0]
    const parts = /^\d{1,3}([.,]\d{3})+$/.test(s) ? [s.replace(/[.,]/g, '')] : s.split(/[.,]/)
    for (const p of parts) if (!ok.has(Number(p))) bad.push(Number(p))
  }
  return bad
}

/**
 * True when the speaker corrects themself mid-sentence ("ba giờ à không bốn giờ"). The
 * on-device model keeps both versions, so these go to Claude when it's available.
 */
export function hasSelfCorrection(raw: string): boolean {
  const t = words(raw).join(' ')
  return /(^|\s)(à|ờ|ừ)\s+(không|nhầm|quên|thôi)(\s|$)/u.test(t) || /(^|\s)(nhầm|ý là|ý (tôi|em|anh|chị|mình) là|sửa lại|nói lại|không phải)(\s|$)/u.test(t)
}

/**
 * The English model invents fluent sentences or loops on Vietnamese speech. Keeps its output
 * only when it could still be a useful hint.
 */
export function usableEnglish(english: string | undefined, vietnamese: string): string | undefined {
  const en = words(english ?? '')
  if (en.length === 0) return undefined
  if (en.length >= 8 && new Set(en).size / en.length < 0.5) return undefined // "a little bit of a little bit of…"
  if (en.length > words(vietnamese).length * 2 + 4) return undefined
  return english!.trim()
}
