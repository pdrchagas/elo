import { useState } from 'react'
import { useStore } from './store.js'
import { api } from './api.js'
import { CreateServerDialog } from './Dialogs.jsx'

export default function Home() {
  const { user, friends, refreshFriends, online } = useStore()
  const [username, setUsername] = useState('')
  const [msg, setMsg] = useState('')
  const [dialog, setDialog] = useState(false)

  const incoming = friends.filter((f) => f.incoming)
  const pendingSent = friends.filter((f) => f.status === 'pending' && !f.incoming)
  const accepted = friends.filter((f) => f.status === 'accepted')

  async function addFriend(e) {
    e.preventDefault()
    setMsg('')
    try {
      await api('/friends/request', { method: 'POST', body: { username } })
      setUsername('')
      setMsg('pedido enviado ✓')
      refreshFriends()
    } catch (err) {
      setMsg(err.message)
    }
  }

  async function act(rel, action) {
    await api(`/friends/${rel}${action}`, { method: action === '' ? 'DELETE' : 'POST' })
    refreshFriends()
  }

  return (
    <div className="home">
      <header className="content-head">
        <h2>amigos</h2>
        <button className="btn primary" onClick={() => setDialog(true)}>
          criar servidor
        </button>
      </header>

      <div className="home-body">
        <section className="panel">
          <h3>adicionar amigo</h3>
          <form className="row" onSubmit={addFriend}>
            <input
              placeholder="nome de usuario do seu amigo"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
            <button className="btn primary">enviar</button>
          </form>
          {msg && <p className="hint">{msg}</p>}
          <p className="hint">
            seu usuario: <strong>@{user.username}</strong> — passe pros seus amigos ou mande o link de convite
            (engrenagem de um servidor).
          </p>
        </section>

        {incoming.length > 0 && (
          <section className="panel">
            <h3>pedidos recebidos</h3>
            {incoming.map((f) => (
              <div key={f.rel} className="friend-row">
                <span className="avatar sm" style={{ background: f.user.color }}>
                  {f.user.displayName.slice(0, 1).toUpperCase()}
                </span>
                <span className="grow">{f.user.displayName} <small>@{f.user.username}</small></span>
                <button className="btn sm primary" onClick={() => act(f.rel, '/accept')}>
                  aceitar
                </button>
                <button className="btn sm" onClick={() => act(f.rel, '')}>
                  recusar
                </button>
              </div>
            ))}
          </section>
        )}

        <section className="panel">
          <h3>
            meus amigos ({accepted.length})
            {' · '}
            <small>{accepted.filter((f) => online[f.user.id] || f.user.online).length} online</small>
          </h3>
          {accepted.length === 0 && <p className="hint">ainda sem amigos por aqui.</p>}
          {accepted.map((f) => {
            const isOn = !!(online[f.user.id] || f.user.online)
            return (
              <div key={f.rel} className={`friend-row ${isOn ? '' : 'dim'}`}>
                <span className={`avatar sm ${isOn ? 'online' : ''}`} style={{ background: f.user.color }}>
                  {f.user.displayName.slice(0, 1).toUpperCase()}
                </span>
                <span className="grow">
                  {f.user.displayName} <small>{isOn ? 'online' : `@${f.user.username}`}</small>
                </span>
                <button className="btn sm ghost" onClick={() => act(f.rel, '')}>
                  remover
                </button>
              </div>
            )
          })}
          {pendingSent.map((f) => (
            <div key={f.rel} className="friend-row dim">
              <span className="avatar sm" style={{ background: f.user.color }}>
                {f.user.displayName.slice(0, 1).toUpperCase()}
              </span>
              <span className="grow">{f.user.displayName} <small>pedido pendente</small></span>
              <button className="btn sm ghost" onClick={() => act(f.rel, '')}>
                cancelar
              </button>
            </div>
          ))}
        </section>
      </div>

      {dialog && <CreateServerDialog onClose={() => setDialog(false)} />}
    </div>
  )
}
