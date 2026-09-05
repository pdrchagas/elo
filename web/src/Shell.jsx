import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from './store.js'
import { useVoice } from './voice.js'
import { api } from './api.js'
import Home from './Home.jsx'
import Chat from './Chat.jsx'
import VoiceStage from './VoiceStage.jsx'
import MembersPanel from './MembersPanel.jsx'
import Settings from './Settings.jsx'
import Avatar from './Avatar.jsx'
import ProfileCard from './ProfileCard.jsx'
import { CreateServerDialog, InviteDialog, AddChannelDialog, ConfirmDialog } from './Dialogs.jsx'
import {
  MicIcon, MicOffIcon, HeadphonesIcon, HeadphonesOffIcon,
  ScreenIcon, CameraIcon, CameraOffIcon, HangupIcon, GearIcon, SignalBars,
  MenuIcon, PeopleIcon, PlusIcon, CloseIcon, HashIcon, WaveIcon, ChevronIcon,
} from './icons.jsx'

export default function Shell() {
  const {
    user, servers, activeServerId, activeChannelId, mentions, online,
    selectServer, selectChannel, logout, refreshServers,
  } = useStore()
  const voice = useVoice()
  const [dialog, setDialog] = useState(null) // 'server' | 'invite' | 'channel' | 'logout'
  const [nav, setNav] = useState(false) // gaveta de navegacao (esquerda)
  const [members, setMembers] = useState(false) // gaveta de membros (direita)
  const [crumbMenu, setCrumbMenu] = useState(false) // troca rapida de canal

  const server = servers.find((s) => s.id === activeServerId) || null
  const channel = server?.channels.find((c) => c.id === activeChannelId) || null

  const onlineCount = useMemo(
    () => (server?.members || []).filter((m) => online[m.id] || m.online).length,
    [server, online],
  )

  function pickChannel(id) {
    selectChannel(id)
    setNav(false)
    setCrumbMenu(false)
  }
  function pickServer(id) {
    selectServer(id)
    setNav(false)
    setCrumbMenu(false)
  }
  function pickVoice(c) {
    pickChannel(c.id)
    if (voice.channelId !== c.id) voice.connect(c.id)
  }

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      setCrumbMenu(false)
      setNav(false)
      setMembers(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

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

  const textChannels = server?.channels.filter((c) => c.type === 'text') || []
  const voiceChannels = server?.channels.filter((c) => c.type === 'voice') || []

  return (
    <div className="app">
      <header className="appbar">
        <button className="ab-icon" onClick={() => setNav(true)} aria-label="navegar" title="servidores e canais">
          <MenuIcon size={19} />
        </button>

        <div className="ab-crumb">
          <button
            className="ab-crumb-btn"
            onClick={() => (server ? setCrumbMenu((v) => !v) : setNav(true))}
          >
            <span className="ab-server">{server ? server.name : 'amigos'}</span>
            {channel && (
              <>
                <span className="ab-slash">/</span>
                {channel.type === 'voice' ? <WaveIcon size={13} /> : <HashIcon size={13} />}
                <span className="ab-chan">{channel.name}</span>
              </>
            )}
            {server && <ChevronIcon />}
          </button>

          {crumbMenu && server && (
            <>
              <div className="ab-menu-scrim" onClick={() => setCrumbMenu(false)} />
              <div className="ab-menu">
                {textChannels.length > 0 && <div className="ab-menu-sec">conversas</div>}
                {textChannels.map((c) => (
                  <button
                    key={c.id}
                    className={c.id === activeChannelId ? 'on' : ''}
                    onClick={() => pickChannel(c.id)}
                  >
                    <HashIcon size={13} /> {c.name}
                    {mentions[c.id] > 0 && <span className="badge">{mentions[c.id] > 9 ? '9+' : mentions[c.id]}</span>}
                  </button>
                ))}
                {voiceChannels.length > 0 && <div className="ab-menu-sec">salas de voz</div>}
                {voiceChannels.map((c) => (
                  <button
                    key={c.id}
                    className={c.id === activeChannelId ? 'on' : ''}
                    onClick={() => pickVoice(c)}
                  >
                    <WaveIcon size={13} /> {c.name}
                  </button>
                ))}
                <div className="ab-menu-sep" />
                <button onClick={() => { setCrumbMenu(false); setNav(true) }}>
                  <MenuIcon size={13} /> todos os servidores…
                </button>
              </div>
            </>
          )}
        </div>

        <div className="ab-spacer" />

        {server && (
          <button
            className={`ab-icon wide ${members ? 'on' : ''}`}
            onClick={() => setMembers((v) => !v)}
            title="membros"
          >
            <PeopleIcon size={19} />
            <b>{onlineCount}</b>
          </button>
        )}
      </header>

      <main className="stage">
        {!server && <Home />}
        {server && channel?.type === 'text' && <Chat server={server} channel={channel} />}
        {server && channel?.type === 'voice' && <VoiceStage server={server} channel={channel} />}
        {server && !channel && (
          <div className="stage-empty">
            <p>escolha uma conversa</p>
            <button className="btn" onClick={() => setNav(true)}>abrir canais</button>
          </div>
        )}
      </main>

      <div className="dockwrap">
        <VoicePanel info={voiceChannelInfo} />
        <Dock user={user} onOpenSettings={() => setDialog('settings')} />
      </div>

      {/* gaveta de navegacao */}
      <Drawer side="left" open={nav} onClose={() => setNav(false)}>
        <Navigator
          servers={servers}
          server={server}
          activeServerId={activeServerId}
          activeChannelId={activeChannelId}
          mentions={mentions}
          isAdmin={user.isAdmin}
          onPickServer={pickServer}
          onPickChannel={pickChannel}
          onPickVoice={pickVoice}
          onCreateServer={() => { setNav(false); setDialog('server') }}
          onAddChannel={() => { setNav(false); setDialog('channel') }}
          onManage={() => { setNav(false); setDialog('invite') }}
        />
      </Drawer>

      {/* gaveta de membros */}
      <Drawer side="right" open={members && !!server} onClose={() => setMembers(false)}>
        {server && <MembersPanel server={server} onClose={() => setMembers(false)} />}
      </Drawer>

      <CallAudio />

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
      <ProfileCard onEditProfile={() => setDialog('settings')} />
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

function Drawer({ side, open, onClose, children }) {
  return (
    <>
      <div className={`drawer-scrim ${open ? 'show' : ''}`} onClick={onClose} />
      <div className={`drawer drawer-${side} ${open ? 'open' : ''}`} aria-hidden={!open}>
        <button className="drawer-x" onClick={onClose} aria-label="fechar">
          <CloseIcon size={17} />
        </button>
        {children}
      </div>
    </>
  )
}

function Navigator({
  servers, server, activeServerId, activeChannelId, mentions, isAdmin,
  onPickServer, onPickChannel, onPickVoice, onCreateServer, onAddChannel, onManage,
}) {
  const textChannels = server?.channels.filter((c) => c.type === 'text') || []
  const voiceChannels = server?.channels.filter((c) => c.type === 'voice') || []

  return (
    <div className="nav">
      <div className="nav-title">servidores</div>
      <div className="nav-servers">
        <button
          className={`nav-srv ${!activeServerId ? 'active' : ''}`}
          onClick={() => onPickServer(null)}
        >
          <span className="nav-srv-home">⌂</span>
          <span className="nav-srv-name">amigos</span>
        </button>
        {servers.map((s) => {
          const cnt = s.channels.reduce((n, c) => n + (mentions[c.id] || 0), 0)
          return (
            <button
              key={s.id}
              className={`nav-srv ${s.id === activeServerId ? 'active' : ''}`}
              onClick={() => onPickServer(s.id)}
            >
              <Avatar name={s.name} color={s.color} size={26} noClick />
              <span className="nav-srv-name">{s.name}</span>
              {cnt > 0 && <span className="badge">{cnt > 9 ? '9+' : cnt}</span>}
            </button>
          )
        })}
        {isAdmin && (
          <button className="nav-srv add" onClick={onCreateServer}>
            <span className="nav-srv-home"><PlusIcon size={15} /></span>
            <span className="nav-srv-name">criar servidor</span>
          </button>
        )}
      </div>

      {server && (
        <div className="nav-channels">
          <div className="nav-sec">
            <span>conversas</span>
            <button onClick={onAddChannel} title="novo canal"><PlusIcon size={13} /></button>
          </div>
          {textChannels.map((c) => (
            <button
              key={c.id}
              className={`channel ${c.id === activeChannelId ? 'active' : ''}`}
              onClick={() => onPickChannel(c.id)}
            >
              <HashIcon size={14} className="hash" /> {c.name}
              {mentions[c.id] > 0 && <span className="badge">{mentions[c.id] > 9 ? '9+' : mentions[c.id]}</span>}
            </button>
          ))}

          <div className="nav-sec"><span>salas de voz</span></div>
          {voiceChannels.map((c) => (
            <div key={c.id} className="voice-channel">
              <button
                className={`channel ${c.id === activeChannelId ? 'active' : ''}`}
                onClick={() => onPickVoice(c)}
              >
                <WaveIcon size={14} className="hash" /> {c.name}
              </button>
              <VoiceRoster channelId={c.id} />
            </div>
          ))}

          <button className="nav-manage" onClick={onManage}>
            <GearIcon size={14} /> convidar / gerenciar
          </button>
        </div>
      )}
    </div>
  )
}

// Toca o audio de cada pessoa da call. Fica montado enquanto voce esta numa call,
// mesmo olhando um canal de texto (por isso mora aqui no Shell, nao no VoiceStage).
function CallAudio() {
  const channelId = useVoice((s) => s.channelId)
  const participants = useVoice((s) => s.participants)
  const deafened = useVoice((s) => s.deafened)
  const spkDeviceId = useVoice((s) => s.spkDeviceId)
  const volumes = useVoice((s) => s.volumes)

  if (!channelId) return null
  return (
    <div style={{ display: 'none' }} aria-hidden>
      {Object.entries(participants).map(([sid, p]) =>
        p.micStream ? (
          <PeerAudio
            key={sid}
            stream={p.micStream}
            volume={deafened ? 0 : (p.user?.id ? (volumes[p.user.id] ?? 1) : 1)}
            sinkId={spkDeviceId}
          />
        ) : null,
      )}
    </div>
  )
}

function PeerAudio({ stream, volume, sinkId }) {
  const ref = useRef(null)
  const boostRef = useRef(null) // { ctx, gain } quando volume > 1
  const boosted = volume > 1.02

  useEffect(() => {
    const el = ref.current
    if (!el) return

    if (boosted) {
      try {
        const Ctx = window.AudioContext || window.webkitAudioContext
        const ctx = new Ctx()
        const src = ctx.createMediaStreamSource(stream)
        const gain = ctx.createGain()
        gain.gain.value = volume
        const dest = ctx.createMediaStreamDestination()
        src.connect(gain).connect(dest)
        if (ctx.state === 'suspended') ctx.resume().catch(() => {})
        el.srcObject = dest.stream
        el.volume = 1
        boostRef.current = { ctx, gain }
      } catch {
        el.srcObject = stream
        el.volume = 1
      }
    } else {
      el.srcObject = stream
      el.volume = Math.max(0, Math.min(1, volume))
    }
    el.play?.().catch(() => {})

    return () => {
      if (boostRef.current) {
        try { boostRef.current.ctx.close() } catch {}
        boostRef.current = null
      }
    }
  }, [stream, boosted])

  // muda o volume sem reconectar
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (boostRef.current) boostRef.current.gain.gain.value = volume
    else el.volume = Math.max(0, Math.min(1, volume))
  }, [volume])

  useEffect(() => {
    const el = ref.current
    if (el && sinkId && typeof el.setSinkId === 'function') el.setSinkId(sinkId).catch(() => {})
  }, [sinkId, stream])

  return <audio ref={ref} autoPlay playsInline />
}

function VoiceRoster({ channelId }) {
  const voice = useVoice()
  const me = useStore((s) => s.user)
  const roster = useStore((s) => s.voiceRosters[channelId]) || []
  const inThisCall = voice.channelId === channelId

  if (roster.length === 0 && !inThisCall) return null

  return (
    <div className="roster">
      {roster.map((m) => {
        const isMe = m.id === me.id
        // pra mim mesmo, uso o estado ao vivo (mais preciso)
        const speaking = isMe ? voice.selfSpeaking : voice.participants[m.socketId]?.speaking
        const muted = isMe && inThisCall ? voice.muted : m.state?.muted
        // so da pra mexer no volume de quem nao sou eu e quando eu estou na call
        const canVol = !isMe && inThisCall && !!m.id
        return (
          <RosterItem
            key={m.socketId || m.id}
            name={isMe ? `${m.displayName} (voce)` : m.displayName}
            avatar={m.avatar}
            color={m.color}
            speaking={speaking}
            muted={muted || m.state?.forceMuted}
            deafened={m.state?.deafened}
            sharing={m.state?.sharing}
            camera={m.state?.camera}
            volume={canVol ? (voice.volumes[m.id] ?? 1) : null}
            onVolume={canVol ? (v) => voice.setUserVolume(m.id, v) : null}
          />
        )
      })}
    </div>
  )
}

function RosterItem({ name, avatar, speaking, muted, deafened, sharing, camera, color = '#888', volume, onVolume }) {
  const [open, setOpen] = useState(false)
  const canVol = typeof volume === 'number' && onVolume
  const boosted = canVol && volume !== 1

  return (
    <div className={`roster-item-wrap ${open ? 'open' : ''}`}>
      <div
        className={`roster-item ${speaking ? 'speaking' : ''} ${canVol ? 'clickable' : ''}`}
        onClick={canVol ? () => setOpen((v) => !v) : undefined}
        title={canVol ? 'ajustar volume' : undefined}
      >
        <Avatar name={name} avatar={avatar} color={color} size={20} noClick />
        <span className="roster-name">{name}</span>
        {boosted && <span className="roster-vol-tag">{Math.round(volume * 100)}%</span>}
        {camera && <CameraIcon size={13} />}
        {sharing && <ScreenIcon size={13} />}
        {deafened && <HeadphonesOffIcon size={13} />}
        {muted && <MicOffIcon size={13} />}
      </div>

      {open && canVol && (
        <div className="roster-vol">
          <input
            type="range"
            min="0"
            max="200"
            value={Math.round(volume * 100)}
            onChange={(e) => onVolume(Number(e.target.value) / 100)}
          />
          <b>{Math.round(volume * 100)}%</b>
          {volume !== 1 && (
            <button onClick={() => onVolume(1)} title="voltar pra 100%">↺</button>
          )}
        </div>
      )}
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

function Dock({ user, onOpenSettings }) {
  const voice = useVoice()

  return (
    <div className="dock">
      <button className="dock-id" onClick={onOpenSettings} title="minha conta">
        <Avatar user={user} size={28} online />
        <span className="dock-name">
          <strong>{user.displayName}</strong>
          <small>@{user.username}</small>
        </span>
      </button>

      <div className="dock-actions">
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
        <button className="ub-btn gear" title="configuracoes" onClick={onOpenSettings}>
          <GearIcon size={18} />
        </button>
      </div>
    </div>
  )
}
