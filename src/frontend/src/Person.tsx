import type { ReactNode } from 'react'
import { Avatar } from './Avatar'

const SIZES = { sm: 40, md: 56, lg: 72, xl: 104 } as const

/**
 * Osoba zawsze z twarzą: zdjęcie, imię i nazwisko, kim jest. Northstar Busoli: przełożony opiekuje się człowiekiem,
 * nie rekordem — więc wszędzie, gdzie proces dotyczy pracownika, pokazujemy go tym komponentem, nie samym nazwiskiem.
 * Zdjęcie z /org (widoczność w obrębie służby); brak zdjęcia = inicjały.
 */
export function Person({ id, name, detail, size = 'sm', onOpen, stacked = false, hasAvatar = true }: {
  id: number
  name: string
  /** Kim jest: stanowisko, komórka — drugi wiersz pod nazwiskiem. */
  detail?: ReactNode
  size?: keyof typeof SIZES
  onOpen?: () => void
  /** Pionowo i na środku (np. boczny panel oceny). */
  stacked?: boolean
  /** false = wiadomo, że zdjęcia nie ma (bez zapytania). */
  hasAvatar?: boolean
}) {
  return (
    <span className={`person person-${size}${stacked ? ' person-stacked' : ''}`}>
      <Avatar path={hasAvatar ? `org/${id}/avatar` : null} name={name} size={SIZES[size]} decorative />
      <span className="person-text">
        {onOpen
          ? <button type="button" className="link person-name" onClick={onOpen}>{name}</button>
          : <strong className="person-name">{name}</strong>}
        {detail && <span className="person-detail">{detail}</span>}
      </span>
    </span>
  )
}
