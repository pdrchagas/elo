import { useState } from 'react'
import { useProfile } from './profile.js'
import { useStore } from './store.js'
import { api } from './api.js'
import Avatar from './Avatar.jsx'

export default function ProfileCard({ onEditProfile }) {
  const pu = useProfile((s) => s.user)
  const close = useProfile((s) => s.close)
  const { user: me, friends, servers, activeServerId, online, refreshFriends, refreshServers } = useStore()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  if (!pu) return null

  const isMe = pu.id === me.id
  const rel = friends.find((f) => f.user.id === pu.id)
  const isOn = !!(online[pu.id] || rel?.user?.online)
  const mutual = servers.filter((s) => s.members?.some((m) => m.id === pu.id)).map((s) => s.name)

  const server = servers.find((s) => s.id === activeServerId)
  const canKickHere =
    server &&
    !isMe &&
    (server.myPerms?.kick || server.myPerms?.manage) &&
    server.ownerId !== pu.id &&
    server.members?.some((m) => m.id === pu.id)

  async function kick() {
    setBusy(true)
    try {
      await api(`/servers/${server.id}/members/${pu.id}`, { method: 'DELETE' })
      await refreshServers()
      close()
    } catch (e) {
      setMsg(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function addFriend() {
    setBusy(true)
    setMsg('')
    try {
      await api('/friends/request', { method: 'POST', body: { username: pu.username } })
      setMsg('pedido enviado ✓')
      refreshFriends()
    } catch (e) {
      setMsg(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="pc-backdrop" onMouseDown={close}>
      <div className="pc" onMouseDown={(e) => e.stopPropagation()}>
        <div className="pc-banner" style={{ background: pu.color || '#5865F2' }} />
        <div className="pc-avatar-wrap">
          <Avatar user={pu} size={80} noClick className={isOn ? 'online' : ''} />
        </div>

        <div className="pc-body">
          <h3>{pu.displayName}</h3>
          <div className="pc-sub">
            @{pu.username}
            {pu.isAdmin && ' · admin'}
            {isOn && ' · online'}
          </div>

          {mutual.length > 0 && (
            <p className="hint pc-mutual">servidores em comum: {mutual.join(', ')}</p>
          )}

          {msg && <p className="hint">{msg}</p>}

          <div className="pc-actions">
            {isMe ? (
              <button className="btn full" onClick={() => (close(), onEditProfile?.())}>
                editar meu perfil
              </button>
            ) : rel?.status === 'accepted' ? (
              <span className="pc-tag">✓ amigos</span>
            ) : rel?.status === 'pending' ? (
              <span className="pc-tag">pedido pendente</span>
            ) : (
              <button className="btn primary full" disabled={busy} onClick={addFriend}>
                {busy ? '…' : 'adicionar amigo'}
              </button>
            )}

            {canKickHere && (
              <button className="btn danger full" disabled={busy} onClick={kick}>
                expulsar de {server.name}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
