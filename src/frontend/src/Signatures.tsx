import { QRCodeSVG } from 'qrcode.react'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { api, apiBlobUrl } from './api'

type SignatureRequest = {
  id: string
  title: string
  signerName: string
  status: 'Pending' | 'Signed' | 'Declined' | 'Expired'
  createdAt: string
  completedAt: string | null
  signerUserAgent: string | null
  evaluationId: number | null
  evaluationFieldKey: string | null
}

type SignatureField = { key: string; label: string | null; role: string; signed: boolean }

const ROLE_LABELS: Record<string, string> = {
  Evaluated: 'oceniany',
  Supervisor: 'przełożony',
  UnitHead: 'kierujący komórką',
  Evaluator: 'oceniający',
}

const STATUS_LABELS: Record<SignatureRequest['status'], string> = {
  Pending: 'Oczekuje',
  Signed: 'Podpisano',
  Declined: 'Odrzucono',
  Expired: 'Link wygasł',
}

const POLL_MS = 2000
const formatDate = (iso: string) => new Date(iso).toLocaleString('pl-PL')

/** Zlecanie podpisów: kod QR dla telefonu albo link na tym urządzeniu, status odświeżany na żywo. */
export function SignaturesPage() {
  const [items, setItems] = useState<SignatureRequest[] | null>(null)
  const [active, setActive] = useState<{ id: string; url: string } | null>(null)
  const [error, setError] = useState('')
  const [fields, setFields] = useState<SignatureField[] | null>(null)

  const load = useCallback(() => api<SignatureRequest[]>('signatures').then(setItems, (e: Error) => setError(e.message)), [])
  useEffect(() => {
    load()
  }, [load])

  const activeItem = items?.find((i) => i.id === active?.id)
  const waiting = activeItem?.status === 'Pending'
  useEffect(() => {
    if (!waiting) return
    const timer = setInterval(load, POLL_MS)
    return () => clearInterval(timer)
  }, [waiting, load])

  const show = (id: string, token: string) => setActive({ id, url: `${location.origin}/podpis/${encodeURIComponent(token)}` })

  async function loadFields(evaluationId: string) {
    setFields(null)
    if (!evaluationId) return
    try {
      setFields(await api<SignatureField[]>(`signatures/evaluation-fields?evaluationId=${encodeURIComponent(evaluationId)}`))
      setError('')
    } catch {
      setError('Nie znaleziono oceny o tym numerze (albo nie masz do niej dostępu).')
    }
  }

  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formElement = e.currentTarget
    const form = new FormData(formElement)
    const evaluationId = String(form.get('evaluationId') ?? '')
    try {
      const res = await api<{ request: SignatureRequest; token: string }>('signatures', 'POST', {
        title: form.get('title'),
        signerName: form.get('signerName'),
        evaluationId: evaluationId ? Number(evaluationId) : null,
        evaluationFieldKey: evaluationId ? form.get('evaluationFieldKey') : null,
      })
      formElement.reset()
      setFields(null)
      setError('')
      show(res.request.id, res.token)
      await load()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function renew(id: string) {
    try {
      const res = await api<{ token: string }>(`signatures/${id}/link`, 'POST')
      setError('')
      show(id, res.token)
      await load()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <section>
      <div className="toolbar"><h2>Podpisy</h2></div>
      {error && <p role="alert" className="error">{error}</p>}

      <form onSubmit={create} className="form card">
        <label>Dokument<input name="title" required maxLength={200} placeholder="np. Raport kwartalny Q4" /></label>
        <label>Kto podpisuje<input name="signerName" required maxLength={200} placeholder="Imię i nazwisko" /></label>
        <label>
          Nr oceny (opcjonalnie)
          <input name="evaluationId" type="number" min={1} placeholder="Podpis trafi do arkusza oceny" onBlur={(e) => loadFields(e.target.value)} />
        </label>
        {fields && (
          <label>
            Pole podpisu w ocenie
            <select name="evaluationFieldKey" required defaultValue="">
              <option value="" disabled>— wybierz —</option>
              {fields.map((f) => (
                <option key={f.key} value={f.key} disabled={f.signed}>
                  {f.label ?? f.key} ({ROLE_LABELS[f.role] ?? f.role}){f.signed ? ' · podpisane' : ''}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="buttons"><button type="submit">Poproś o podpis</button></div>
      </form>

      {active && activeItem && (
        <div className="card sign-panel">
          <div>
            <h3>{activeItem.title}</h3>
            <p>Podpisuje: <strong>{activeItem.signerName}</strong></p>
            <p role="status" aria-live="polite">
              {activeItem.status === 'Pending' ? 'Czekam na podpis…' : STATUS_LABELS[activeItem.status]}
              {activeItem.completedAt && ` · ${formatDate(activeItem.completedAt)}`}
            </p>
            {activeItem.status === 'Signed' && <SignatureImage id={activeItem.id} large />}
            {activeItem.status === 'Pending' && (
              <div className="buttons">
                <a className="button" href={active.url} target="_blank" rel="noopener">Podpisz na tym urządzeniu</a>
                <button className="secondary" onClick={() => navigator.clipboard?.writeText(active.url).catch(() => undefined)}>
                  Kopiuj link
                </button>
              </div>
            )}
            <button className="link" onClick={() => setActive(null)}>Zamknij</button>
          </div>
          {activeItem.status === 'Pending' && (
            <div className="sign-qr">
              <div className="qr"><QRCodeSVG value={active.url} size={220} marginSize={2} title="Kod QR z linkiem do podpisu" /></div>
              <p className="muted">Zeskanuj telefonem</p>
            </div>
          )}
        </div>
      )}

      {items === null ? (
        <p>Ładowanie…</p>
      ) : items.length === 0 ? (
        <p className="muted">Brak próśb o podpis.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Dokument</th><th>Podpisuje</th><th>Status</th><th>Utworzono</th><th>Podpis</th><th><span className="sr-only">Akcje</span></th></tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id}>
                  <td>
                    {i.title}
                    {i.evaluationId && <div className="muted">Ocena nr {i.evaluationId}</div>}
                  </td>
                  <td>{i.signerName}</td>
                  <td>{STATUS_LABELS[i.status]}</td>
                  <td>{formatDate(i.createdAt)}</td>
                  <td>{i.status === 'Signed' ? <SignatureImage id={i.id} /> : '—'}</td>
                  <td className="actions">
                    {(i.status === 'Pending' || i.status === 'Expired') && (
                      <button className="link" onClick={() => renew(i.id)}>Pokaż kod QR</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

/** Obraz wymaga tokenu, więc idzie przez fetch i blob URL, jak avatary. */
function SignatureImage({ id, large }: { id: string; large?: boolean }) {
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    let url: string | null = null
    let cancelled = false
    apiBlobUrl(`signatures/${id}/image`).then((u) => {
      if (cancelled) {
        if (u) URL.revokeObjectURL(u)
        return
      }
      url = u
      setSrc(u)
    })
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [id])
  return src ? <img src={src} alt="Podpis odręczny" className={large ? 'signature-image large' : 'signature-image'} /> : null
}
