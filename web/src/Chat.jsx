import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from './api.js'
import { getSocket } from './socket.js'
import { useStore } from './store.js'
import { fileToChatImage } from './media.js'
import Avatar from './Avatar.jsx'
import EmojiPicker from './EmojiPicker.jsx'

function renderContent(text, mentionUsers = [], meId) {
  if (!text) return null
  const byName = {}
  for (const u of mentionUsers) byName[u.username.toLowerCase()] = u
  return text.split(/(@[a-z0-9._-]{3,20})/gi).map((p, i) => {
    if (p[0] === '@') {
      const u = byName[p.slice(1).toLowerCase()]
      if (u) return <span key={i} className={`mention ${u.id === meId ? 'me' : ''}`}>@{u.displayName}</span>
    }
    return p
  })
}

export default function Chat({ server, channel }) {
  const me = useStore((s) => s.user)
  const clearMentions = useStore((s) => s.clearMentions)
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [pendingImg, setPendingImg] = useState(null)
  const [showStickers, setShowStickers] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [lightbox, setLightbox] = useState(null)
  const [mentionQuery, setMentionQuery] = useState(null) // {start, word} ou null
  const scroller = useRef(null)
  const fileInput = useRef(null)
  const msgInput = useRef(null)

  useEffect(() => {
    let alive = true
    setMessages([])
    setPendingImg(null)
    setShowStickers(false)
    setText('')
    clearMentions(channel.id)
    api(`/servers/${server.id}/channels/${channel.id}/messages`)
      .then(({ messages }) => alive && setMessages(messages))
      .catch(() => {})

    const socket = getSocket()
    socket?.emit('chat:subscribe', { channelId: channel.id })
    const onMsg = (m) => {
      if (m.channelId === channel.id) {
        setMessages((prev) => [...prev, m])
        clearMentions(channel.id)
      }
    }
    const onErr = ({ error }) => setErr(error)
    socket?.on('chat:message', onMsg)
    socket?.on('chat:error', onErr)
    return () => {
      alive = false
      socket?.off('chat:message', onMsg)
      socket?.off('chat:error', onErr)
    }
  }, [server.id, channel.id])

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight })
  }, [messages])

  // sugestoes de @mencao
  const suggestions = useMemo(() => {
    if (mentionQuery == null) return []
    const q = mentionQuery.word.toLowerCase()
    return (server.members || [])
      .filter(
        (mm) =>
          mm.id !== me.id &&
          (mm.username.toLowerCase().includes(q) || mm.displayName.toLowerCase().includes(q)),
      )
      .slice(0, 6)
  }, [mentionQuery, server.members, me.id])

  function onChangeText(e) {
    const v = e.target.value
    setText(v)
    const pos = e.target.selectionStart ?? v.length
    const before = v.slice(0, pos)
    const m = before.match(/(?:^|\s)@([a-z0-9._-]*)$/i)
    if (m) setMentionQuery({ start: pos - m[1].length - 1, word: m[1] })
    else setMentionQuery(null)
  }

  function applyMention(member) {
    const el = msgInput.current
    const pos = el?.selectionStart ?? text.length
    const next = text.slice(0, mentionQuery.start) + '@' + member.username + ' ' + text.slice(pos)
    setText(next)
    setMentionQuery(null)
    requestAnimationFrame(() => {
      el?.focus()
      const p = mentionQuery.start + member.username.length + 2
      el?.setSelectionRange(p, p)
    })
  }

  async function pickImage(file) {
    if (!file) return
    setErr('')
    setBusy(true)
    try {
      setPendingImg(await fileToChatImage(file))
    } catch (e) {
      setErr(e.message || 'nao deu pra usar essa imagem')
    } finally {
      setBusy(false)
    }
  }

  function onPaste(e) {
    const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'))
    if (item) {
      e.preventDefault()
      pickImage(item.getAsFile())
    }
  }

  function send(e) {
    e?.preventDefault()
    if (mentionQuery && suggestions.length) {
      applyMention(suggestions[0])
      return
    }
    const content = text.trim()
    if (!content && !pendingImg) return
    getSocket()?.emit('chat:send', { channelId: channel.id, content, image: pendingImg || undefined })
    setText('')
    setPendingImg(null)
  }

  function sendSticker(url) {
    getSocket()?.emit('chat:send', { channelId: channel.id, sticker: url })
    setShowStickers(false)
  }

  function insertEmoji(ch) {
    const el = msgInput.current
    if (!el) return setText((t) => t + ch)
    const start = el.selectionStart ?? text.length
    const end = el.selectionEnd ?? text.length
    setText(text.slice(0, start) + ch + text.slice(end))
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(start + ch.length, start + ch.length)
    })
  }

  return (
    <div className="chat">
      <header className="content-head">
        <h2><span className="hash">#</span> {channel.name}</h2>
      </header>

      <div className="messages" ref={scroller}>
        {messages.length === 0 && <p className="hint center">seja o primeiro a falar em #{channel.name}</p>}
        {messages.map((m) => (
          <div key={m.id} className={`msg ${m.mentions?.includes(me.id) ? 'mentioned' : ''}`}>
            <Avatar user={m.author} size={38} />
            <div className="msg-main">
              <div className="msg-head">
                <strong>{m.author?.displayName || 'desconhecido'}</strong>
                <small>
                  {new Date(m.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </small>
              </div>
              {m.content && <div className="msg-body">{renderContent(m.content, m.mentionUsers, me.id)}</div>}
              {m.sticker &&
                (String(m.sticker).startsWith('data:') ? (
                  <img className="msg-sticker-img" src={m.sticker} alt="figurinha" />
                ) : (
                  <div className="msg-sticker">{m.sticker}</div>
                ))}
              {m.image && (
                <img className="msg-image" src={m.image} alt="imagem" onClick={() => setLightbox(m.image)} />
              )}
            </div>
          </div>
        ))}
      </div>

      {err && <div className="chat-err" onClick={() => setErr('')}>{err} (clica pra fechar)</div>}

      {pendingImg && (
        <div className="pending-img">
          <img src={pendingImg} alt="previa" />
          <button className="btn sm" onClick={() => setPendingImg(null)}>remover</button>
          <span className="hint">a imagem vai junto quando você enviar</span>
        </div>
      )}

      {showStickers && (
        <EmojiPicker onEmoji={insertEmoji} onSticker={sendSticker} onClose={() => setShowStickers(false)} />
      )}

      <div className="composer-wrap">
        {suggestions.length > 0 && (
          <div className="mention-menu">
            {suggestions.map((mm) => (
              <button key={mm.id} onClick={() => applyMention(mm)}>
                <Avatar user={mm} size={22} noClick />
                <span>{mm.displayName}</span>
                <small>@{mm.username}</small>
              </button>
            ))}
          </div>
        )}
        <form className="composer" onSubmit={send} onPaste={onPaste}>
          <button
            type="button"
            className="composer-btn"
            title="imagem"
            disabled={busy}
            onClick={() => fileInput.current?.click()}
          >
            {busy ? '…' : '🖼'}
          </button>
          <button
            type="button"
            className={`composer-btn ${showStickers ? 'on' : ''}`}
            title="emoji e figurinhas"
            onClick={() => setShowStickers((v) => !v)}
          >
            😀
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              pickImage(e.target.files?.[0])
              e.target.value = ''
            }}
          />
          <input
            ref={msgInput}
            placeholder={`mensagem em #${channel.name}  ·  @ pra mencionar`}
            value={text}
            onChange={onChangeText}
            onBlur={() => setTimeout(() => setMentionQuery(null), 150)}
          />
          <button className="btn primary">enviar</button>
        </form>
      </div>

      {lightbox && (
        <div className="lightbox" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="imagem" />
        </div>
      )}
    </div>
  )
}
