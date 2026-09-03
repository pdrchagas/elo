import { useEffect, useRef, useState } from 'react'
import { useVoice } from './voice.js'
import { useStore } from './store.js'
import {
  MicIcon, MicOffIcon, HeadphonesIcon, HeadphonesOffIcon,
  ScreenIcon, CameraIcon, CameraOffIcon, HangupIcon,
} from './icons.jsx'

function applySink(el, sinkId) {
  if (el && sinkId && typeof el.setSinkId === 'function') {
    el.setSinkId(sinkId).catch(() => {})
  }
}

export default function VoiceStage({ server, channel }) {
  const voice = useVoice()
  const me = useStore((s) => s.user)
  const connectedHere = voice.channelId === channel.id
  const [expanded, setExpanded] = useState(null)

  // permissoes de moderacao no servidor deste canal de voz
  const canMute = !!server.myPerms?.mute
  const canMove = !!server.myPerms?.move
  const voiceChannels = server.channels.filter((c) => c.type === 'voice')

  const participants = Object.entries(voice.participants)
  const allScreens = []
  if (voice.sharing && voice.screenStream) {
    allScreens.push({ id: 'self', label: `${me.displayName} (voce)`, stream: voice.screenStream, muted: true, own: true })
  }
  for (const [sid, p] of participants) {
    if (p.screenStream) allScreens.push({ id: sid, label: p.user?.displayName || '—', stream: p.screenStream })
  }
  const screens = allScreens.filter((s) => s.own || !voice.hiddenScreens.includes(s.id))
  const hiddenScreens = allScreens.filter((s) => !s.own && voice.hiddenScreens.includes(s.id))

  return (
    <div className="voice-stage">
      <header className="content-head">
        <h2><span className="hash">🔊</span> {channel.name}</h2>
        <span className="hint">{server.name}</span>
      </header>

      {!connectedHere ? (
        <div className="voice-join">
          <div className="voice-join-icon">🎧</div>
          <p>{voice.channelId ? 'voce ja esta em outra call' : `canal de voz "${channel.name}"`}</p>
          <button className="btn primary lg" onClick={() => voice.connect(channel.id)}>
            entrar na call
          </button>
          {voice.error && <p className="form-error">{voice.error}</p>}
        </div>
      ) : (
        <>
          {voice.notice && <div className="voice-notice">{voice.notice}</div>}
          <div className="voice-stage-main">
            {screens.length > 0 && (
              <div className={`screen-grid ${screens.length === 1 ? 'single' : ''}`}>
                {screens.map((s) => (
                  <ScreenTile
                    key={s.id}
                    label={s.label}
                    stream={s.stream}
                    muted={s.muted}
                    sinkId={voice.spkDeviceId}
                    onExpand={() => setExpanded(s)}
                    onHide={s.own ? null : () => voice.hideScreen(s.id)}
                  />
                ))}
              </div>
            )}

            {hiddenScreens.length > 0 && (
              <div className="hidden-screens">
                {hiddenScreens.map((s) => (
                  <button key={s.id} className="hidden-screen" onClick={() => voice.showScreen(s.id)}>
                    <ScreenIcon size={16} /> {s.label} está compartilhando · <b>assistir</b>
                  </button>
                ))}
              </div>
            )}

            <div className="people-grid">
              <PersonCard
                name={`${me.displayName} (voce)`}
                color={me.color}
                avatar={me.avatar}
                speaking={voice.selfSpeaking}
                muted={voice.muted}
                deafened={voice.deafened}
                sharing={voice.sharing}
                cameraStream={voice.camera ? voice.cameraStream : null}
                cameraMuted
                mirrorCam
              />
              {participants.map(([sid, p]) => (
                <PersonCard
                  key={sid}
                  name={p.user?.displayName || 'conectando…'}
                  color={p.user?.color}
                  avatar={p.user?.avatar}
                  speaking={p.speaking}
                  muted={p.state?.muted}
                  deafened={p.state?.deafened}
                  sharing={p.state?.sharing}
                  forceMuted={p.state?.forceMuted}
                  micStream={p.micStream}
                  cameraStream={p.cameraStream}
                  sinkId={voice.spkDeviceId}
                  deafenedByMe={voice.deafened}
                  mod={
                    canMute || canMove
                      ? {
                          canMute,
                          canMove,
                          voiceChannels: voiceChannels.filter((c) => c.id !== channel.id),
                          onMute: (m) => voice.modMute(sid, m),
                          onMove: (chId) => voice.modMove(sid, chId),
                        }
                      : null
                  }
                />
              ))}
            </div>
          </div>

          <ControlBar voice={voice} />
        </>
      )}

      {expanded && (
        <ExpandedScreen
          stream={expanded.stream}
          label={expanded.label}
          muted={expanded.muted}
          sinkId={voice.spkDeviceId}
          onClose={() => setExpanded(null)}
        />
      )}
    </div>
  )
}

