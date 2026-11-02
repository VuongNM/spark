import { type FormEvent, useEffect, useState } from 'react'
import type { DictEntry } from '../../../shared/types'
import { SheetHead, useToast } from '../ui'

export function Dictionary() {
  const [entries, setEntries] = useState<DictEntry[]>([])
  const [word, setWord] = useState('')
  const [heard, setHeard] = useState('')
  const [error, setError] = useState('')
  const [toast, showToast] = useToast()

  useEffect(() => void window.spark.listDictionary().then(setEntries), [])

  const save = async (next: DictEntry[]) => setEntries(await window.spark.saveDictionary(next))

  const add = async (e: FormEvent) => {
    e.preventDefault()
    const w = word.trim()
    if (!w) return setError('Gõ từ đó theo đúng cách cần viết.')
    if (entries.some((x) => x.word.toLocaleLowerCase('vi') === w.toLocaleLowerCase('vi'))) return setError(`“${w}” đã có trong từ điển.`)
    const heardAs = heard
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    await save([{ id: crypto.randomUUID(), word: w, heardAs }, ...entries])
    setWord('')
    setHeard('')
    setError('')
    showToast(`Đã thêm “${w}”`)
  }

  const remove = async (entry: DictEntry) => {
    const before = entries
    await save(entries.filter((x) => x.id !== entry.id))
    showToast(`Đã xoá “${entry.word}”`, { label: 'Hoàn tác', run: () => void save(before) })
  }

  return (
    <>
      <SheetHead left={<span className="aside">{entries.length} từ</span>} />
      <div className="content fade-in">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h1 className="page-title">Từ điển</h1>
          <p className="lede">Tên riêng, tên project, thuật ngữ mà Spark phải viết đúng. Các từ này cũng được dùng làm hotwords cho STT.</p>
        </div>

        <form className="card card-pad" onSubmit={(e) => void add(e)} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="inline" style={{ alignItems: 'flex-end' }}>
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="dict-word">Từ</label>
              <input id="dict-word" className="input" placeholder="Lawgical" value={word} onChange={(e) => setWord(e.target.value)} />
            </div>
            <div className="field" style={{ flex: 1.4 }}>
              <label htmlFor="dict-heard">
                Nghe giống <span className="muted" style={{ fontWeight: 400 }}>· không bắt buộc</span>
              </label>
              <input id="dict-heard" className="input" placeholder="lô gi cồ, logical" value={heard} onChange={(e) => setHeard(e.target.value)} />
            </div>
            <button className="btn primary" type="submit" style={{ height: 40 }}>
              Thêm
            </button>
          </div>
          {error ? (
            <p className="note bad" role="alert">
              {error}
            </p>
          ) : (
            <p className="muted small">Ghi cách Spark hay nghe nhầm từ đó. Nhiều cách thì ngăn bằng dấu phẩy.</p>
          )}
        </form>

        {entries.length === 0 ? (
          <p className="empty">Thử thêm tên bạn, tên công ty, tên project hay sản phẩm bạn hay nhắc tới.</p>
        ) : (
          <div className="card list">
            {entries.map((e) => (
              <div key={e.id} className="word-row">
                <span className="word">{e.word}</span>
                <span className="muted small" style={{ flex: 1 }}>
                  {e.heardAs.length > 0 ? `nghe giống: ${e.heardAs.join(', ')}` : ''}
                </span>
                <button className="btn ghost sm" onClick={() => void remove(e)}>
                  Xoá
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      {toast}
    </>
  )
}
