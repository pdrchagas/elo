import { useEffect, useMemo, useState } from 'react'
import { useStore } from './store.js'
import { useVoice } from './voice.js'
import { api } from './api.js'
import Home from './Home.jsx'
import Chat from './Chat.jsx'
import VoiceStage from './VoiceStage.jsx'
import MembersPanel from './MembersPanel.jsx'
import Settings from './Settings.jsx'
import Avatar from './Avatar.jsx'
import { CreateServerDialog, InviteDialog, AddChannelDialog, ConfirmDialog } from './Dialogs.jsx'
import {
  MicIcon, MicOffIcon, HeadphonesIcon, HeadphonesOffIcon,
  ScreenIcon, CameraIcon, CameraOffIcon, HangupIcon, GearIcon, SignalBars,
} from './icons.jsx'

export default function Shell() {
  const {
    user, servers, activeServerId, activeChannelId,
    selectServer, selectChannel, logout, refreshServers,
  } = useStore()
  const voice = useVoice()
  const [dialog, setDialog] = useState(null) // 'server' | 'invite' | 'channel' | 'logout'
  const [showMembers, setShowMembers] = useState(true)

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
        {user.isAdmin && (
          <button className="rail-btn add" title="Criar servidor" onClick={() => setDialog('server')}>
            +
          </button>
        )}
      </nav>

      {/* coluna de canais / amigos */}
      <aside className="sidebar">
        {server ? (
          <>
            <header className="sidebar-head">
              <span>{server.name}</span>
              <button
                className={`icon-btn ${showMembers ? 'on' : ''}`}
                title="Membros"
                onClick={() => setShowMembers((v) => !v)}
              >
                👥
              </button>
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
                  {voice.channelId === c.id && <VoiceRoster />}
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

        <VoicePanel info={voiceChannelInfo} />

        <UserBar user={user} onOpenSettings={() => setDialog('settings')} />
      </aside>

      {/* conteudo principal */}
      <main className="content">
        {!server && <Home />}
        {server && channel?.type === 'text' && <Chat server={server} channel={channel} />}
        {server && channel?.type === 'voice' && <VoiceStage server={server} channel={channel} />}
      </main>

      {server && showMembers && <MembersPanel server={server} />}

      {dialog === 'server' && <CreateServerDialog onClose={() => setDialog(null)} />}
      {dialog === 'invite' && server && (
        <InviteDialog server={server} onClose={() => setDialog(null)} />
      )}
      {dialog === 'channel' && server && (
        <AddChannelDialog server={server} onClose={() => setDialog(null)} />
      )}
      {dialog === 'settings' && (
        <Settings onClose={() => setDialog(null)} onLogout={() => setDialog('logout')} />
      )}
      {dialog === 'logout' && (
        <ConfirmDialog
          title="sair da conta"
          message="tem certeza que quer sair da conta? voce vai precisar entrar de novo com usuario e senha."
          confirmLabel="sair da conta"
          danger
          onConfirm={() => {
            voice.channelId && voice.disconnect()
            logout()
          }}
          onClose={() => setDialog(null)}
        />
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
      <RosterItem
        name={`${me.displayName} (voce)`}
        speaking={voice.selfSpeaking}
        muted={voice.muted}
        sharing={voice.sharing}
        camera={voice.camera}
        color={me.color}
      />
      {others.map(([sid, p]) => (
        <RosterItem
          key={sid}
          name={p.user?.displayName || '…'}
          color={p.user?.color}
          speaking={p.speaking}
          muted={p.state?.muted}
          sharing={p.state?.sharing}
          camera={p.state?.camera}
        />
      ))}
    </div>
  )
}

function RosterItem({ name, speaking, muted, sharing, camera, color = '#888' }) {
  return (
    <div className={`roster-item ${speaking ? 'speaking' : ''}`}>
      <span className="dot" style={{ background: color }} />
      <span className="roster-name">{name}</span>
      {camera && <span title="camera ligada">📹</span>}
      {sharing && <span title="compartilhando tela">🖥</span>}
      {muted && <span title="mudo">🔇</span>}
    </div>
  )
}

function VoicePanel({ info }) {
  const voice = useVoice()
  if (!voice.channelId) return null
  return (
    <div className="voice-panel">
      <div className="vp-head">
        <SignalBars active={!voice.connecting} />
        <div className="vp-text">
          <strong>{voice.connecting ? 'conectando…' : 'voz conectada'}</strong>
          <small>{info ? `${info.server.name} / ${info.channel.name}` : ''}</small>
        </div>
        <button className="vp-hicon hangup" title="desconectar" onClick={() => voice.disconnect()}>
          <HangupIcon size={18} />
        </button>
      </div>

      {voice.error && <div className="vp-error">{voice.error}</div>}

      <div className="vp-grid">
        <button
          className={voice.camera ? 'on' : ''}
          title={voice.camera ? 'desligar camera' : 'ligar camera'}
          onClick={() => (voice.camera ? voice.stopCamera() : voice.startCamera())}
        >
          {voice.camera ? <CameraIcon /> : <CameraOffIcon />}
        </button>
        <button
          className={voice.sharing ? 'on' : ''}
          title={voice.sharing ? 'parar transmissao' : 'compartilhar tela'}
          onClick={() => (voice.sharing ? voice.stopShare() : voice.startShare())}
        >
          <ScreenIcon />
        </button>
      </div>
    </div>
  )
}

function UserBar({ user, onOpenSettings }) {
  const voice = useVoice()

  return (
    <div className="userbar">
      <Avatar user={user} size={30} online />
      <div className="userbar-name">
        <strong>{user.displayName}</strong>
        <small>@{user.username}</small>
      </div>

      <button
        className={`ub-btn ${voice.muted ? 'off' : ''}`}
        title={voice.muted ? 'ativar microfone' : 'mutar'}
        onClick={() => voice.toggleMute()}
      >
        {voice.muted ? <MicOffIcon size={18} /> : <MicIcon size={18} />}
      </button>
      <button
        className={`ub-btn ${voice.deafened ? 'off' : ''}`}
        title={voice.deafened ? 'voltar a ouvir' : 'nao ouvir ninguem'}
        onClick={() => voice.toggleDeafen()}
      >
        {voice.deafened ? <HeadphonesOffIcon size={18} /> : <HeadphonesIcon size={18} />}
      </button>
      <button className="ub-btn gear" title="configuracoes (microfone, fone, conta)" onClick={onOpenSettings}>
        <GearIcon size={18} />
      </button>
    </div>
  )
}