function toggleFullscreen(el) {
  if (!el) return
  if (document.fullscreenElement) document.exitFullscreen?.()
  else el.requestFullscreen?.().catch(() => {})
}

function ControlBar({ voice }) {
  return (
    <div className="control-bar">
      <button
        className={`round ${voice.muted ? 'danger' : ''}`}
        onClick={() => voice.toggleMute()}
        disabled={voice.forceMuted}
        title={voice.forceMuted ? 'silenciado pelo servidor' : voice.muted ? 'ativar microfone' : 'mutar'}
      >
        {voice.muted ? <MicOffIcon size={22} /> : <MicIcon size={22} />}
      </button>
      <button
        className={`round ${voice.deafened ? 'danger' : ''}`}
        onClick={() => voice.toggleDeafen()}
        title={voice.deafened ? 'voltar a ouvir' : 'nao ouvir ninguem'}
      >
        {voice.deafened ? <HeadphonesOffIcon size={22} /> : <HeadphonesIcon size={22} />}
      </button>
      <button
        className={`round ${voice.camera ? 'active' : ''}`}
        onClick={() => (voice.camera ? voice.stopCamera() : voice.startCamera())}
        title={voice.camera ? 'desligar camera' : 'ligar camera'}
      >
        {voice.camera ? <CameraIcon size={22} /> : <CameraOffIcon size={22} />}
      </button>
      <button
        className={`round ${voice.sharing ? 'active' : ''}`}
        onClick={() => (voice.sharing ? voice.stopShare() : voice.startShare())}
        title={voice.sharing ? 'parar de transmitir' : 'compartilhar tela'}
      >
        <ScreenIcon size={22} />
      </button>
      <button className="round leave" onClick={() => voice.disconnect()} title="sair da call">
        <HangupIcon size={22} />
      </button>
    </div>
  )
}

function ScreenTile({ label, stream, muted, sinkId, onExpand, onHide }) {
  const ref = useRef(null)
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream || null
  }, [stream])
  useEffect(() => {
    applySink(ref.current, sinkId)
  }, [sinkId, stream])
  return (
    <div className="screen-tile" onClick={onExpand} title="ampliar">
      <video ref={ref} autoPlay playsInline muted={muted} />
      <span className="screen-label"><ScreenIcon size={13} /> {label}</span>
      <div className="screen-tile-btns">
        <button
          className="screen-tbtn"
          title="tela cheia"
          onClick={(e) => {
            e.stopPropagation()
            toggleFullscreen(ref.current)
          }}
        >
          ⛶
        </button>
        {onHide && (
          <button
            className="screen-tbtn danger"
            title="parar de assistir"
            onClick={(e) => {
              e.stopPropagation()
              onHide()
            }}
          >
            ✕
          </button>
        )}
      </div>
    </div>
  )
}

