import { useEffect, useRef, useState, type ReactNode } from 'react'

/**
 * Akcja, której nie da się cofnąć (guidelines „Przyciski”): przycisk z obrysem w kolorze błędu, a po kliknięciu
 * pytanie na stronie z przyciskiem potwierdzenia i „Anuluj” — zamiast okna `confirm()` przeglądarki.
 * `primary` dla nieodwracalnych kroków, które nie usuwają danych (np. przekazanie samooceny).
 */
export function ConfirmButton({ children, question, confirmLabel, onConfirm, primary = false, compact = false, disabled = false }: {
  children: ReactNode
  question: ReactNode
  confirmLabel: string
  onConfirm: () => unknown
  primary?: boolean
  compact?: boolean
  disabled?: boolean
}) {
  const [asking, setAsking] = useState(false)
  const confirmRef = useRef<HTMLButtonElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const wasAsking = useRef(false)

  // Fokus idzie na potwierdzenie, a po anulowaniu wraca na przycisk, z którego przyszedł.
  useEffect(() => {
    if (asking) confirmRef.current?.focus()
    else if (wasAsking.current) triggerRef.current?.focus()
    wasAsking.current = asking
  }, [asking])

  const tone = [primary ? '' : 'secondary danger', compact && 'compact'].filter(Boolean).join(' ') || undefined
  if (!asking) {
    return <button ref={triggerRef} type="button" className={tone} disabled={disabled} onClick={() => setAsking(true)}>{children}</button>
  }
  return (
    <span className="confirm m-fade-in" role="group" onKeyDown={(e) => { if (e.key === 'Escape') setAsking(false) }}>
      <span>{question}</span>
      <button ref={confirmRef} type="button" className={tone} disabled={disabled} onClick={() => { setAsking(false); onConfirm() }}>{confirmLabel}</button>
      <button type="button" className={compact ? 'secondary compact' : 'secondary'} onClick={() => setAsking(false)}>Anuluj</button>
    </span>
  )
}
