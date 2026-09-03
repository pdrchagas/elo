import { useEffect, useRef, useState } from 'react'
import { useVoice } from './voice.js'
import { useStore } from './store.js'
import Avatar from './Avatar.jsx'
import { fileToAvatar } from './media.js'

export default function Settings({ onClose, onLogout }) {
  const voice = useVoice()
  const { user, setAvatar } = useStore()
  const [tab, setTab] = useState('voz')
  const [avatarBusy, setAvatarBusy] = useState(false)
  const [avatarErr, setAvatarErr] = useState('')
  const avatarInput = useRef(null)

  async function changeAvatar(file) {
    if (!file) return
    setAvatarErr('')
    setAvatarBusy(true)
    try {
      await setAvatar(await fileToAvatar(file))
    } catch (e) {
      setAvatarErr(e.message || 'nao deu pra usar essa foto')
    } finally {
      setAvatarBusy(false)
    }
  }
  const [mics, setMics] = useState([])
  const [spks, setSpks] = useState([])
  const [needPerm, setNeedPerm] = useState(false)

  const spkSupported =
    typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype

  async function loadDevices() {
    try {
      const list = await navigator.mediaDevices.enumerateDevices()
      const ins = list.filter((d) => d.kind === 'audioinput')
      const outs = list.filter((d) => d.kind === 'audiooutput')
      setMics(ins)
      setSpks(outs)
      setNeedPerm(ins.length > 0 && !ins[0].label)
    } catch {
      setMics([])
      setSpks([])
    }
  }

  useEffect(() => {
    loadDevices()
    const md = navigator.mediaDevices
    md?.addEventListener?.('devicechange', loadDevices)
    return () => md?.removeEventListener?.('devicechange', loadDevices)
  }, [])

  async function askPermission() {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true })
      s.getTracks().forEach((t) => t.stop())
      loadDevices()
    } catch {
      /* negado */
    }
  }

  return (
    <div className="settings">
      <nav className="settings-nav">
        <div className="settings-nav-title">configuracoes</div>
        <button className={tab === 'voz' ? 'active' : ''} onClick={() => setTab('voz')}>
          🎙 voz e video
        </button>
        <button className={tab === 'conta' ? 'active' : ''} onClick={() => setTab('conta')}>
          👤 conta
        </button>
        <div className="settings-nav-spacer" />
        <button className="settings-logout" onClick={onLogout}>
          sair da conta
        </button>
      </nav>

      <div className="settings-body">
        <button className="settings-close" onClick={onClose} title="fechar">
          ✕
        </button>

        {tab === 'voz' && (
          <div className="settings-section">
            <h2>voz e video</h2>

            {needPerm && (
              <button className="btn" onClick={askPermission}>
                permitir microfone para ver os nomes dos aparelhos
              </button>
            )}

            <div className="settings-grid">
              <label>
                microfone
                <select
                  value={voice.micDeviceId}
                  onChange={(e) => voice.setMicDevice(e.target.value)}
                >
                  <option value="">padrao do sistema</option>
                  {mics.map((d, i) => (
                    <option key={d.deviceId || i} value={d.deviceId}>
                      {d.label || `microfone ${i + 1}`}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                fone / alto-falante
                <select
                  value={voice.spkDeviceId}
                  onChange={(e) => voice.setSpkDevice(e.target.value)}
                  disabled={!spkSupported}
                >
                  <option value="">padrao do sistema</option>
                  {spks.map((d, i) => (
                    <option key={d.deviceId || i} value={d.deviceId}>
                      {d.label || `saida ${i + 1}`}
                    </option>
                  ))}
                </select>
                {!spkSupported && (
                  <small>seu navegador nao deixa trocar a saida de audio por aqui</small>
                )}
              </label>
            </div>

            <MicTest deviceId={voice.micDeviceId} />

            <p className="hint">
              a escolha vale pra proxima vez que voce entrar numa call e fica salva neste navegador.
              trocar durante a call tambem funciona.
            </p>
          </div>
        )}

        {tab === 'conta' && (
          <div className="settings-section">
            <h2>conta</h2>

            <div className="settings-account">
              <Avatar user={user} size={72} />
              <div>
                <strong>{user.displayName}</strong>
                <small>@{user.username}</small>
                {user.isAdmin && <small> · admin</small>}
              </div>
            </div>

            <h3>foto de perfil</h3>
            <div className="avatar-edit">
              <Avatar user={user} size={80} />
              <div className="avatar-edit-btns">
                <input
                  ref={avatarInput}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => {
                    changeAvatar(e.target.files?.[0])
                    e.target.value = ''
                  }}
                />
                <button className="btn" disabled={avatarBusy} onClick={() => avatarInput.current?.click()}>
                  {avatarBusy ? 'enviando…' : 'escolher foto'}
                </button>
                {user.avatar && (
                  <button className="btn ghost" disabled={avatarBusy} onClick={() => setAvatar(null)}>
                    remover
                  </button>
                )}
              </div>
            </div>
            {avatarErr && <p className="form-error">{avatarErr}</p>}
            <p className="hint">a foto é recortada em quadrado e reduzida automaticamente.</p>

            <h3 style={{ marginTop: 24 }}>sessão</h3>
            <button className="btn danger" onClick={onLogout}>
              sair da conta
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function MicTest({ deviceId }) {
  const [on, setOn] = useState(false)
  const [level, setLevel] = useState(0)
  const raf = useRef(0)

  useEffect(() => {
    if (!on) {
      setLevel(0)
      return
    }
    let stopped = false
    let stream
    let ctx
    ;(async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: deviceId ? { deviceId: { exact: deviceId } } : true,
        })
        const Ctx = window.AudioContext || window.webkitAudioContext
        ctx = new Ctx()
        const src = ctx.createMediaStreamSource(stream)
        const an = ctx.createAnalyser()
        an.fftSize = 256
        src.connect(an)
        const data = new Uint8Array(an.frequencyBinCount)
        const tick = () => {
          if (stopped) return
          an.getByteFrequencyData(data)
          let sum = 0
          for (const v of data) sum += v
          setLevel(Math.min(100, (sum / data.length) * 2.2))
          raf.current = requestAnimationFrame(tick)
        }
        tick()
      } catch {
        setOn(false)
      }
    })()
    return () => {
      stopped = true
      cancelAnimationFrame(raf.current)
      stream?.getTracks().forEach((t) => t.stop())
      ctx?.close?.().catch(() => {})
    }
  }, [on, deviceId])

  return (
    <div className="mic-test">
      <button className="btn sm" onClick={() => setOn((v) => !v)}>
        {on ? 'parar teste' : 'testar microfone'}
      </button>
      <div className="mic-bar">
        <div style={{ width: `${level}%` }} />
      </div>
    </div>
  )
}
