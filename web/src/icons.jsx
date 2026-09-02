// Icones em SVG (24x24, herdam currentColor) — visual limpo estilo Discord.
const S = ({ children, size = 20, stroke = false, ...p }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill={stroke ? 'none' : 'currentColor'}
    stroke={stroke ? 'currentColor' : 'none'}
    strokeWidth={stroke ? 2 : 0}
    strokeLinecap="round"
    strokeLinejoin="round"
    {...p}
  >
    {children}
  </svg>
)

export const MicIcon = (p) => (
  <S {...p}>
    <path d="M12 15a3.5 3.5 0 0 0 3.5-3.5v-5a3.5 3.5 0 1 0-7 0v5A3.5 3.5 0 0 0 12 15Z" />
    <path d="M18 11.5a6 6 0 0 1-12 0" stroke="currentColor" strokeWidth="2" fill="none" />
    <path d="M12 17.5V21" stroke="currentColor" strokeWidth="2" fill="none" />
  </S>
)

export const MicOffIcon = (p) => (
  <S {...p}>
    <path d="M12 15a3.5 3.5 0 0 0 3.5-3.5v-5a3.5 3.5 0 1 0-7 0v5A3.5 3.5 0 0 0 12 15Z" opacity="0.55" />
    <path d="M18 11.5a6 6 0 0 1-12 0" stroke="currentColor" strokeWidth="2" fill="none" opacity="0.55" />
    <path d="M12 17.5V21" stroke="currentColor" strokeWidth="2" fill="none" opacity="0.55" />
    <path d="M3 3l18 18" stroke="currentColor" strokeWidth="2.2" fill="none" />
  </S>
)

export const HeadphonesIcon = (p) => (
  <S {...p}>
    <path d="M4 13a8 8 0 0 1 16 0" stroke="currentColor" strokeWidth="2" fill="none" />
    <rect x="3" y="12.5" width="4.5" height="7.5" rx="1.6" />
    <rect x="16.5" y="12.5" width="4.5" height="7.5" rx="1.6" />
  </S>
)

export const HeadphonesOffIcon = (p) => (
  <S {...p}>
    <path d="M4 13a8 8 0 0 1 16 0" stroke="currentColor" strokeWidth="2" fill="none" opacity="0.55" />
    <rect x="3" y="12.5" width="4.5" height="7.5" rx="1.6" opacity="0.55" />
    <rect x="16.5" y="12.5" width="4.5" height="7.5" rx="1.6" opacity="0.55" />
    <path d="M3 3l18 18" stroke="currentColor" strokeWidth="2.2" fill="none" />
  </S>
)

export const ScreenIcon = (p) => (
  <S {...p}>
    <rect x="2.5" y="4" width="19" height="13" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
    <path d="M12 8v5M12 8l-2.2 2.2M12 8l2.2 2.2" fill="none" stroke="currentColor" strokeWidth="2" />
    <path d="M8 20h8" stroke="currentColor" strokeWidth="2" fill="none" />
  </S>
)

export const CameraIcon = (p) => (
  <S {...p}>
    <rect x="2.5" y="6" width="13" height="12" rx="2.5" />
    <path d="M15.5 10.5 21 7.5v9l-5.5-3z" />
  </S>
)

export const CameraOffIcon = (p) => (
  <S {...p}>
    <rect x="2.5" y="6" width="13" height="12" rx="2.5" opacity="0.55" />
    <path d="M15.5 10.5 21 7.5v9l-5.5-3z" opacity="0.55" />
    <path d="M3 3l18 18" stroke="currentColor" strokeWidth="2.2" fill="none" />
  </S>
)

export const HangupIcon = (p) => (
  <S {...p}>
    <path d="M2.5 9.5C7 6 17 6 21.5 9.5c1 .8 1.3 1.7.7 2.8l-1.3 2.2c-.5.9-1.4 1-2.3.6l-2.6-1.1c-.8-.3-1.1-.9-1.1-1.7v-1.4c-2.5-.8-5.7-.8-8.2 0v1.4c0 .8-.3 1.4-1.1 1.7L3.4 15c-.9.4-1.8.3-2.3-.6L-.2 12.3c-.6-1.1-.3-2 .7-2.8z" transform="translate(1 2)" />
  </S>
)

export const GearIcon = (p) => (
  <S {...p} stroke>
    <circle cx="12" cy="12" r="3.2" />
    <path d="M19.4 13.5a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H11a1.7 1.7 0 0 0 1-1.6V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V11a1.7 1.7 0 0 0 1.6 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </S>
)

export const ChevronIcon = (p) => (
  <S size={12} {...p}>
    <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2.5" />
  </S>
)

export const PhoneOffIcon = HangupIcon

// Barrinhas de sinal animadas (verde = conectado)
export function SignalBars({ active = true }) {
  return (
    <span className={`signal-bars ${active ? 'live' : ''}`} aria-hidden>
      <i /><i /><i /><i />
    </span>
  )
}
