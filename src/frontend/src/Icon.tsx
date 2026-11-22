// Ikony z guidelines Busoli (16×16, kolor z tekstu) zamiast emoji. Zawsze stoją obok słowa, więc są ukryte dla czytników.
const ICONS = {
  planned: <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.8" />,
  progress: (
    <>
      <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 2a6 6 0 0 1 0 12z" fill="currentColor" />
    </>
  ),
  sign: <path d="M2 14h12M4 11l7-7 2 2-7 7H4z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />,
  done: <path d="M3 8.5l3.2 3L13 4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />,
  cancelled: (
    <>
      <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M4 12l8-8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </>
  ),
  // „Liczy system / nie do edycji” — zamiast emoji 🔒.
  lock: (
    <>
      <rect x="3" y="7.2" width="10" height="6.8" rx="1.6" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M5.4 7.2V5.2a2.6 2.6 0 0 1 5.2 0v2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </>
  ),
  calendar: (
    <>
      <rect x="2.4" y="3.4" width="11.2" height="10.4" rx="1.6" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M2.4 6.8h11.2M5.4 2v2.8M10.6 2v2.8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </>
  ),
  clock: (
    <>
      <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 4.8V8l2.2 1.6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
}

export type IconName = keyof typeof ICONS

export function Icon({ name }: { name: IconName }) {
  return <svg className="icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">{ICONS[name]}</svg>
}
