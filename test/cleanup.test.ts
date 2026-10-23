import { beforeEach, describe, expect, it, vi } from 'vitest'

const local = vi.hoisted(() => ({ cleanLocal: vi.fn(), localLoaded: vi.fn(), warmLocal: vi.fn(async () => {}) }))
vi.mock('electron', () => ({ app: { isReady: () => false }, net: {}, session: {} }))
vi.mock('../src/main/local-llm', () => local)

const { cleanText } = await import('../src/main/cleanup')

const opts = {
  mode: 'claude' as const,
  key: null,
  model: 'claude-haiku-5-5' as const,
  style: 'auto' as const,
  app: { name: 'Cursor', bundleId: 'com.todesktop.230313mzl4w4u92', category: 'code' as const },
  dict: [],
}

describe('cleanText in Claude mode without a key', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    local.localLoaded.mockReturnValue(true)
  })

  it('lets Gemma clean a long sentence instead of the basic rules', async () => {
    local.cleanLocal.mockResolvedValue('Mình commit rồi push lên nhánh chính nhé.')
    const r = await cleanText('mình cơ mít rồi push lên nhánh chính nhé', opts)
    expect(r).toMatchObject({ text: 'Mình commit rồi push lên nhánh chính nhé.', cleanedBy: 'local', fallbackReason: 'no-key' })
  })

  it('falls back to the basic rules when Gemma answers instead of cleaning', async () => {
    local.cleanLocal.mockResolvedValue('Để commit, bạn chạy git commit -m rồi git push origin main.')
    const r = await cleanText('làm sao để cơ mít rồi push lên nhánh chính', opts)
    expect(r).toMatchObject({ text: 'Làm sao để cơ mít rồi push lên nhánh chính?', cleanedBy: 'basic', fallbackReason: 'no-key' })
    expect(r.rejected).toContain('git commit')
  })

  it('falls back to the basic rules when Gemma adds a number nobody said', async () => {
    local.cleanLocal.mockResolvedValue('Mình deploy lên staging lúc 3 giờ nhé.')
    const r = await cleanText('mình đi ploi lên sờ tây ding lúc đó nhé', opts)
    expect(r).toMatchObject({ cleanedBy: 'basic', fallbackReason: 'no-key' })
  })

  it('uses the basic rules while Gemma is still loading, and starts loading it', async () => {
    local.localLoaded.mockReturnValue(false)
    const r = await cleanText('mình cơ mít rồi push lên nhánh chính nhé', opts)
    expect(r).toMatchObject({ text: 'Mình cơ mít rồi push lên nhánh chính nhé.', cleanedBy: 'basic', fallbackReason: 'no-key' })
    expect(local.cleanLocal).not.toHaveBeenCalled()
    expect(local.warmLocal).toHaveBeenCalled()
  })

  it('asks Gemma only once for a short phrase it already turned down', async () => {
    local.cleanLocal.mockResolvedValue('Xin chào, tôi có thể giúp gì cho bạn hôm nay?')
    const r = await cleanText('xin chào', opts)
    expect(r).toMatchObject({ cleanedBy: 'basic', fallbackReason: 'no-key' })
    expect(local.cleanLocal).toHaveBeenCalledTimes(1)
  })
})
