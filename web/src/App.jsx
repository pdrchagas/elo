import { useEffect } from 'react'
import { useStore } from './store.js'
import Auth from './Auth.jsx'
import Shell from './Shell.jsx'

export default function App() {
  const { user, booting, boot } = useStore()

  useEffect(() => {
    boot()
  }, [])

  if (booting) {
    return (
      <div className="splash">
        <div className="logo-mark">elo</div>
        <p>carregando…</p>
      </div>
    )
  }

  return user ? <Shell /> : <Auth />
}
