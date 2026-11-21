import { useEffect, useState } from 'react'
import { api } from './api'
import { SignaturePad } from './SignaturePad'

type Info = { title: string; signerName: string; requestedBy: string | null; status: string; linkExpiresAt: string }

/**
 * Publiczna strona sygnatariusza (/podpis/{token}): bez logowania, działa na telefonie i ekranie dotykowym.
 * test = piaskownica z zakładki Dev (/podpis-test/{token}): to samo, ale API w pamięci, bez zapisu w bazie.
 */
export function SignPage({ token, test = false }: { token: string; test?: boolean }) {
  const path = `${test ? 'dev/sign' : 'sign'}/${encodeURIComponent(token)}`
  const [info, setInfo] = useState<Info | null>(null)
  const [error, setError] = useState('')
  const [png, setPng] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<'signed' | 'declined' | null>(null)

  useEffect(() => {
    api<Info>(path).then(setInfo, () => setError('Link jest nieprawidłowy. Poproś o nowy kod QR.'))
  }, [path])

  async function submit(action: () => Promise<unknown>, result: 'signed' | 'declined') {
    setBusy(true)
    setError('')
    try {
      await action()
      setDone(result)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="sign-page">
      <h1>Busola Rozwoju</h1>
      {test && <p role="note" className="test-banner">Tryb testowy: podpis nie zostanie zapisany w systemie.</p>}
      {done === 'signed' ? (
        <p role="status" className="sign-done">Dziękujemy, podpis został zapisany. Możesz zamknąć tę stronę.</p>
      ) : done === 'declined' ? (
        <p role="status" className="sign-done">Odmówiono podpisu. Możesz zamknąć tę stronę.</p>
      ) : !info ? (
        error ? <p role="alert" className="error">{error}</p> : <p>Ładowanie…</p>
      ) : info.status !== 'Pending' ? (
        <p role="alert" className="error">Ten link jest już nieaktywny (podpisano, odrzucono albo wygasł).</p>
      ) : (
        <>
          <section className="card sign-details">
            <h2>{info.title}</h2>
            <p>Podpisuje: <strong>{info.signerName}</strong></p>
            {info.requestedBy && <p className="muted">Prośba od: {info.requestedBy}</p>}
          </section>
          <p className="muted">Złóż podpis w polu poniżej palcem, rysikiem albo myszą.</p>
          <SignaturePad onChange={setPng} disabled={busy} />
          {error && <p role="alert" className="error">{error}</p>}
          <div className="buttons">
            <button onClick={() => submit(() => api(path, 'POST', { image: png }), 'signed')} disabled={!png || busy}>
              {busy ? 'Zapisywanie…' : 'Podpisz'}
            </button>
            <button
              className="secondary"
              disabled={busy}
              onClick={() => confirm('Na pewno odmówić podpisu?') && submit(() => api(`${path}/decline`, 'POST'), 'declined')}
            >
              Odmów
            </button>
          </div>
        </>
      )}
    </main>
  )
}