function ExpandedScreen({ stream, label, muted, sinkId, onClose }) {
  const vid = useRef(null)
  const box = useRef(null)
  const [fs, setFs] = useState(false)

  useEffect(() => {
    if (vid.current) vid.current.srcObject = stream || null
  }, [stream])
  useEffect(() => {
    applySink(vid.current, sinkId)
  }, [sinkId, stream])
  useEffect(() => {
    const onChange = () => setFs(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onChange)
    const onKey = (e) => e.key === 'Escape' && !document.fullscreenElement && onClose()
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('fullscreenchange', onChange)
      window.removeEventListener('keydown', onKey)
      if (document.fullscreenElement) document.exitFullscreen?.()
    }
  }, [])

  return (
    <div className="screen-modal" ref={box} onClick={() => !fs && onClose()}>
      <video
        ref={vid}
        className="screen-modal-video"
        autoPlay
        playsInline
        muted={muted}
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={() => toggleFullscreen(box.current)}
      />
      <div className="screen-modal-bar" onClick={(e) => e.stopPropagation()}>
        <span>{label}</span>
        <button className="btn sm" onClick={() => toggleFullscreen(box.current)}>
          {fs ? '↙ sair da tela cheia' : '⛶ tela cheia'}
        </button>
        <button className="btn sm" onClick={onClose}>fechar ✕</button>
      </div>
    </div>
  )
}

function PersonCard({
  name,
  color = '#5865F2',
  avatar,
  speaking,
  muted,
  deafened,
  sharing,
  forceMuted,
  micStream,
  cameraStream,
  cameraMuted,
  mirrorCam,
  sinkId,
  deafenedByMe,
  mod,
}) {
  const audioRef = useRef(null)
  const videoRef = useRef(null)
  const [menu, setMenu] = useState(false)

  useEffect(() => {
    if (audioRef.current) audioRef.current.srcObject = micStream || null
    applySink(audioRef.current, sinkId)
  }, [micStream, sinkId])

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = cameraStream || null
  }, [cameraStream])

  return (
    <div className={`person-card ${speaking ? 'speaking' : ''}`}>
      {mod && (
        <div className="pc-mod">
          <button className="pc-mod-btn" onClick={() => setMenu((v) => !v)} title="moderar">
            ⋯
          </button>
          {menu && (
            <div className="pc-mod-menu" onMouseLeave={() => setMenu(false)}>
              {mod.canMute && (
                <button
                  onClick={() => {
                    mod.onMute(!forceMuted)
                    setMenu(false)
                  }}
                >
                  {forceMuted ? 'tirar silêncio' : 'silenciar no servidor'}
                </button>
              )}
              {mod.canMove && mod.voiceChannels.length > 0 && (
                <>
                  <div className="pc-mod-sep">mover para</div>
                  {mod.voiceChannels.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => {
                        mod.onMove(c.id)
                        setMenu(false)
                      }}
                    >
                      🔊 {c.name}
                    </button>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      )}
      {cameraStream ? (
        <video
          ref={videoRef}
          className={`person-cam ${mirrorCam ? 'mirror' : ''}`}
          autoPlay
          playsInline
          muted={cameraMuted || !!deafenedByMe}
        />
      ) : avatar ? (
        <img className="person-avatar" src={avatar} alt="" />
      ) : (
        <div className="person-avatar" style={{ background: color }}>
          {name.slice(0, 1).toUpperCase()}
        </div>
      )}
      <span className="person-name">{name}</span>
      <div className="person-badges">
        {sharing && <ScreenIcon size={15} />}
        {deafened && <span className="pb-red"><HeadphonesOffIcon size={15} /></span>}
        {forceMuted ? (
          <span className="pb-red" title="silenciado pelo servidor"><MicOffIcon size={15} /></span>
        ) : (
          muted && <span className="pb-dim"><MicOffIcon size={15} /></span>
        )}
      </div>
      {micStream && <audio ref={audioRef} autoPlay playsInline muted={!!deafenedByMe} />}
    </div>
  )
}
