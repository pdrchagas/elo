import { useEffect, useRef, useState } from 'react'

// Popover pequeno pra escolher microfone (audioinput) ou saida de audio (audiooutput).
export default function DeviceMenu({ kind, value, onSelect, onClose }) {
  const [devices, setDevices] = useState([])
  const ref = useRef(null)

  useEffect(() => {
    navigator.mediaDevices
      ?.enumerateDevices()
      .then((list) => setDevices(list.filter((d) => d.kind === kind)))
      .catch(() => setDevices([]))
  }, [kind])

  useEffect(() => {
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose()
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const title = kind === 'audioinput' ? 'microfone' : 'saida de audio'
  const supported = kind === 'audioinput' || 'setSinkId' in HTMLMediaElement.prototype

  return (
    <div className="device-menu" ref={ref}>
      <div className="device-menu-title">{title}</div>
      {!supported && <div className="device-menu-note">seu navegador nao deixa trocar a saida</div>}
      <button
        className={`device-opt ${!value ? 'on' : ''}`}
        onClick={() => {
          onSelect('')
          onClose()
        }}
      >
        padrao do sistema
      </button>
      {devices.map((d, i) => (
        <button
          key={d.deviceId || i}
          className={`device-opt ${value === d.deviceId ? 'on' : ''}`}
          onClick={() => {
            onSelect(d.deviceId)
            onClose()
          }}
        >
          {d.label || `${title} ${i + 1}`}
        </button>
      ))}
    </div>
  )
}
