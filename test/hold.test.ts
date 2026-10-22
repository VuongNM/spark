import { describe, expect, it } from 'vitest'
import { type HoldEvent, type HoldState, initialHold, onHold } from '../src/main/hold'

/** Runs a gesture script; `recording` follows the actions like the real dictation flow does. */
function play(steps: [number, HoldEvent][]) {
  let s: HoldState = initialHold()
  let recording = false
  const actions: string[] = []
  for (const [t, ev] of steps) {
    const [next, action] = onHold(s, ev, t, recording)
    s = next
    if (action === 'start') recording = true
    if (action === 'stop' || action === 'cancel') recording = false
    actions.push(action)
  }
  return actions
}

const down = { type: 'down' } as const
const up = { type: 'up' } as const
const chord = (keycode: number) => ({ type: 'chord', keycode }) as const

describe('push-to-talk', () => {
  it('hold, talk, release → start then stop', () => {
    expect(play([[0, down], [2000, up]])).toEqual(['start', 'stop'])
  })
  it('a quick single tap is cancelled', () => {
    expect(play([[0, down], [120, up]])).toEqual(['start', 'cancel'])
  })
  it('double-tap locks hands-free; the next press stops and its release is ignored', () => {
    expect(play([[0, down], [100, up], [250, down], [330, up], [5000, down], [5100, up]])).toEqual(['start', 'cancel', 'start', 'lock', 'stop', 'none'])
  })
  it('two slow taps are just two cancelled taps', () => {
    expect(play([[0, down], [100, up], [900, down], [1000, up]])).toEqual(['start', 'cancel', 'start', 'cancel'])
  })
  it('key + Space locks hands-free, and letting go keeps recording', () => {
    expect(play([[0, down], [300, chord(49)], [500, up], [4000, down]])).toEqual(['start', 'lock', 'none', 'stop'])
  })
  it('using the key as a modifier cancels early, but not mid-dictation', () => {
    expect(play([[0, down], [150, chord(123)]])).toEqual(['start', 'cancel'])
    expect(play([[0, down], [3000, chord(123)], [4000, up]])).toEqual(['start', 'none', 'stop'])
  })
})
