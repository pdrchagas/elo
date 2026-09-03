import { useEffect, useRef, useState } from 'react'
import { api } from './api.js'
import { getSocket } from './socket.js'
import { useStore } from './store.js'
import { fileToChatImage } from './media.js'
import Avatar from './Avatar.jsx'
import EmojiPicker from './EmojiPicker.jsx'

export default function Chat({ server, channel }) {
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [pendingImg, setPendingImg] = useState(null) // data URI aguardando envio
  const [showStickers, setShowStickers] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [lightbox, setLightbox] = useState(null)
  const scroller = useRef(null)
  const fileInput = useRef(null)
  const msgInput = useRef(null)

  useEffect(() => {
    let alive = true
    setMessages([])
    setPendingImg(null)
    setShowStickers(false)
    api(`/servers/${server.id}/channels/${channel.id}/messages`)
      .then(({ messages }) => alive && setMessages(messages))
      .catch(() => {})

    const socket = getSocket()
    socket?.emit('chat:subscribe', { channelId: channel.id })
    const onMsg = (m) => {
      if (m.channelId === channel.id) setMessages((prev) => [...prev, m])
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
    if (!el) {
      setText((t) => t + ch)
      return
    }
    const start = el.selectionStart ?? text.length
    const end = el.selectionEnd ?? text.length
    const next = text.slice(0, start) + ch + text.slice(end)
    setText(next)
    requestAnimationFrame(() => {
      el.focus()
      const pos = start + ch.length
      el.setSelectionRange(pos, pos)
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
          <div key={m.id} className="msg">
            <Avatar user={m.author} size={38} />
            <div className="msg-main">
              <div className="msg-head">
                <strong>{m.author?.displayName || 'desconhecido'}</strong>
                <small>
                  {new Date(m.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </small>
              </div>
              {m.content && <div className="msg-body">{m.content}</div>}
              {m.sticker &&
                (String(m.sticker).startsWith('data:') ? (
                  <img className="msg-sticker-img" src={m.sticker} alt="figurinha" />
                ) : (
                  <div className="msg-sticker">{m.sticker}</div>
                ))}
              {m.image && (
                <img
                  className="msg-image"
                  src={m.image}
                  alt="imagem"
                  onClick={() => setLightbox(m.image)}
                />
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
        <EmojiPicker
          onEmoji={insertEmoji}
          onSticker={sendSticker}
          onClose={() => setShowStickers(false)}
        />
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
          placeholder={`mensagem em #${channel.name}`}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button className="btn primary">enviar</button>
      </form>

      {lightbox && (
        <div className="lightbox" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="imagem" />
        </div>
      )}
    </div>
  )
}
