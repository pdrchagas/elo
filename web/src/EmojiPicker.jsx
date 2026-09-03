import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from './api.js'
import { fileToSticker } from './media.js'
import { EMOJI_CATEGORIES, EMOJI_KEYWORDS, RECENT_KEY } from './emojis.js'

function loadRecents() {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]').slice(0, 24)
  } catch {
    return []
  }
}
function pushRecent(ch) {
  try {
    const list = [ch, ...loadRecents().filter((x) => x !== ch)].slice(0, 24)
    localStorage.setItem(RECENT_KEY, JSON.stringify(list))
  } catch {}
}

export default function EmojiPicker({ onEmoji, onSticker, onClose }) {
  const [tab, setTab] = useState('emoji')
  const [q, setQ] = useState('')
  const [recents, setRecents] = useState(loadRecents)

  // figurinhas
  const [stickers, setStickers] = useState([])
  const [stkErr, setStkErr] = useState('')
  const [stkBusy, setStkBusy] = useState(false)
  const fileRef = useRef(null)

  useEffect(() => {
    if (tab !== 'figurinhas') return
    api('/stickers')
      .then(({ stickers }) => setStickers(stickers))
      .catch(() => setStickers([]))
  }, [tab])

  const searchResults = useMemo(() => {
    if (!q.trim()) return null
    const term = q.trim().toLowerCase()
    const out = []
    for (const cat of EMOJI_CATEGORIES) {
      for (const e of cat.emojis) {
        if ((EMOJI_KEYWORDS[e] || '').includes(term)) out.push(e)
      }
    }
    return [...new Set(out)]
  }, [q])

  function pick(ch) {
    onEmoji(ch)
    pushRecent(ch)
    setRecents(loadRecents())
  }

  async function addSticker(file) {
    if (!file) return
    setStkErr('')
    setStkBusy(true)
    try {
      const url = await fileToSticker(file)
      const { stickers } = await api('/stickers', {
        method: 'POST',
        body: { url, name: file.name?.split('.')[0]?.slice(0, 24) || 'figurinha' },
      })
      setStickers(stickers)
    } catch (e) {
      setStkErr(e.message || 'nao deu pra adicionar')
    } finally {
      setStkBusy(false)
    }
  }
  async function delSticker(id) {
    try {
      const { stickers } = await api(`/stickers/${id}`, { method: 'DELETE' })
      setStickers(stickers)
    } catch (e) {
      setStkErr(e.message)
    }
  }

  return (
    <div className="emoji-picker">
      <div className="ep-tabs">
        <button className={tab === 'emoji' ? 'on' : ''} onClick={() => setTab('emoji')}>emoji</button>
        <button className={tab === 'figurinhas' ? 'on' : ''} onClick={() => setTab('figurinhas')}>figurinhas</button>
        <button className="ep-close" onClick={onClose}>✕</button>
      </div>

      {tab === 'emoji' && (
        <>
          <input
            className="ep-search"
            placeholder="buscar emoji…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoFocus
          />
          <div className="ep-scroll">
            {searchResults ? (
              searchResults.length ? (
                <div className="ep-grid">
                  {searchResults.map((e, i) => (
                    <button key={e + i} onClick={() => pick(e)}>{e}</button>
                  ))}
                </div>
              ) : (
                <p className="hint">nada encontrado — tenta navegar pelas categorias</p>
              )
            ) : (
              <>
                {recents.length > 0 && (
                  <>
                    <div className="ep-cat">recentes</div>
                    <div className="ep-grid">
                      {recents.map((e, i) => (
                        <button key={e + i} onClick={() => pick(e)}>{e}</button>
                      ))}
                    </div>
                  </>
                )}
                {EMOJI_CATEGORIES.map((cat) => (
                  <div key={cat.id}>
                    <div className="ep-cat">{cat.label} {cat.id}</div>
                    <div className="ep-grid">
                      {cat.emojis.map((e, i) => (
                        <button key={e + i} onClick={() => pick(e)}>{e}</button>
                      ))}
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
          <div className="ep-hint">clica pra adicionar no texto — dá pra pôr vários</div>
        </>
      )}

      {tab === 'figurinhas' && (
        <>
          {stkErr && <div className="ep-err">{stkErr}</div>}
          <div className="ep-scroll">
            <div className="stk-grid">
              <button className="stk-add" disabled={stkBusy} onClick={() => fileRef.current?.click()}>
                {stkBusy ? '…' : '＋ adicionar'}
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
              {stickers.map((s) => (
                <div key={s.id} className="stk-item">
                  <button onClick={() => onSticker(s.url)} title={s.name}>
                    <img src={s.url} alt={s.name} />
                  </button>
                  <button className="stk-del" onClick={() => delSticker(s.id)}>✕</button>
                </div>
              ))}
            </div>
            {stickers.length === 0 && (
              <p className="hint">nenhuma figurinha ainda — clica em "＋ adicionar".</p>
            )}
          </div>
          <div className="ep-hint">figurinha é enviada na hora (sem texto)</div>
        </>
      )}
    </div>
  )
}
