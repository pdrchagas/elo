import { useEffect, useState } from 'react'
import { api } from './api.js'
import { useStore } from './store.js'
import Avatar from './Avatar.jsx'

function Modal({ title, onClose, children }) {
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <header>
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </header>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}

export function ConfirmDialog({ title, message, confirmLabel = 'confirmar', danger, onConfirm, onClose }) {
  return (
    <Modal title={title} onClose={onClose}>
      <p className="hint">{message}</p>
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>cancelar</button>
        <button
          className={`btn ${danger ? 'danger' : 'primary'}`}
          onClick={() => {
            onConfirm()
            onClose()
          }}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  )
}

export function CreateServerDialog({ onClose }) {
  const { friends, refreshAll, selectServer } = useStore()
  const accepted = friends.filter((f) => f.status === 'accepted')
  const [name, setName] = useState('')
  const [picked, setPicked] = useState([])
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  function toggle(id) {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))
  }

  async function create() {
    setErr('')
    setBusy(true)
    try {
      const { server } = await api('/servers', {
        method: 'POST',
        body: { name: name.trim(), friendIds: picked },
      })
      await refreshAll()
      selectServer(server.id)
      onClose()
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="criar servidor" onClose={onClose}>
      <label>
        nome
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="ex: os amigos" />
      </label>

      <div>
        <p className="hint" style={{ marginBottom: 6 }}>adicionar amigos agora (opcional):</p>
        <div className="pick-list">
          {accepted.length === 0 && <p className="hint">voce ainda nao tem amigos aceitos.</p>}
          {accepted.map((f) => {
            const on = picked.includes(f.user.id)
            return (
              <button
                key={f.rel}
                type="button"
                className={`pick-item ${on ? 'on' : ''}`}
                onClick={() => toggle(f.user.id)}
              >
                <span className="pick-check">{on ? '✓' : ''}</span>
                <Avatar user={f.user} size={26} />
                <span className="pick-name">{f.user.displayName}</span>
              </button>
            )
          })}
        </div>
      </div>

      {err && <div className="form-error">{err}</div>}
      <button className="btn primary full" disabled={!name.trim() || busy} onClick={create}>
        {busy ? 'criando…' : 'criar'}
      </button>
    </Modal>
  )
}

export function AddChannelDialog({ server, onClose }) {
  const { refreshServers } = useStore()
  const [name, setName] = useState('')
  const [type, setType] = useState('text')

  async function create() {
    await api(`/servers/${server.id}/channels`, { method: 'POST', body: { name, type } })
    await refreshServers()
    onClose()
  }

  return (
    <Modal title="novo canal" onClose={onClose}>
      <div className="seg">
        <button className={type === 'text' ? 'on' : ''} onClick={() => setType('text')}># texto</button>
        <button className={type === 'voice' ? 'on' : ''} onClick={() => setType('voice')}>🔊 voz</button>
      </div>
      <label>
        nome
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="nome do canal" />
      </label>
      <button className="btn primary full" disabled={!name.trim()} onClick={create}>
        criar canal
      </button>
    </Modal>
  )
}

