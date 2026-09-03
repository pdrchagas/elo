import { useEffect, useRef, useState } from 'react'
import { useVoice } from './voice.js'
import { useStore } from './store.js'
import Avatar from './Avatar.jsx'
import AdminUsers from './AdminUsers.jsx'
import { fileToAvatar } from './media.js'

export default function Settings({ onClose, onLogout, initialTab = 'perfil' }) {
  const voice = useVoice()
  const { user, setAvatar, setDisplayName, changePassword, logoutEverywhere, askNotifications } = useStore()
  const [notifPerm, setNotifPerm] = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'unsupported',
  )
  const [tab, setTab] = useState(initialTab)
  const [pw, setPw] = useState({ current: '', next: '' })
  const [pwMsg, setPwMsg] = useState('')
  const [pwBusy, setPwBusy] = useState(false)

  async function savePassword() {
    setPwMsg('')
    setPwBusy(true)
    try {
      await changePassword(pw.current, pw.next)
      setPw({ current: '', next: '' })
      setPwMsg('senha trocada ✓ (as outras sessões foram deslogadas)')
    } catch (e) {
      setPwMsg(e.message)
    } finally {
      setPwBusy(false)
    }
  }
  const [avatarBusy, setAvatarBusy] = useState(false)
  const [avatarErr, setAvatarErr] = useState('')
  const avatarInput = useRef(null)
  const [nameDraft, setNameDraft] = useState(user.displayName)
  const [nameBusy, setNameBusy] = useState(false)

  async function saveName() {
    const v = nameDraft.trim()
    if (!v || v === user.displayName) return
    setNameBusy(true)
    try {
      await setDisplayName(v)
    } catch (e) {
      alert(e.message)
      setNameDraft(user.displayName)
    } finally {
      setNameBusy(false)
    }
  }

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
        <button className={tab === 'perfil' ? 'active' : ''} onClick={() => setTab('perfil')}>
          👤 meu perfil
        </button>
        <button className={tab === 'voz' ? 'active' : ''} onClick={() => setTab('voz')}>
          🎙 voz e video
        </button>
        {user.isAdmin && (
          <button className={tab === 'usuarios' ? 'active' : ''} onClick={() => setTab('usuarios')}>
            🛡 usuarios
          </button>
        )}
        <div className="settings-nav-spacer" />
        <button className="settings-logout" onClick={onLogout}>
          sair da conta
        </button>
      </nav>

      <div className="settings-body">
        <button className="settings-close" onClick={onClose} title="fechar">
          ✕
        </button>

        {tab === 'usuarios' && user.isAdmin && <AdminUsers />}

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

            <label className="mic-gain">
              <span>
                <span className="toggle-label">sensibilidade do microfone</span>
                <small>
                  aumenta o volume da sua voz pros outros. suba se reclamarem que você
                  está baixo; volte pro 1.0× se distorcer.
                </small>
              </span>
              <div className="mic-gain-row">
                <input
                  type="range"
                  min="1"
                  max="2.5"
                  step="0.1"
                  value={voice.micGain}
                  onChange={(e) => voice.setMicGain(Number(e.target.value))}
                />
                <b>{voice.micGain.toFixed(1)}×</b>
              </div>
            </label>

            <h3 style={{ marginTop: 20 }}>processamento de áudio</h3>
            <Toggle
              checked={voice.noiseSuppress}
              onChange={() => voice.toggleNoiseSuppress()}
              label="supressão de ruído (IA) — experimental"
              hint="usa RNNoise pra tirar teclado, ventilador e barulho de fundo. vem DESLIGADA porque em PC fraco pode picotar o áudio; ligue só se precisar. cada pessoa liga a sua."
            />
            <Toggle
              checked={voice.echoCancel}
              onChange={() => voice.toggleEchoCancel()}
              label="cancelamento de eco"
              hint="evita microfonia quando você usa caixa de som em vez de fone."
            />
            <Toggle
              checked={voice.sounds}
              onChange={() => voice.toggleSounds()}
              label="som quando alguém entra ou sai da call"
            />

            <h3 style={{ marginTop: 20 }}>notificações</h3>
            {notifPerm === 'granted' ? (
              <p className="hint">notificações do navegador ativadas ✓ (quando te mencionam)</p>
            ) : notifPerm === 'unsupported' ? (
              <p className="hint">seu navegador não suporta notificações</p>
            ) : (
              <>
                <button
                  className="btn"
                  onClick={async () => setNotifPerm(await askNotifications())}
                >
                  ativar notificações quando me mencionarem
                </button>
                {notifPerm === 'denied' && (
                  <p className="hint">
                    você bloqueou — libere no cadeado da barra de endereço e recarregue
                  </p>
                )}
              </>
            )}

            <p className="hint">
              a escolha vale pra proxima vez que voce entrar numa call e fica salva neste navegador.
              trocar durante a call tambem funciona.
            </p>
          </div>
        )}

        {tab === 'perfil' && (
          <div className="settings-section">
            <h2>meu perfil</h2>

            <div className="settings-account">
              <Avatar user={user} size={72} noClick />
              <div>
                <strong>{user.displayName}</strong>
                <small>@{user.username}</small>
                {user.isAdmin && <small> · admin</small>}
              </div>
            </div>

            <h3>nome de exibicao</h3>
            <div className="name-edit">
              <input
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                maxLength={32}
                placeholder="como seus amigos te veem"
              />
              <button
                className="btn primary"
                disabled={nameBusy || !nameDraft.trim() || nameDraft.trim() === user.displayName}
                onClick={saveName}
              >
                {nameBusy ? '…' : 'salvar'}
              </button>
            </div>
            <p className="hint">seu @usuario ({`@${user.username}`}) nao muda.</p>

            <h3 style={{ marginTop: 20 }}>foto de perfil</h3>
            <div className="avatar-edit">
              <Avatar user={user} size={80} noClick />
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

            <h3 style={{ marginTop: 24 }}>trocar senha</h3>
            <div className="settings-grid">
              <label>
                senha atual
                <input
                  type="password"
                  value={pw.current}
                  onChange={(e) => setPw((p) => ({ ...p, current: e.target.value }))}
                  autoComplete="current-password"
                />
              </label>
              <label>
                senha nova (mín. 8)
                <input
                  type="password"
                  value={pw.next}
                  onChange={(e) => setPw((p) => ({ ...p, next: e.target.value }))}
                  autoComplete="new-password"
                />
              </label>
            </div>
            {pwMsg && <p className="hint">{pwMsg}</p>}
            <button
              className="btn primary"
              disabled={pwBusy || !pw.current || pw.next.length < 8}
              onClick={savePassword}
            >
              {pwBusy ? '…' : 'trocar senha'}
            </button>

            <h3 style={{ marginTop: 24 }}>sessão</h3>
            <div className="avatar-edit-btns">
              <button className="btn" onClick={() => logoutEverywhere().then(() => alert('as outras sessões foram deslogadas.'))}>
                sair de todos os aparelhos
              </button>
              <button className="btn danger" onClick={onLogout}>
                sair da conta
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Toggle({ checked, onChange, label, hint }) {
  return (
    <label className="toggle-row">
      <span className={`toggle ${checked ? 'on' : ''}`} onClick={onChange}>
        <span className="toggle-knob" />
      </span>
      <span>
        <span className="toggle-label">{label}</span>
        {hint && <small>{hint}</small>}
      </span>
    </label>
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
