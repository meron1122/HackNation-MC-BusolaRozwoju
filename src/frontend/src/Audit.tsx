import { Fragment, useEffect, useState, type FormEvent } from 'react'
import { api, apiDownload } from './api'
import { DateInput } from './DateInput'

type Entry = {
  id: number
  at: string
  userId: string | null
  userEmail: string | null
  action: string
  entityType: string | null
  entityId: string | null
  changes: string | null
  ip: string | null
  userAgent: string | null
  method: string | null
  path: string | null
  statusCode: number | null
}
type Change = { old: unknown; new: unknown }

const PAGE_SIZE = 50

// Klucze z AuditInterceptor (zmiany) i AuditMiddleware (dostęp).
const ACTIONS: Record<string, string> = {
  create: 'Utworzenie',
  update: 'Zmiana',
  delete: 'Usunięcie',
  write: 'Zapis przez API',
  login_success: 'Logowanie udane',
  login_failed: 'Logowanie nieudane',
  login_2fa_required: 'Hasło poprawne, czeka na kod 2FA',
  logout: 'Wylogowanie',
  password_change: 'Zmiana hasła',
  two_factor_enable: 'Włączenie 2FA',
  two_factor_disable: 'Wyłączenie 2FA',
  two_factor_reset: 'Reset 2FA przez administratora',
  user_create: 'Założenie konta',
  role_change: 'Zmiana ról',
  sign: 'Złożenie podpisu',
  sign_decline: 'Odmowa podpisu',
  agent_query: 'Pytanie do asystenta',
}

const pad = (n: number) => String(n).padStart(2, '0')
/** Czas lokalny DD.MM.RRRR GG:MM:SS (w bazie UTC). */
const fmtAt = (iso: string) => {
  const d = new Date(iso)
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}
/** rrrr-mm-dd → początek tego dnia (albo następnego) czasu lokalnego jako ISO. */
const dayStart = (iso: string, plusDays = 0) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d + plusDays).toISOString()
}
const show = (value: unknown) => (value === null || value === undefined ? '—' : typeof value === 'string' ? value : JSON.stringify(value))

function queryOf(form: FormData): string {
  const params = new URLSearchParams()
  for (const key of ['user', 'entityType', 'entityId', 'action', 'ip']) {
    const value = String(form.get(key) ?? '').trim()
    if (value) params.set(key, value)
  }
  const from = String(form.get('from') ?? '')
  const to = String(form.get('to') ?? '')
  if (from) params.set('from', dayStart(from))
  if (to) params.set('to', dayStart(to, 1)) // „do” włącznie z tym dniem
  return params.toString()
}

export function AuditPage() {
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<{ items: Entry[]; total: number } | null>(null)
  const [open, setOpen] = useState<number | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let current = true
    setData(null)
    api<{ items: Entry[]; total: number }>(`audit?${query}&page=${page}&pageSize=${PAGE_SIZE}`).then(
      (d) => current && (setData(d), setError('')),
      (e: Error) => current && setError(e.message),
    )
    return () => { current = false }
  }, [query, page])

  function search(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setQuery(queryOf(new FormData(e.currentTarget)))
    setPage(1)
    setOpen(null)
  }

  function exportCsv() {
    apiDownload(`audit/csv?${query}`, 'dziennik-audytu.csv').catch((e: Error) => setError(e.message))
  }

  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1

  return (
    <section>
      <div className="toolbar">
        <h2>Dziennik audytu</h2>
        <button className="secondary" onClick={exportCsv}>Eksportuj CSV</button>
      </div>
      <p className="muted">
        Zmiany danych i operacje w API (logowania, zapisy, usunięcia; bez odczytów): kto, kiedy, skąd i z jakim wynikiem. Wpisów nie da się zmienić ani usunąć.
        Eksport obejmuje bieżące filtry (najwyżej 50 000 najnowszych wpisów).
      </p>
      <form onSubmit={search} className="form card">
        <label>Od<DateInput name="from" /></label>
        <label>Do<DateInput name="to" /></label>
        <label>Użytkownik (e-mail lub id)<input name="user" /></label>
        <label>
          Akcja
          <select name="action" defaultValue="">
            <option value="">— wszystkie —</option>
            {Object.entries(ACTIONS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </label>
        <label>Typ encji (np. employees)<input name="entityType" /></label>
        <label>Id encji<input name="entityId" /></label>
        <label>Adres IP (początek)<input name="ip" /></label>
        <div className="buttons"><button type="submit">Szukaj</button></div>
      </form>
      {error && <p role="alert" className="error">{error}</p>}
      {data === null ? (
        !error && <p>Ładowanie…</p>
      ) : data.items.length === 0 ? (
        <p className="muted">Brak wpisów dla tych filtrów.</p>
      ) : (
        <>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Kiedy</th><th>Użytkownik</th><th>Akcja</th><th>Encja</th><th>Status</th><th>IP</th><th></th></tr></thead>
              <tbody>
                {data.items.map((a) => (
                  <Fragment key={a.id}>
                    <tr>
                      <td className="nowrap">{fmtAt(a.at)}</td>
                      <td>{a.userEmail ?? a.userId ?? 'system / niezalogowany'}</td>
                      <td>{ACTIONS[a.action] ?? a.action}</td>
                      <td>{a.entityType ? `${a.entityType}${a.entityId ? ` #${a.entityId}` : ''}` : '—'}</td>
                      <td>{a.statusCode ?? '—'}</td>
                      <td>{a.ip ?? '—'}</td>
                      <td>
                        <button className="link" aria-expanded={open === a.id} onClick={() => setOpen(open === a.id ? null : a.id)}>
                          {open === a.id ? 'Zwiń' : 'Szczegóły'}
                        </button>
                      </td>
                    </tr>
                    {open === a.id && <tr><td colSpan={7}><Details entry={a} /></td></tr>}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <div className="filters">
            <button className="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Poprzednia</button>
            <span>Strona {page} z {pages} ({data.total} wpisów)</span>
            <button className="secondary" disabled={page >= pages} onClick={() => setPage(page + 1)}>Następna</button>
          </div>
        </>
      )}
    </section>
  )
}

function Details({ entry }: { entry: Entry }) {
  const changes = entry.changes ? Object.entries(JSON.parse(entry.changes) as Record<string, Change>) : []
  return (
    <div className="form">
      <p className="muted">
        Wpis #{entry.id} · {entry.method ?? '—'} {entry.path ?? ''} · id użytkownika: {entry.userId ?? '—'}
        <br />Przeglądarka: {entry.userAgent ?? '—'}
      </p>
      {changes.length > 0 && (
        <table>
          <thead><tr><th>Pole</th><th>Było</th><th>Jest</th></tr></thead>
          <tbody>
            {changes.map(([field, c]) => (
              <tr key={field}><td>{field}</td><td>{show(c.old)}</td><td>{show(c.new)}</td></tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
