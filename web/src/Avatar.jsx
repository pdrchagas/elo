import { useProfile } from './profile.js'

// Avatar reutilizavel: mostra a foto se tiver, senao a inicial colorida.
// Clicar abre o card de perfil (quando o objeto user tem id).
export default function Avatar({
  user,
  name,
  color,
  avatar,
  size = 32,
  online,
  className = '',
  noClick = false,
}) {
  const openProfile = useProfile((s) => s.open)
  const label = (user?.displayName || name || '?').slice(0, 1).toUpperCase()
  const pic = user?.avatar ?? avatar
  const bg = user?.color || color || '#5865F2'
  const style = { width: size, height: size, fontSize: Math.round(size * 0.42) }
  const clickable = !noClick && !!user?.id

  return (
    <span
      className={`av ${online ? 'online' : ''} ${clickable ? 'av-click' : ''} ${className}`}
      style={pic ? style : { ...style, background: bg }}
      onClick={clickable ? (e) => (e.stopPropagation(), openProfile(user)) : undefined}
      role={clickable ? 'button' : undefined}
      title={clickable ? user.displayName : undefined}
    >
      {pic ? <img src={pic} alt="" /> : label}
    </span>
  )
}
