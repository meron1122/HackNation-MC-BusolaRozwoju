import type { ReactNode } from 'react'

/** ✦ — znak treści AI. Jedyny element (z ramką AiFrame), który używa lawendy. */
export function Spark({ className }: { className?: string }) {
  return <span className={`v2-spark${className ? ` ${className}` : ''}`} aria-hidden="true">✦</span>
}

/**
 * Treść od AI: przerywana lawendowa ramka i ✦. Akcje Wstaw / Edytuj / Odrzuć pokazują się, gdy podasz handler.
 * Sugestia nigdy nie trafia sama do oficjalnego pola — wstawia ją dopiero `onInsert`.
 *
 * - `label`: etykieta przy ✦ (domyślnie „Asystent”); `null` = sam znak.
 * - `aside`: element w prawym górnym rogu (np. chip zakresu „Ocena okresowa”).
 * - `actions`: własne przyciski zamiast standardowych.
 */
export function AiFrame({
  children, label = 'Asystent', aside, onInsert, onEdit, onReject, insertLabel = 'Wstaw', busy = false, actions, compact = false,
  className, live = false,
}: {
  children: ReactNode
  label?: ReactNode | null
  aside?: ReactNode
  onInsert?: () => void
  onEdit?: () => void
  onReject?: () => void
  insertLabel?: string
  busy?: boolean
  actions?: ReactNode
  compact?: boolean
  className?: string
  /** aria-live="polite" dla treści pojawiającej się asynchronicznie. */
  live?: boolean
}) {
  const hasActions = actions || onInsert || onEdit || onReject
  return (
    <section className={`v2-ai${compact ? ' v2-ai-compact' : ''}${className ? ` ${className}` : ''}`}
      aria-label="Propozycja asystenta" aria-live={live ? 'polite' : undefined} aria-busy={busy || undefined}>
      {(label !== null || aside) && (
        <header className="v2-ai-head">
          <span className="v2-ai-label"><Spark />{label}</span>
          {aside && <span className="v2-ai-aside">{aside}</span>}
        </header>
      )}
      {label === null && !aside && <Spark className="v2-ai-corner" />}
      <div className="v2-ai-body">{children}</div>
      {hasActions && (
        <div className="v2-ai-actions">
          {actions ?? (
            <>
              {onInsert && <button type="button" onClick={onInsert} disabled={busy}>{insertLabel}</button>}
              {onEdit && <button type="button" className="secondary" onClick={onEdit} disabled={busy}>Edytuj</button>}
              {onReject && <button type="button" className="link" onClick={onReject} disabled={busy}>Odrzuć</button>}
            </>
          )}
        </div>
      )}
    </section>
  )
}
