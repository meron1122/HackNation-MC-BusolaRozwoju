import { useState, type FormEvent } from 'react'
import { api } from './api'
import { SignatureLinkPanel } from './Signatures'

/** Zakładka Dev (SuperAdmin): test podpisu odręcznego na telefonie/ekranie dotykowym bez zapisu w bazie. */
export function DevPage() {
  const [active, setActive] = useState<{ id: string; token: string } | null>(null)
  const [error, setError] = useState('')

  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    try {
      const res = await api<{ request: { id: string }; token: string }>('dev/signatures', 'POST', {
        title: form.get('title'),
        signerName: form.get('signerName'),
      })
      setError('')
      setActive({ id: res.request.id, token: res.token })
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <section>
      <div className="toolbar"><h2>Dev: test podpisów</h2></div>
      <p className="muted">
        Ten sam flow co w „Podpisach” (kod QR, ekran dotykowy, status na żywo), ale tylko w pamięci serwera:
        nic nie trafia do bazy, a testy znikają po godzinie albo po restarcie.
      </p>
      {error && <p role="alert" className="error">{error}</p>}
      <form onSubmit={create} className="form card">
        <label>Dokument<input name="title" required maxLength={200} defaultValue="Test podpisu" /></label>
        <label>Kto podpisuje<input name="signerName" required maxLength={200} defaultValue="Tester" /></label>
        <div className="buttons"><button type="submit">Nowy test</button></div>
      </form>
      {active && (
        <SignatureLinkPanel key={active.token} requestId={active.id} token={active.token} test onClose={() => setActive(null)} />
      )}
    </section>
  )
}
