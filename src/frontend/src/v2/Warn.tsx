import type { ReactNode } from 'react'

/** Ostrzeżenie / brak: ikona ! i granatowy obrys na #DCEEFB (bez lawendy, bez czerwieni). `alert` = role="alert". */
export function Warn({ children, title, alert = false }: { children?: ReactNode; title?: ReactNode; alert?: boolean }) {
  return (
    <div className="v2-warn" role={alert ? 'alert' : undefined}>
      <span className="v2-warn-icon" aria-hidden="true">!</span>
      <div className="v2-warn-body">
        {title && <strong>{title}</strong>}
        {children}
      </div>
    </div>
  )
}
