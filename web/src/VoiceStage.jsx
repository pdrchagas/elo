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

  const participants = Object.entries(voice.participants)
  const screens = []
  if (voice.sharing && voice.screenStream) {
    screens.push({ id: 'self', label: `${me.displayName} (voce)`, stream: voice.screenStream, muted: true })
  }
  for (const [sid, p] of participants) {
    if (p.screenStream) screens.push({ id: sid, label: p.user?.displayName || '—', stream: p.screenStream })
  }

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
                  />
                ))}
              </div>
            )}

            <div className="people-grid">
              <PersonCard
                name={`${me.displayName} (voce)`}
                color={me.color}
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
                  speaking={p.speaking}
                  muted={p.state?.muted}
                  deafened={p.state?.deafened}
                  sharing={p.state?.sharing}
                  micStream={p.micStream}
                  cameraStream={p.cameraStream}
                  sinkId={voice.spkDeviceId}
                  deafenedByMe={voice.deafened}
                />
              ))}
            </div>
          </div>

          <ControlBar voice={voice} />
        </>
      )}

      {expanded && (
        <div className="screen-modal" onClick={() => setExpanded(null)}>
          <ExpandedScreen stream={expanded.stream} muted={expanded.muted} sinkId={voice.spkDeviceId} />
          <div className="screen-modal-bar">
            <span>{expanded.label}</span>
            <button className="btn sm" onClick={() => setExpanded(null)}>fechar ✕</button>
          </div>
        </div>
      )}
    </div>
  )
}

function ControlBar({ voice }) {
  return (
    <div className="control-bar">
      <button
        className={`round ${voice.muted ? 'danger' : ''}`}
        onClick={() => voice.toggleMute()}
        title={voice.muted ? 'ativar microfone' : 'mutar'}
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

function ScreenTile({ label, stream, muted, sinkId, onExpand }) {
  const ref = useRef(null)
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream || null
  }, [stream])
  useEffect(() => {
    applySink(ref.current, sinkId)
  }, [sinkId, stream])
  return (
    <button className="screen-tile" onClick={onExpand} title="ampliar">
      <video ref={ref} autoPlay playsInline muted={muted} />
      <span className="screen-label"><ScreenIcon size={13} /> {label}</span>
    </button>
  )
}

function ExpandedScreen({ stream, muted, sinkId }) {
  const ref = useRef(null)
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream || null
  }, [stream])
  useEffect(() => {
    applySink(ref.current, sinkId)
  }, [sinkId, stream])
  return (
    <video
      ref={ref}
      className="screen-modal-video"
      autoPlay
      playsInline
      muted={muted}
      onClick={(e) => e.stopPropagation()}
    />
  )
}

function PersonCard({
  name,
  color = '#5865F2',
  speaking,
  muted,
  deafened,
  sharing,
  micStream,
  cameraStream,
  cameraMuted,
  mirrorCam,
  sinkId,
  deafenedByMe,
}) {
  const audioRef = useRef(null)
  const videoRef = useRef(null)

  useEffect(() => {
    if (audioRef.current) audioRef.current.srcObject = micStream || null
    applySink(audioRef.current, sinkId)
  }, [micStream, sinkId])

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = cameraStream || null
  }, [cameraStream])

  return (
    <div className={`person-card ${speaking ? 'speaking' : ''}`}>
      {cameraStream ? (
        <video
          ref={videoRef}
          className={`person-cam ${mirrorCam ? 'mirror' : ''}`}
          autoPlay
          playsInline
          muted={cameraMuted || !!deafenedByMe}
        />
      ) : (
        <div className="person-avatar" style={{ background: color }}>
          {name.slice(0, 1).toUpperCase()}
        </div>
      )}
      <span className="person-name">{name}</span>
      <div className="person-badges">
        {sharing && <span title="compartilhando tela">🖥</span>}
        {deafened && <span title="surdo">🎧</span>}
        {muted && <span title="mudo">🔇</span>}
      </div>
      {micStream && <audio ref={audioRef} autoPlay playsInline muted={!!deafenedByMe} />}
    </div>
  )
}
