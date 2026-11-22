/**
 * Busola z igłą (H13): `state="search"` = igła waha się (szukam…), `state="settle"` = raz się ustawia, `still` = bez ruchu.
 * Ruch wyłącza prefers-reduced-motion. Dekoracja — opis daje tekst obok.
 */
export function Compass({ size = 48, state = 'still', halo = false }: { size?: number; state?: 'search' | 'settle' | 'still'; halo?: boolean }) {
  return (
    <span className={`v2-compass v2-compass-${state}${halo ? ' halo' : ''}`} style={{ width: size, height: size }} aria-hidden="true">
      <svg viewBox="0 0 64 64" width={size} height={size}>
        <circle cx="32" cy="32" r="27" fill="#fff" stroke="#2B6CB0" strokeWidth="4" />
        <g className="v2-compass-needle">
          <polygon points="32,10 37,32 27,32" fill="#1F2A5A" />
          <polygon points="27,32 37,32 32,54" fill="#E7E2FA" stroke="#8E7CE0" strokeWidth="0.8" />
          <circle cx="32" cy="32" r="3.6" fill="#fff" stroke="#1F2A5A" strokeWidth="1.6" />
        </g>
      </svg>
    </span>
  )
}