export function InviteDialog({ server, onClose }) {
  const { user, friends, refreshServers, refreshAll, selectServer } = useStore()
  const [appLink, setAppLink] = useState('')
  const [serverLink, setServerLink] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)

  async function deleteServer() {
    setBusy(true)
    try {
      await api(`/servers/${server.id}`, { method: 'DELETE' })
      await refreshAll()
      selectServer(null)
      onClose()
    } catch (e) {
      alert(e.message)
    } finally {
      setBusy(false)
    }
  }

  const accepted = friends.filter((f) => f.status === 'accepted')
  const memberIds = new Set(server.members.map((m) => m.id))
  const addable = accepted.filter((f) => !memberIds.has(f.user.id))

  async function makeAppInvite() {
    setBusy(true)
    try {
      const { invite } = await api('/invites', { method: 'POST', body: { kind: 'app' } })
      setAppLink(invite.url || `${window.location.origin}/?invite=${invite.code}`)
    } finally {
      setBusy(false)
    }
  }

  async function makeServerInvite() {
    setBusy(true)
    try {
      const { invite } = await api('/invites', {
        method: 'POST',
        body: { kind: 'server', serverId: server.id },
      })
      setServerLink(invite.url || `${window.location.origin}/?join=${invite.code}`)
    } finally {
      setBusy(false)
    }
  }

  async function addMember(userId) {
    await api(`/servers/${server.id}/members`, { method: 'POST', body: { userId } })
    await refreshServers()
  }

  async function kick(userId) {
    await api(`/servers/${server.id}/members/${userId}`, { method: 'DELETE' })
    await refreshServers()
  }

  const canManage = server.myPerms?.manage
  const canKick = server.myPerms?.kick || canManage

  return (
    <Modal title={`${server.name} — servidor`} onClose={onClose}>
      {user.isAdmin && (
        <section>
          <h4>convite para o app</h4>
          <p className="hint">link que da acesso ao app (para quem ainda nao tem conta).</p>
          {appLink ? (
            <CopyField value={appLink} />
          ) : (
            <button className="btn full" disabled={busy} onClick={makeAppInvite}>
              gerar link de acesso ao app
            </button>
          )}
        </section>
      )}

      <section>
        <h4>convite para este servidor</h4>
        <p className="hint">para amigos que ja usam o app entrarem neste servidor.</p>
        {serverLink ? (
          <CopyField value={serverLink} />
        ) : (
          <button className="btn full" disabled={busy} onClick={makeServerInvite}>
            gerar link do servidor
          </button>
        )}
      </section>

      <section>
        <h4>adicionar amigos direto</h4>
        {addable.length === 0 && <p className="hint">todos os seus amigos ja estao aqui.</p>}
        {addable.map((f) => (
          <div key={f.rel} className="friend-row">
            <span className="avatar sm" style={{ background: f.user.color }}>
              {f.user.displayName.slice(0, 1).toUpperCase()}
            </span>
            <span className="grow">{f.user.displayName}</span>
            <button className="btn sm primary" onClick={() => addMember(f.user.id)}>
              adicionar
            </button>
          </div>
        ))}
      </section>

      {canManage && <RolesSection server={server} />}

      <section>
        <h4>membros ({server.members.length})</h4>
        {server.members.map((m) => (
          <MemberRow
            key={m.id}
            server={server}
            m={m}
            canManage={canManage}
            canKick={canKick}
            meId={user.id}
            onKick={() => kick(m.id)}
          />
        ))}
      </section>

      {server.isOwner && (
        <section className="danger-zone">
          <h4>zona de perigo</h4>
          {confirmDel ? (
            <>
              <p className="hint">
                isso apaga <strong>{server.name}</strong>, os canais e todas as mensagens. nao dá pra desfazer.
              </p>
              <div className="modal-actions">
                <button className="btn" disabled={busy} onClick={() => setConfirmDel(false)}>
                  cancelar
                </button>
                <button className="btn danger" disabled={busy} onClick={deleteServer}>
                  apagar de vez
                </button>
              </div>
            </>
          ) : (
            <button className="btn danger full" onClick={() => setConfirmDel(true)}>
              apagar servidor
            </button>
          )}
        </section>
      )}
    </Modal>
  )
}

const PERMS = [
  ['canKick', '🥾 expulsar do servidor'],
  ['canMute', '🔇 silenciar na call'],
  ['canMove', '↔ mover de canal de voz'],
  ['canDisconnect', '📞 desconectar da call'],
]

