import { useEffect, useReducer, useRef } from 'react'
import { useVoice } from './voice.js'
import { useStore } from './store.js'

export default function VoiceStage({ server, channel }) {
  const voice = useVoice()
  const me = useStore((s) => s.user)
  const connectedHere = voice.channelId === channel.id

  const participants = Object.entries(voice.participants)
  const screenSharers = participants.filter(([, p]) => hasVideo(p.stream))
  const selfSharing = voice.sharing && voice.screenStream

  return (
    <div className="voice-stage">
      <header className="content-head">
        <h2><span className="hash">🔊</span> {channel.name}</h2>
        <span className="hint">{server.name}</span>
      </header>

      {!connectedHere ? (
        <div className="voice-join">
          <p>{voice.channelId ? 'voce esta em outra call.' : 'canal de voz'}</p>
          <button className="btn primary lg" onClick={() => voice.connect(channel.id)}>
            entrar na call
          </button>
          {voice.error && <p className="form-error">{voice.error}</p>}
        </div>
      ) : (
        <>
          {(screenSharers.length > 0 || selfSharing) && (
            <div className="screen-grid">
              {selfSharing && (
                <ScreenTile label={`${me.displayName} (voce)`} stream={voice.screenStream} muted />
              )}
              {screenSharers.map(([sid, p]) => (
                <ScreenTile key={sid} label={p.user?.displayName || '—'} stream={p.stream} />
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
            />
            {participants.map(([sid, p]) => (
              <PersonCard
                key={sid}
                name={p.user?.displayName || 'conectando…'}
                speaking={p.speaking}
                muted={p.state?.muted}
                deafened={p.state?.deafened}
                sharing={p.state?.sharing}
                stream={p.stream}
                deafenedByMe={voice.deafened}
              />
            ))}
          </div>

          <div className="stage-controls">
            <button className={`ctrl lg ${voice.muted ? 'on' : ''}`} onClick={() => voice.toggleMute()}>
              {voice.muted ? '🔇 mudo' : '🎙 microfone'}
            </button>
            <button className={`ctrl lg ${voice.deafened ? 'on' : ''}`} onClick={() => voice.toggleDeafen()}>
              {voice.deafened ? '🔈 surdo' : '🎧 ouvindo'}
            </button>
            <button
              className={`ctrl lg ${voice.sharing ? 'on' : ''}`}
              onClick={() => (voice.sharing ? voice.stopShare() : voice.startShare())}
            >
              🖥 {voice.sharing ? 'parar tela' : 'compartilhar tela'}
            </button>
            <button className="ctrl lg danger" onClick={() => voice.disconnect()}>
              ⏻ sair
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function hasVideo(stream) {
  return !!stream && stream.getVideoTracks().length > 0
}

function ScreenTile({ label, stream, muted }) {
  const ref = useRef(null)
  useEffect(() => {
    if (ref.current && stream) ref.current.srcObject = stream
  }, [stream])
  return (
    <div className="screen-tile">
      <video ref={ref} autoPlay playsInline muted={muted} />
      <span className="screen-label">{label}</span>
    </div>
  )
}

function PersonCard({ name, color = '#5865F2', speaking, muted, deafened, sharing, stream, deafenedByMe }) {
  const audioRef = useRef(null)
  const [, force] = useReducer((x) => x + 1, 0)

  useEffect(() => {
    if (!stream) return
    if (audioRef.current) audioRef.current.srcObject = stream
    const onChange = () => force()
    stream.addEventListener('addtrack', onChange)
    stream.addEventListener('removetrack', onChange)
    return () => {
      stream.removeEventListener('addtrack', onChange)
      stream.removeEventListener('removetrack', onChange)
    }
  }, [stream])

  return (
    <div className={`person-card ${speaking ? 'speaking' : ''}`}>
      <div className="person-avatar" style={{ background: color }}>
        {name.slice(0, 1).toUpperCase()}
      </div>
      <span className="person-name">{name}</span>
      <div className="person-badges">
        {sharing && <span title="compartilhando tela">🖥</span>}
        {deafened && <span title="surdo">🎧</span>}
        {muted && <span title="mudo">🔇</span>}
      </div>
      {stream && (
        <audio ref={audioRef} autoPlay playsInline muted={!!deafenedByMe} />
      )}
    </div>
  )
}
