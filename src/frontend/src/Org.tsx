import { useEffect, useState } from 'react'
import { api } from './api'
import { Avatar } from './Avatar'

type Card = { id: number; name: string; jobTitle: string | null; departmentName: string; hasAvatar: boolean; reportsCount: number; isMe: boolean }
type OrgView = { focus: Card; managers: Card[]; reports: Card[] }

/** Drzewko przełożonych: łańcuch w górę, wybrana osoba, jej podwładni. Kliknięcie karty przenosi na tę osobę. */
export function OrgPage({ startId, onOpenProfile }: { startId: number | null; onOpenProfile: (id: number) => void }) {
  const [focusId, setFocusId] = useState<number | null>(startId)
  const [view, setView] = useState<OrgView | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api<OrgView>(focusId ? `org?employeeId=${focusId}` : 'org').then(
      (v) => { setView(v); setError('') },
      (e: Error) => setError(e.message),
    )
  }, [focusId])

  if (!view) return error ? <p role="alert" className="error">{error}</p> : <p>Ładowanie…</p>

  const card = (c: Card, kind: 'manager' | 'focus' | 'report') => (
    <div className={`org-card ${kind}${c.isMe ? ' me' : ''}`}>
      <button className="org-card-main" onClick={() => setFocusId(c.id)} disabled={kind === 'focus'}
        aria-label={kind === 'focus' ? undefined : `Pokaż strukturę: ${c.name}`}>
        <Avatar path={c.hasAvatar ? `org/${c.id}/avatar` : null} name={c.name} size={kind === 'focus' ? 56 : 40} />
        <span>
          <strong>{c.name}</strong>{c.isMe && <span className="badge">Ja</span>}
          <span className="muted">{c.jobTitle ?? 'Stanowisko nieuzupełnione'}</span>
          <span className="muted small">{c.departmentName}</span>
        </span>
      </button>
      <div className="org-card-footer">
        {c.reportsCount > 0 && <span className="muted small">Podwładni: {c.reportsCount}</span>}
        <button className="link" onClick={() => onOpenProfile(c.id)}>Profil</button>
      </div>
    </div>
  )

  return (
    <section>
      <div className="toolbar">
        <h2>Struktura</h2>
        {!view.focus.isMe && <button className="secondary" onClick={() => setFocusId(null)}>Wróć do mnie</button>}
      </div>
      {error && <p role="alert" className="error">{error}</p>}
      <div className="org">
        {view.managers.length > 0 && (
          <ol className="org-chain" aria-label="Przełożeni">
            {view.managers.map((m) => <li key={m.id}>{card(m, 'manager')}</li>)}
          </ol>
        )}
        <div className="org-focus">{card(view.focus, 'focus')}</div>
        <h3 className="org-reports-title">Podwładni ({view.reports.length})</h3>
        {view.reports.length ? (
          <ul className="org-reports">
            {view.reports.map((r) => <li key={r.id}>{card(r, 'report')}</li>)}
          </ul>
        ) : (
          <p className="muted">Brak podwładnych.</p>
        )}
      </div>
    </section>
  )
}
