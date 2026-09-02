import { useEffect, useMemo, useState } from 'react'
import { useStore } from './store.js'
import { useVoice } from './voice.js'
import { getSocket } from './socket.js'
import { api } from './api.js'
import Home from './Home.jsx'
import Chat from './Chat.jsx'
import VoiceStage from './VoiceStage.jsx'
import { CreateServerDialog, InviteDialog, AddChannelDialog } from './Dialogs.jsx'

export default function Shell() {
  const {
    user, servers, activeServerId, activeChannelId,
    selectServer, selectChannel, logout, refreshServers, refreshFriends,
  } = useStore()
  const voice = useVoice()
  const [dialog, setDialog] = useState(null) // 'server' | 'invite' | 'channel'

  const server = servers.find((s) => s.id === activeServerId) || null
  const channel = server?.channels.find((c) => c.id === activeChannelId) || null

  // convite de servidor via ?join=CODE
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('join')
    if (!code) return
    api(`/servers/join/${code}`)
      .then(async ({ server }) => {
        await refreshServers()
        selectServer(server.id)
      })
      .catch(() => {})
      .finally(() => window.history.replaceState({}, '', window.location.pathname))
  }, [])

  // atualiza listas quando o socket sinaliza mudancas gerais
  useEffect(() => {
    const socket = getSocket()
    if (!socket) return
    const onRefresh = () => {
      refreshServers()
      refreshFriends()
    }
    socket.on('connect', onRefresh)
    return () => socket.off('connect', onRefresh)
  }, [])

  const voiceChannelInfo = useMemo(() => {
    for (const s of servers) {
      const c = s.channels.find((ch) => ch.id === voice.channelId)
      if (c) return { server: s, channel: c }
    }
    return null
  }, [servers, voice.channelId])

  return (
    <div className="shell">
      {/* trilha de servidores */}
      <nav className="rail">
        <button
          className={`rail-btn home ${!activeServerId ? 'active' : ''}`}
          title="Amigos"
          onClick={() => selectServer(null)}
        >
          ⌂
        </button>
        <div className="rail-sep" />
        {servers.map((s) => (
          <button
            key={s.id}
            className={`rail-btn ${s.id === activeServerId ? 'active' : ''}`}
            style={{ '--srv': s.color }}
            title={s.name}
            onClick={() => selectServer(s.id)}
          >
            {s.name.slice(0, 2).toUpperCase()}
          </button>
        ))}
        <button className="rail-btn add" title="Criar servidor" onClick={() => setDialog('server')}>
          +
        </button>
      </nav>

      {/* coluna de canais / amigos */}
      <aside className="sidebar">
        {server ? (
          <>
            <header className="sidebar-head">
              <span>{server.name}</span>
              <button className="icon-btn" title="Convidar / gerenciar" onClick={() => setDialog('invite')}>
                ⚙
              </button>
            </header>
            <div className="channel-list">
              <div className="channel-group">
                <span>canais de texto</span>
                <button className="icon-btn sm" onClick={() => setDialog('channel')} title="Novo canal">
                  +
                </button>
              </div>
              {server.channels.filter((c) => c.type === 'text').map((c) => (
                <button
                  key={c.id}
                  className={`channel ${c.id === activeChannelId ? 'active' : ''}`}
                  onClick={() => selectChannel(c.id)}
                >
                  <span className="hash">#</span> {c.name}
                </button>
              ))}

              <div className="channel-group">
                <span>canais de voz</span>
              </div>
              {server.channels.filter((c) => c.type === 'voice').map((c) => (
                <div key={c.id} className="voice-channel">
                  <button
                    className={`channel ${c.id === activeChannelId ? 'active' : ''}`}
                    onClick={() => {
                      selectChannel(c.id)
                      if (voice.channelId !== c.id) voice.connect(c.id)
                    }}
                  >
                    <span className="hash">🔊</span> {c.name}
                  </button>
                  {voice.channelId === c.id && (
                    <VoiceRoster />
                  )}
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            <header className="sidebar-head">
              <span>amigos</span>
            </header>
            <div className="sidebar-note">seus amigos e servidores aparecem aqui</div>
          </>
        )}

        <VoiceDock channelInfo={voiceChannelInfo} />

        <div className="userbar">
          <span className="avatar sm" style={{ background: user.color }}>
            {user.displayName.slice(0, 1).toUpperCase()}
          </span>
          <div className="userbar-name">
            <strong>{user.displayName}</strong>
            <small>@{user.username}</small>
          </div>
          <button className="icon-btn" title="Sair" onClick={logout}>
            ⎋
          </button>
        </div>
      </aside>

      {/* conteudo principal */}
      <main className="content">
        {!server && <Home />}
        {server && channel?.type === 'text' && <Chat server={server} channel={channel} />}
        {server && channel?.type === 'voice' && (
          <VoiceStage server={server} channel={channel} />
        )}
      </main>

      {dialog === 'server' && <CreateServerDialog onClose={() => setDialog(null)} />}
      {dialog === 'invite' && server && (
        <InviteDialog server={server} onClose={() => setDialog(null)} />
      )}
      {dialog === 'channel' && server && (
        <AddChannelDialog server={server} onClose={() => setDialog(null)} />
      )}
    </div>
  )
}

function VoiceRoster() {
  const voice = useVoice()
  const me = useStore((s) => s.user)
  const others = Object.entries(voice.participants)
  return (
    <div className="roster">
      <RosterItem name={`${me.displayName} (voce)`} speaking={voice.selfSpeaking} muted={voice.muted} sharing={voice.sharing} color={me.color} />
      {others.map(([sid, p]) => (
        <RosterItem
          key={sid}
          name={p.user?.displayName || '…'}
          speaking={p.speaking}
          muted={p.state?.muted}
          sharing={p.state?.sharing}
        />
      ))}
    </div>
  )
}

function RosterItem({ name, speaking, muted, sharing, color = '#888' }) {
  return (
    <div className={`roster-item ${speaking ? 'speaking' : ''}`}>
      <span className="dot" style={{ background: color }} />
      <span className="roster-name">{name}</span>
      {sharing && <span title="compartilhando tela">🖥</span>}
      {muted && <span title="mudo">🔇</span>}
    </div>
  )
}

function VoiceDock({ channelInfo }) {
  const voice = useVoice()
  if (!voice.channelId) return null
  return (
    <div className="voice-dock">
      <div className="voice-dock-top">
        <span className={`pulse ${voice.connecting ? 'warn' : 'ok'}`} />
        <div>
          <strong>{voice.connecting ? 'conectando…' : 'voz conectada'}</strong>
          <small>{channelInfo ? `${channelInfo.server.name} / ${channelInfo.channel.name}` : ''}</small>
        </div>
        <button className="icon-btn danger" title="Desconectar" onClick={() => voice.disconnect()}>
          ⏻
        </button>
      </div>
      {voice.error && <div className="voice-dock-error">{voice.error}</div>}
      <div className="voice-dock-controls">
        <button className={`ctrl ${voice.muted ? 'on' : ''}`} onClick={() => voice.toggleMute()} title="Microfone">
          {voice.muted ? '🔇' : '🎙'}
        </button>
        <button className={`ctrl ${voice.deafened ? 'on' : ''}`} onClick={() => voice.toggleDeafen()} title="Silenciar tudo">
          {voice.deafened ? '🔈' : '🎧'}
        </button>
        <button
          className={`ctrl ${voice.sharing ? 'on' : ''}`}
          onClick={() => (voice.sharing ? voice.stopShare() : voice.startShare())}
          title="Compartilhar tela"
        >
          🖥
        </button>
      </div>
    </div>
  )
}