function RolesSection({ server }) {
  const { refreshServers } = useStore()
  const roles = server.roles || []
  const [name, setName] = useState('')
  const [perms, setPerms] = useState({ canKick: false, canMute: false, canMove: false, canDisconnect: false })

  async function createRole() {
    await api(`/servers/${server.id}/roles`, { method: 'POST', body: { name, ...perms } })
    setName('')
    setPerms({ canKick: false, canMute: false, canMove: false, canDisconnect: false })
    await refreshServers()
  }
  async function togglePerm(roleId, key, val) {
    await api(`/servers/${server.id}/roles/${roleId}`, { method: 'PATCH', body: { [key]: val } })
    await refreshServers()
  }
  async function delRole(roleId) {
    await api(`/servers/${server.id}/roles/${roleId}`, { method: 'DELETE' })
    await refreshServers()
  }

  return (
    <section>
      <h4>cargos</h4>
      <p className="hint">quem tem um cargo com a permissão pode fazer aquilo no servidor.</p>

      {roles.map((role) => (
        <div key={role.id} className="role-row">
          <span className="role-name" style={{ color: role.color }}>● {role.name}</span>
          <div className="role-perms">
            {PERMS.map(([key, label]) => (
              <label key={key} className="role-perm">
                <input
                  type="checkbox"
                  checked={!!role[key]}
                  onChange={(e) => togglePerm(role.id, key, e.target.checked)}
                />
                {label}
              </label>
            ))}
          </div>
          <button className="btn sm ghost" onClick={() => delRole(role.id)}>apagar</button>
        </div>
      ))}

      <div className="role-new">
        <input
          placeholder="nome do novo cargo (ex: moderador)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={24}
        />
        <div className="role-perms">
          {PERMS.map(([key, label]) => (
            <label key={key} className="role-perm">
              <input
                type="checkbox"
                checked={perms[key]}
                onChange={(e) => setPerms((p) => ({ ...p, [key]: e.target.checked }))}
              />
              {label}
            </label>
          ))}
        </div>
        <button className="btn primary sm" disabled={!name.trim()} onClick={createRole}>
          criar cargo
        </button>
      </div>
    </section>
  )
}

function MemberRow({ server, m, canManage, canKick, meId, onKick }) {
  const { refreshServers } = useStore()
  const [open, setOpen] = useState(false)
  const roles = server.roles || []
  const isOwner = m.role === 'owner'

  async function toggleRole(roleId) {
    const has = (m.roleIds || []).includes(roleId)
    const next = has ? m.roleIds.filter((x) => x !== roleId) : [...(m.roleIds || []), roleId]
    await api(`/servers/${server.id}/members/${m.id}/roles`, { method: 'PUT', body: { roleIds: next } })
    await refreshServers()
  }

  const myRoles = roles.filter((r) => (m.roleIds || []).includes(r.id))

  return (
    <div className="member-row2">
      <Avatar user={m} size={28} online={m.online} />
      <div className="grow">
        <div>
          {m.displayName} {isOwner && '👑'}
        </div>
        <div className="member-tags">
          {myRoles.map((r) => (
            <span key={r.id} className="role-tag" style={{ color: r.color }}>{r.name}</span>
          ))}
        </div>
      </div>
      {canManage && roles.length > 0 && !isOwner && (
        <button className="btn sm" onClick={() => setOpen((v) => !v)}>cargos</button>
      )}
      {canKick && !isOwner && m.id !== meId && (
        <button className="btn sm danger" onClick={onKick}>expulsar</button>
      )}

      {open && (
        <div className="member-roles">
          {roles.map((r) => (
            <label key={r.id} className="role-perm">
              <input
                type="checkbox"
                checked={(m.roleIds || []).includes(r.id)}
                onChange={() => toggleRole(r.id)}
              />
              <span style={{ color: r.color }}>{r.name}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

function CopyField({ value }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="copy-field">
      <input readOnly value={value} onFocus={(e) => e.target.select()} />
      <button
        className="btn sm"
        onClick={() => {
          navigator.clipboard.writeText(value).then(() => {
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          })
        }}
      >
        {copied ? 'copiado ✓' : 'copiar'}
      </button>
    </div>
  )
}
