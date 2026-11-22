import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import './nav-more.css'

export type NavMoreItem = { key: string; label: string }

/** Menu tematyczne w nagłówku („Kadry ▾”, „Organizacja ▾”, „Administracja ▾”), żeby główne zakładki mieściły się w 1280 px.
 *  Klawiatura: Enter/Spacja/↓ otwiera i ustawia fokus na pierwszej pozycji, ↑/↓/Home/End przesuwają, Escape zamyka i wraca do przycisku. */
export function NavMore({ label = 'Więcej', items, activeKey, onPick }: {
  label?: string; items: NavMoreItem[]; activeKey: string | null; onPick: (key: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])
  const focusOnOpen = useRef<number | null>(null)

  useEffect(() => {
    if (!open) return
    const outside = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    document.addEventListener('mousedown', outside)
    if (focusOnOpen.current !== null) {
      itemRefs.current[focusOnOpen.current]?.focus()
      focusOnOpen.current = null
    }
    return () => document.removeEventListener('mousedown', outside)
  }, [open])

  const active = items.find((i) => i.key === activeKey)
  const menuId = `nav-more-${label.toLowerCase().normalize('NFD').replace(/[^a-z]/g, '')}`
  if (items.length === 0) return null
  // Jedna strona w grupie: zwykła zakładka, rozwijanie nic by nie dało.
  if (items.length === 1) {
    const only = items[0]
    return (
      <button type="button" className={active ? 'tab active' : 'tab'} aria-current={active ? 'page' : undefined} onClick={() => onPick(only.key)}>
        {only.label}
      </button>
    )
  }

  const openAt = (index: number) => {
    focusOnOpen.current = index
    setOpen(true)
  }
  const close = (refocus: boolean) => {
    setOpen(false)
    if (refocus) trigger.current?.focus()
  }

  const onTriggerKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); openAt(0) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); openAt(items.length - 1) }
    else if (e.key === 'Escape' && open) { e.preventDefault(); close(true) }
  }

  const onMenuKey = (e: KeyboardEvent) => {
    const current = itemRefs.current.findIndex((el) => el === document.activeElement)
    const move = (i: number) => { e.preventDefault(); itemRefs.current[(i + items.length) % items.length]?.focus() }
    if (e.key === 'ArrowDown') move(current + 1)
    else if (e.key === 'ArrowUp') move(current - 1)
    else if (e.key === 'Home') move(0)
    else if (e.key === 'End') move(items.length - 1)
    else if (e.key === 'Escape') { e.preventDefault(); close(true) }
    else if (e.key === 'Tab') close(false)
  }

  return (
    <div className="nav-more" ref={ref}>
      <button ref={trigger} type="button" className={active ? 'tab active nav-more-trigger' : 'tab nav-more-trigger'}
        aria-haspopup="menu" aria-expanded={open} aria-controls={menuId}
        onClick={() => (open ? close(false) : openAt(active ? items.indexOf(active) : 0))} onKeyDown={onTriggerKey}>
        {label}
        <span aria-hidden="true" className="nav-more-caret">▾</span>
      </button>
      {open && (
        <div className="nav-more-menu" role="menu" id={menuId} aria-label={label} onKeyDown={onMenuKey}>
          {items.map((item, i) => (
            <button key={item.key} type="button" role="menuitem" tabIndex={-1}
              ref={(el) => { itemRefs.current[i] = el }}
              aria-current={item.key === activeKey ? 'page' : undefined}
              className={item.key === activeKey ? 'nav-more-item current' : 'nav-more-item'}
              onClick={() => { close(true); onPick(item.key) }}>
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
