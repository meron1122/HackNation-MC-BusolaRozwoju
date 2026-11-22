import { useEffect, useRef, useState } from 'react'
import { AssistantChat } from '../assistant/AssistantChat'
import { FOCUS_ASSISTANT_EVENT } from '../assistant/AssistantWidget'
import { dock } from '../assistant/store'
import { useApi } from '../evaluation/data'
import { fmtDate, type Detail, type Notes } from '../evaluation/types'

type Tab = 'notes' | 'asst'

const WIDE = '(min-width: 1366px)'
/** Czy panel stoi obok treści (szeroki ekran), czy jest szufladą. */
function useWide() {
  const [wide, setWide] = useState(() => matchMedia(WIDE).matches)
  useEffect(() => {
    const m = matchMedia(WIDE)
    const on = () => setWide(m.matches)
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [])
  return wide
}

/** Tekst wskaźnika z modelu kompetencji (do podpisu notatki). */
function indicatorText(detail: Detail, key: string | null): string | null {
  if (!key) return null
  for (const c of Object.values(detail.schema.competencyModel?.competencies ?? {})) {
    const i = c.indicators.find((x) => x.key === key)
    if (i) return i.text
  }
  return null
}

/** Notatki z obserwacji (tylko podgląd); dodawanie i edycja w kroku „Notatki”. */
function NotesList({ detail, onAdd }: { detail: Detail; onAdd?: () => void }) {
  const { data, error } = useApi<Notes>(`evaluations/${detail.id}/notes`)
  if (error) return <p className="wz-panel-empty">Notatki są niedostępne.</p>
  if (!data) return <p className="wz-panel-empty">Ładowanie…</p>
  const notes = [...data.notes].sort((a, b) => b.observedOn.localeCompare(a.observedOn))
  return (
    <div className="wz-notes">
      {onAdd && <button type="button" className="secondary wz-notes-add" onClick={onAdd}>+ Dodaj notatkę</button>}
      {notes.length === 0 && <p className="wz-panel-empty">Brak notatek.</p>}
      <ul>
        {notes.map((n) => (
          <li key={n.id} className="wz-note">
            <p className="wz-note-meta"><time dateTime={n.observedOn}>{fmtDate(n.observedOn)}</time>{n.isPrivate && ' · prywatna'}</p>
            <p className="wz-note-text">{n.situation || n.action || n.result || '—'}</p>
            {indicatorText(detail, n.indicatorKey) && <p className="wz-note-ind">{indicatorText(detail, n.indicatorKey)}</p>}
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * Prawy panel kreatora (H08 v2): zakładki „Notatki · N” i „✦ Asystent” (ta sama rozmowa co okno w rogu, które się chowa).
 * Poniżej 1366 px panel zwija się do wąskiej szyny i otwiera jako szuflada (Escape zamyka).
 */
export function WizardPanel({ detail, step, onAddNote }: { detail: Detail; step: string; onAddNote?: () => void }) {
  const showNotes = !detail.isOwn
  // W ocenie asystent jest pierwszy: to tu najczęściej pojawiają się wątpliwości. agent/context nie ma limitu (nie woła modelu).
  const [tab, setTab] = useState<Tab>('asst')
  const [open, setOpen] = useState(false)
  const wide = useWide()
  const visible = wide || open
  const panel = useRef<HTMLElement>(null)
  const { data, reload } = useApi<Notes>(showNotes ? `evaluations/${detail.id}/notes` : null)
  const count = data?.notes.length
  // Po zmianie kroku liczba notatek mogła się zmienić (dodane w kroku „Notatki”).
  useEffect(() => { void reload() }, [step, reload])

  useEffect(() => dock(), [])
  useEffect(() => {
    const focus = () => { setTab('asst'); setOpen(true) }
    window.addEventListener(FOCUS_ASSISTANT_EVENT, focus)
    return () => window.removeEventListener(FOCUS_ASSISTANT_EVENT, focus)
  }, [])
  useEffect(() => {
    if (!open) return
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [open])

  const openTab = (t: Tab) => {
    setTab(t)
    setOpen(true)
    requestAnimationFrame(() => panel.current?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus())
  }
  const tabs: { id: Tab; label: string }[] = [
    ...(showNotes ? [{ id: 'notes' as const, label: `Notatki${count != null ? ` · ${count}` : ''}` }] : []),
    { id: 'asst', label: '✦ Asystent' },
  ]
  const active = tabs.some((t) => t.id === tab) ? tab : 'asst'

  return (
    <>
      <div className="wz-rail" aria-label="Panel boczny" role="group">
        {tabs.map((t) => (
          <button key={t.id} type="button" className={`wz-rail-btn${t.id === 'asst' ? ' ai' : ''}`} aria-expanded={open && active === t.id}
            aria-label={t.id === 'asst' ? 'Asystent' : t.label} onClick={() => (open && active === t.id ? setOpen(false) : openTab(t.id))}>
            {t.id === 'asst' ? <span aria-hidden="true">✦</span> : (
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 3h9l4 4v14H6z" /><path d="M14 3v5h5M9 13h7M9 17h5" />
              </svg>
            )}
            {t.id === 'notes' && count != null && <span className="wz-rail-count" aria-hidden="true">{count}</span>}
          </button>
        ))}
      </div>
      <aside ref={panel} className={`wz-panel${open ? ' open' : ''}`} aria-label="Notatki i asystent">
        <div className="wz-tabs" role="tablist" aria-label="Panel boczny">
          {tabs.map((t) => (
            <button key={t.id} type="button" role="tab" id={`wz-tab-${t.id}`} aria-controls={`wz-tabpanel-${t.id}`}
              aria-selected={active === t.id} tabIndex={active === t.id ? 0 : -1}
              className={`wz-tab${t.id === 'asst' ? ' ai' : ''}`} onClick={() => setTab(t.id)}
              onKeyDown={(e) => {
                if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
                const i = tabs.findIndex((x) => x.id === active)
                const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length]
                setTab(next.id)
                requestAnimationFrame(() => document.getElementById(`wz-tab-${next.id}`)?.focus())
              }}>
              {t.label}
            </button>
          ))}
          <span className="grow" />
          <button type="button" className="wz-panel-close" aria-label="Zamknij panel" onClick={() => setOpen(false)}>×</button>
        </div>
        <div className="wz-tabpanel" role="tabpanel" id={`wz-tabpanel-${active}`} aria-labelledby={`wz-tab-${active}`}>
          {visible && (active === 'notes'
            ? <NotesList key={step} detail={detail} onAdd={onAddNote && (() => { onAddNote(); setOpen(false) })} />
            : <AssistantChat variant="panel" />)}
        </div>
      </aside>
    </>
  )
}
