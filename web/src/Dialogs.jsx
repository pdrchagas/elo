import { useEffect, useState } from 'react'
import { api } from './api.js'
import { useStore } from './store.js'

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

  function toggle(id) {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))
  }

  async function create() {
    setErr('')
    try {
      const { server } = await api('/servers', {
        method: 'POST',
        body: { name, friendIds: picked },
      })
      await refreshAll()
      selectServer(server.id)
      onClose()
    } catch (e) {
      setErr(e.message)
    }
  }

  return (
    <Modal title="criar servidor" onClose={onClose}>
      <label>
        nome
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="ex: os amigos" />
      </label>

      <p className="hint">adicionar amigos agora (opcional):</p>
      <div className="pick-list">
        {accepted.length === 0 && <p className="hint">voce ainda nao tem amigos aceitos.</p>}
        {accepted.map((f) => (
          <label key={f.rel} className="pick-item">
            <input type="checkbox" checked={picked.includes(f.user.id)} onChange={() => toggle(f.user.id)} />
            <span className="avatar sm" style={{ background: f.user.color }}>
              {f.user.displayName.slice(0, 1).toUpperCase()}
            </span>
            {f.user.displayName}
          </label>
        ))}
      </div>

      {err && <div className="form-error">{err}</div>}
      <button className="btn primary full" disabled={!name.trim()} onClick={create}>
        criar
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
      setAppLink(`${window.location.origin}${window.location.pathname}?invite=${invite.code}`)
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
      setServerLink(`${window.location.origin}${window.location.pathname}?join=${invite.code}`)
    } finally {
      setBusy(false)
    }
  }

  async function addMember(userId) {
    await api(`/servers/${server.id}/members`, { method: 'POST', body: { userId } })
    await refreshServers()
  }

  return (
    <Modal title={`${server.name} — convites`} onClose={onClose}>
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

      <section>
        <h4>membros ({server.members.length})</h4>
        <div className="member-chips">
          {server.members.map((m) => (
            <span key={m.id} className="chip">
              <span className="dot" style={{ background: m.color }} />
              {m.displayName}
              {m.role === 'owner' && ' 👑'}
            </span>
          ))}
        </div>
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
