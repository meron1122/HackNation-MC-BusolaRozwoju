import { useEffect, useRef, useState } from 'react'
import { Avatar } from './Avatar'

/** Menu pod loginem w nagłówku: profil, konto (hasło, 2FA, zdjęcie), wylogowanie. */
export function UserMenu({ name, avatarVersion, active, onProfile, onAccount, onLogout }: {
  name: string
  avatarVersion: number
  active: boolean
  onProfile: () => void
  onAccount: () => void
  onLogout: () => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const outside = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    const escape = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', outside)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('mousedown', outside)
      document.removeEventListener('keydown', escape)
    }
  }, [open])

  const pick = (action: () => void) => () => {
    setOpen(false)
    action()
  }

  return (
    <div className="user-menu" ref={ref}>
      <button className={active ? 'tab active account-link' : 'tab account-link'} aria-haspopup="menu" aria-expanded={open}
        onClick={() => setOpen((o) => !o)}>
        <Avatar path="account/avatar" name={name} size={28} version={avatarVersion} />
        {name}
        <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="menu" role="menu">
          <button role="menuitem" onClick={pick(onProfile)}>Mój profil</button>
          <button role="menuitem" onClick={pick(onAccount)}>Moje konto</button>
          <button role="menuitem" onClick={pick(onLogout)}>Wyloguj</button>
        </div>
      )}
    </div>
  )
}
