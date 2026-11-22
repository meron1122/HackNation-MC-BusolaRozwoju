import { useEffect, useId, useRef, useState, type ReactNode } from 'react'

export type TipAlign = 'center' | 'start' | 'end'

/**
 * Dymek dostępny z klawiatury: pokazuje się na hover i focus, chowa na Escape i po wyjściu.
 * Treść jest zawsze w DOM (role="tooltip"), a wyzwalacz wskazuje ją przez aria-describedby.
 */
function useTip() {
  const [open, setOpen] = useState(false)
  const id = useId()
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => {
    if (!open) return
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [open])
  useEffect(() => () => window.clearTimeout(timer.current), [])
  const show = () => { window.clearTimeout(timer.current); setOpen(true) }
  const hide = () => { timer.current = window.setTimeout(() => setOpen(false), 80) }
  return { open, id, show, hide }
}

function Tip({ id, open, align, children }: { id: string; open: boolean; align: TipAlign; children: ReactNode }) {
  return <span role="tooltip" id={id} className={`v2-tip v2-tip-${align}`} data-open={open || undefined}>{children}</span>
}

/**
 * ⓘ przy regule systemu lub zasadzie Busoli. `children` = treść dymku (krótko, 1–2 zdania).
 * `label` = dostępna nazwa przycisku (domyślnie „Wyjaśnienie”).
 */
export function Info({ children, label = 'Wyjaśnienie', align = 'center', className }: {
  children: ReactNode
  label?: string
  align?: TipAlign
  className?: string
}) {
  const t = useTip()
  return (
    <span className={`v2-tipwrap${className ? ` ${className}` : ''}`} onMouseEnter={t.show} onMouseLeave={t.hide}>
      <button type="button" className="v2-info" aria-label={label} aria-describedby={t.id}
        onFocus={t.show} onBlur={t.hide} onClick={t.show}>
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          <circle cx="8" cy="8" r="6.6" fill="none" stroke="currentColor" strokeWidth="1.4" />
          <path d="M8 7.2v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          <circle cx="8" cy="4.9" r="0.95" fill="currentColor" />
        </svg>
      </button>
      <Tip id={t.id} open={t.open} align={align}>{children}</Tip>
    </span>
  )
}

/** Zdarzenie: „zapytaj asystenta o to źródło” (obsługuje AssistantWidget / panel asystenta). */
export const ASK_ASSISTANT_EVENT = 'busola-ask-assistant'
export const askAssistant = (question: string) =>
  window.dispatchEvent(new CustomEvent<string>(ASK_ASSISTANT_EVENT, { detail: question }))

/**
 * Źródło ↗ — tylko tam, gdzie przepis to reguluje. `refText` to podstawa („Rozp. 2016 · § 11 ust. 1 pkt 1”),
 * pokazywana w dymku. Kliknięcie: `href` (nowa karta), `onOpen` albo domyślnie pytanie do asystenta o ten przepis.
 * `children` = opcjonalny tekst obok strzałki (np. w panelu asystenta); bez niego sama ikona.
 */
export function Source({ refText, href, onOpen, children, align = 'center' }: {
  refText: string
  href?: string
  onOpen?: () => void
  children?: ReactNode
  align?: TipAlign
}) {
  const t = useTip()
  const icon = <span className="v2-source-arrow" aria-hidden="true">↗</span>
  const label = children ? undefined : `Źródło: ${refText}`
  const common = {
    className: children ? 'v2-source v2-source-text' : 'v2-source',
    'aria-label': label,
    'aria-describedby': children ? undefined : t.id,
    onFocus: t.show,
    onBlur: t.hide,
  }
  return (
    <span className="v2-tipwrap" onMouseEnter={t.show} onMouseLeave={t.hide}>
      {href ? (
        <a {...common} href={href} target="_blank" rel="noopener noreferrer">{icon}{children}</a>
      ) : (
        <button type="button" {...common} onClick={onOpen ?? (() => askAssistant(`Co dokładnie mówi ${refText}?`))}>{icon}{children}</button>
      )}
      {!children && <Tip id={t.id} open={t.open} align={align}>{refText}</Tip>}
    </span>
  )
}
