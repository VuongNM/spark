import { useEffect, useState } from 'react'
import { formatAccelerator } from '../../../shared/accelerator'
import type { AppState, HistoryEntry } from '../../../shared/types'
import { triggerKey } from '../state'
import { Entry, SheetHead, useToast } from '../ui'

export function History({ state }: { state: AppState }) {
  const { settings, setup } = state
  const [query, setQuery] = useState('')
  const [items, setItems] = useState<HistoryEntry[] | null>(null)
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [toast, showToast] = useToast()

  const reload = () => void window.spark.listHistory(query).then(setItems)
  useEffect(reload, [query])
  useEffect(() => window.spark.onHistory(() => reload()), [query])

  const remove = async (entry: HistoryEntry) => {
    await window.spark.deleteHistory(entry.id)
    reload()
    showToast('Đã xoá', { label: 'Hoàn tác', run: () => void window.spark.restoreHistory(entry).then(reload) })
  }

  const clearAll = async () => {
    if (!window.confirm('Xoá toàn bộ lịch sử trên máy này? Bạn sẽ không lấy lại được.')) return
    await window.spark.clearHistory()
    reload()
  }

  const toggleRaw = (id: string) =>
    setOpen((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  const how = settings.mode === 'hold' ? `Giữ ${triggerKey(settings, setup.platform)} rồi nói` : `Nhấn ${formatAccelerator(settings.shortcut, setup.platform)} rồi nói`

  return (
    <>
      <SheetHead
        left={<span className="aside">{items ? (query ? `${items.length} kết quả` : `${items.length} lần đọc`) : ''}</span>}
        right={<input className="input search" type="search" placeholder="Tìm" aria-label="Tìm trong lịch sử" value={query} onChange={(e) => setQuery(e.target.value)} />}
      />
      <div className="content fade-in">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h1 className="page-title">Lịch sử</h1>
          <p className="lede">Mới nhất ở trên. Spark chỉ lưu local.</p>
        </div>

        {items?.length === 0 ? (
          <p className="empty">{query ? 'Không tìm thấy gì.' : `Chưa có gì. ${how} ở bất kỳ app nào.`}</p>
        ) : (
          <div className="entries">
            {items?.map((e, i) => (
              <Entry
                key={e.id}
                index={i}
                entry={e}
                details
                showRaw={open.has(e.id)}
                actions={
                  <>
                    <button
                      className="btn ghost sm"
                      onClick={() => {
                        void window.spark.copy(e.text)
                        showToast('Đã copy')
                      }}
                    >
                      Copy
                    </button>
                    <button className="btn ghost sm" aria-expanded={open.has(e.id)} onClick={() => toggleRaw(e.id)}>
                      {open.has(e.id) ? 'Ẩn transcript' : 'Transcript'}
                    </button>
                    <button className="btn ghost sm" onClick={() => void remove(e)}>
                      Xoá
                    </button>
                  </>
                }
              />
            ))}
          </div>
        )}

        {!!items?.length && !query && (
          <div>
            <button className="btn danger" onClick={() => void clearAll()}>
              Xoá toàn bộ lịch sử
            </button>
          </div>
        )}
      </div>
      {toast}
    </>
  )
}
