import { useEffect, useRef, useState } from 'react'
import { api } from './api.js'
import { getSocket } from './socket.js'
import { useStore } from './store.js'

export default function Chat({ server, channel }) {
  const user = useStore((s) => s.user)
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const scroller = useRef(null)

  useEffect(() => {
    let alive = true
    setMessages([])
    api(`/servers/${server.id}/channels/${channel.id}/messages`)
      .then(({ messages }) => alive && setMessages(messages))
      .catch(() => {})

    const socket = getSocket()
    socket?.emit('chat:subscribe', { channelId: channel.id })
    const onMsg = (m) => {
      if (m.channelId === channel.id) setMessages((prev) => [...prev, m])
    }
    socket?.on('chat:message', onMsg)
    return () => {
      alive = false
      socket?.off('chat:message', onMsg)
    }
  }, [server.id, channel.id])

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight })
  }, [messages])

  function send(e) {
    e.preventDefault()
    const content = text.trim()
    if (!content) return
    getSocket()?.emit('chat:send', { channelId: channel.id, content })
    setText('')
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
            <span className="avatar sm" style={{ background: m.author?.color || '#666' }}>
              {(m.author?.displayName || '?').slice(0, 1).toUpperCase()}
            </span>
            <div>
              <div className="msg-head">
                <strong>{m.author?.displayName || 'desconhecido'}</strong>
                <small>{new Date(m.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</small>
              </div>
              <div className="msg-body">{m.content}</div>
            </div>
          </div>
        ))}
      </div>

      <form className="composer" onSubmit={send}>
        <input
          placeholder={`mensagem em #${channel.name}`}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button className="btn primary">enviar</button>
      </form>
    </div>
  )
}
