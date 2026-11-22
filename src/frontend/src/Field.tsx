import { cloneElement, useId, type ReactElement, type ReactNode } from 'react'

/**
 * Pole formularza według guidelines: etykieta nad polem, podpowiedź pod etykietą, błąd pod polem.
 * Podpowiedź i błąd są połączone z kontrolką przez aria-describedby, a błąd ustawia aria-invalid
 * (sama czerwona ramka to za mało).
 */
export function Field({ label, hint, error, children }: {
  label: ReactNode
  hint?: ReactNode
  error?: string | null
  children: ReactElement<Record<string, unknown>>
}) {
  const id = useId()
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {hint && <span className="hint" id={hintId}>{hint}</span>}
      {cloneElement(children, { id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })}
      {error && <span className="field-error" id={errorId}>{error}</span>}
    </div>
  )
}
