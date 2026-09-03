// Avatar reutilizavel: mostra a foto se tiver, senao a inicial colorida.
export default function Avatar({ user, name, color, avatar, size = 32, online, className = '' }) {
  const label = (user?.displayName || name || '?').slice(0, 1).toUpperCase()
  const pic = user?.avatar ?? avatar
  const bg = user?.color || color || '#5865F2'
  const style = { width: size, height: size, fontSize: Math.round(size * 0.42) }

  return (
    <span
      className={`av ${online ? 'online' : ''} ${className}`}
      style={pic ? style : { ...style, background: bg }}
    >
      {pic ? <img src={pic} alt="" /> : label}
    </span>
  )
}
