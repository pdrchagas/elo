import { useEffect, useRef, useState } from 'react'
import { api } from './api.js'
import { STICKERS, fileToSticker } from './media.js'

export default function StickerPicker({ onPick, onClose }) {
  const [tab, setTab] = useState('figurinhas')
  const [stickers, setStickers] = useState([])
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const fileRef = useRef(null)

  async function load() {
    try {
      const { stickers } = await api('/stickers')
      setStickers(stickers)
    } catch {
      setStickers([])
    }
  }
  useEffect(() => {
    load()
  }, [])

  async function addSticker(file) {
    if (!file) return
    setErr('')
    setBusy(true)
    try {
      const url = await fileToSticker(file)
      const { stickers } = await api('/stickers', {
        method: 'POST',
        body: { url, name: file.name?.split('.')[0]?.slice(0, 24) || 'figurinha' },
      })
      setStickers(stickers)
    } catch (e) {
      setErr(e.message || 'nao deu pra adicionar')
    } finally {
      setBusy(false)
    }
  }

  async function del(id) {
    try {
      const { stickers } = await api(`/stickers/${id}`, { method: 'DELETE' })
      setStickers(stickers)
    } catch (e) {
      setErr(e.message)
    }
  }

  const filtered = q
    ? stickers.filter((s) => s.name.toLowerCase().includes(q.toLowerCase()))
    : stickers

  return (
    <div className="stk-picker">
      <div className="stk-tabs">
        <button className={tab === 'figurinhas' ? 'on' : ''} onClick={() => setTab('figurinhas')}>
          figurinhas
        </button>
        <button className={tab === 'emoji' ? 'on' : ''} onClick={() => setTab('emoji')}>
          emoji
        </button>
        <button className="stk-close" onClick={onClose}>✕</button>
      </div>

      {tab === 'figurinhas' && (
        <>
          <input
            className="stk-search"
            placeholder="buscar figurinha…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          {err && <div className="stk-err">{err}</div>}
          <div className="stk-grid">
            <button className="stk-add" disabled={busy} onClick={() => fileRef.current?.click()}>
              {busy ? '…' : '＋ adicionar'}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                addSticker(e.target.files?.[0])
                e.target.value = ''
              }}
            />
            {filtered.map((s) => (
              <div key={s.id} className="stk-item">
                <button onClick={() => onPick(s.url)} title={s.name}>
                  <img src={s.url} alt={s.name} />
                </button>
                <button className="stk-del" title="apagar" onClick={() => del(s.id)}>
                  ✕
                </button>
              </div>
            ))}
          </div>
          {stickers.length === 0 && (
            <p className="hint">nenhuma figurinha ainda — clica em "＋ adicionar" pra subir uma.</p>
          )}
        </>
      )}

      {tab === 'emoji' && (
        <div className="stk-grid emoji">
          {STICKERS.map((s) => (
            <button key={s} className="stk-emoji" onClick={() => onPick(s)}>
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
