import { useEffect, useState } from 'react'
import { api, BASE, getToken } from './api.js'
import { useStore } from './store.js'
import Avatar from './Avatar.jsx'

function when(ts) {
  if (!ts) return 'nunca'
  const d = new Date(ts)
  return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

export default function AdminUsers() {
  const me = useStore((s) => s.user)
  const refreshAll = useStore((s) => s.refreshAll)
  const [users, setUsers] = useState(null)
  const [confirmDel, setConfirmDel] = useState(null)

  async function load() {
    try {
      const { users } = await api('/admin/users')
      setUsers(users)
    } catch (e) {
      setUsers([])
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function toggleAdmin(u) {
    await api(`/admin/users/${u.id}/admin`, { method: 'POST' })
    load()
  }

  async function removeUser(u) {
    await api(`/admin/users/${u.id}`, { method: 'DELETE' })
    setConfirmDel(null)
    load()
    refreshAll()
  }

  const [dl, setDl] = useState(false)
  async function downloadBackup() {
    setDl(true)
    try {
      const res = await fetch(`${BASE}/api/admin/backup`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      })
      if (!res.ok) throw new Error('falhou')
      const blob = await res.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `elo-backup-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(a.href)
    } catch {
      alert('nao consegui baixar o backup')
    } finally {
      setDl(false)
    }
  }

  if (!users) return <p className="hint">carregando…</p>

  const onlineCount = users.filter((u) => u.online).length

  return (
    <div className="settings-section">
      <h2>usuarios</h2>
      <p className="hint">
        {users.length} cadastrados · {onlineCount} online agora
      </p>

      <button className="btn" disabled={dl} onClick={downloadBackup}>
        {dl ? 'gerando…' : '⬇ baixar backup completo (json)'}
      </button>
      <p className="hint">guarde num lugar seguro. o backup automático diário também roda no GitHub.</p>

      <div className="admin-users">
        {users.map((u) => (
          <div key={u.id} className={`admin-user ${u.online ? '' : 'dim'}`}>
            <Avatar user={u} size={36} online={u.online} noClick />
            <div className="admin-user-info">
              <strong>
                {u.displayName}
                {u.isAdmin && <span className="admin-badge"> admin</span>}
                {u.id === me.id && <span className="hint"> (voce)</span>}
              </strong>
              <small>@{u.username}</small>
              <small>
                cadastrou {when(u.createdAt)} · ultimo login {when(u.lastLogin)}
                {u.loginCount ? ` (${u.loginCount}x)` : ''}
              </small>
            </div>
            {u.id !== me.id && (
              <div className="admin-user-actions">
                <button className="btn sm" onClick={() => toggleAdmin(u)}>
                  {u.isAdmin ? 'tirar admin' : 'tornar admin'}
                </button>
                {confirmDel === u.id ? (
                  <>
                    <button className="btn sm danger" onClick={() => removeUser(u)}>
                      confirmar
                    </button>
                    <button className="btn sm ghost" onClick={() => setConfirmDel(null)}>
                      nao
                    </button>
                  </>
                ) : (
                  <button className="btn sm ghost" onClick={() => setConfirmDel(u.id)}>
                    remover
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
      <p className="hint">
        "remover" apaga a conta da pessoa e tira o acesso ao site. Ela precisa de um novo link de
        convite pra voltar.
      </p>
    </div>
  )
}
