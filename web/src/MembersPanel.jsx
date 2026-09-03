import { useMemo } from 'react'
import { useStore } from './store.js'
import Avatar from './Avatar.jsx'

export default function MembersPanel({ server, onClose }) {
  const online = useStore((s) => s.online)

  const { on, off } = useMemo(() => {
    const on = []
    const off = []
    for (const m of server.members || []) {
      ;(online[m.id] || m.online ? on : off).push(m)
    }
    const byName = (a, b) => a.displayName.localeCompare(b.displayName)
    return { on: on.sort(byName), off: off.sort(byName) }
  }, [server.members, online])

  return (
    <aside className="members-panel">
      <div className="members-head">
        membros — {server.members.length}
        <button className="members-close" onClick={onClose} aria-label="fechar">✕</button>
      </div>

      <div className="members-group">online — {on.length}</div>
      {on.map((m) => (
        <MemberRow key={m.id} m={m} online />
      ))}

      {off.length > 0 && <div className="members-group">offline — {off.length}</div>}
      {off.map((m) => (
        <MemberRow key={m.id} m={m} />
      ))}
    </aside>
  )
}

function MemberRow({ m, online }) {
  return (
    <div className={`member-row ${online ? '' : 'dim'}`}>
      <Avatar user={m} size={28} online={online} />
      <span className="member-name">
        {m.displayName}
        {m.role === 'owner' && <span title="dono"> 👑</span>}
      </span>
    </div>
  )
}
