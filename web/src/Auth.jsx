import { useEffect, useState } from 'react'
import { useStore } from './store.js'
import { api } from './api.js'

export default function Auth() {
  const { login, register } = useStore()
  const params = new URLSearchParams(window.location.search)
  const inviteCode = params.get('invite') || ''

  const [mode, setMode] = useState(inviteCode ? 'register' : 'login')
  const [inviteInfo, setInviteInfo] = useState(null)
  const [form, setForm] = useState({ username: '', password: '', displayName: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (inviteCode) {
      api(`/auth/invite/${inviteCode}`)
        .then(({ invite }) => setInviteInfo(invite))
        .catch(() => setInviteInfo({ valid: false }))
    }
  }, [])

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      if (mode === 'login') {
        await login(form.username, form.password)
      } else {
        await register({ ...form, invite: inviteCode })
      }
      window.history.replaceState({}, '', window.location.pathname)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  return (
    <div className="auth">
      <div className="auth-card">
        <div className="logo-mark big">elo</div>
        <p className="auth-sub">voz e tela com a sua turma</p>

        {mode === 'register' && inviteCode && (
          <div className={`invite-banner ${inviteInfo?.valid === false ? 'bad' : ''}`}>
            {inviteInfo == null
              ? 'conferindo convite…'
              : inviteInfo.valid
                ? `convite de ${inviteInfo.invitedBy || 'alguem'} — bem-vindo!`
                : 'esse convite expirou ou nao existe'}
          </div>
        )}

        <form onSubmit={submit}>
          <label>
            usuario
            <input value={form.username} onChange={set('username')} autoComplete="username" required />
          </label>
          {mode === 'register' && (
            <label>
              nome de exibicao
              <input value={form.displayName} onChange={set('displayName')} placeholder="como seus amigos te veem" />
            </label>
          )}
          <label>
            senha
            <input
              type="password"
              value={form.password}
              onChange={set('password')}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              required
            />
          </label>

          {error && <div className="form-error">{error}</div>}

          <button className="btn primary full" disabled={busy}>
            {busy ? '…' : mode === 'login' ? 'entrar' : 'criar conta'}
          </button>
        </form>

        <div className="auth-switch">
          {mode === 'login' ? (
            <>
              tem um convite?{' '}
              <button className="link" onClick={() => setMode('register')}>
                criar conta
              </button>
            </>
          ) : (
            <>
              ja tem conta?{' '}
              <button className="link" onClick={() => setMode('login')}>
                entrar
              </button>
            </>
          )}
        </div>

        {mode === 'register' && !inviteCode && (
          <p className="auth-hint">
            sem convite so e possivel criar a primeira conta (que vira admin). As demais precisam de um link
            de convite.
          </p>
        )}
      </div>
    </div>
  )
}
