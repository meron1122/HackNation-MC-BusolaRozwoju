import type { ReactNode } from 'react'

/** Pusty stan według guidelines: co się tu pojawi i jak to dodać (opcjonalnie przycisk), zamiast „Brak danych”. */
export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <strong>{title}</strong>
      {children && <p>{children}</p>}
      {action}
    </div>
  )
}
