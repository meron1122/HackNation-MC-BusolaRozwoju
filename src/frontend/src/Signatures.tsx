import { QRCodeSVG } from 'qrcode.react'
import { useEffect, useRef, useState } from 'react'
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

const STATUS_LABELS: Record<SignatureRequest['status'], string> = {
  Pending: 'Oczekuje',
  Signed: 'Podpisano',
  Declined: 'Odrzucono',
  Expired: 'Link wygasł',
}

const POLL_MS = 2000
const formatDate = (iso: string) => new Date(iso).toLocaleString('pl-PL')

/**
 * Link do podpisu: kod QR dla telefonu, przycisk dla tego urządzenia (ekran dotykowy) i status odświeżany na żywo.
 * onFinished dostaje status, gdy prośba przestanie czekać (podpisano, odrzucono, link wygasł).
 */
export function SignatureLinkPanel({ requestId, token, onFinished, onClose, test = false }: {
  requestId: string
  token: string
  onFinished?: (status: SignatureRequest['status']) => void
  onClose: () => void
  /** Piaskownica z zakładki Dev: API w pamięci i strona /podpis-test. */
  test?: boolean
}) {
  const apiBase = test ? 'dev/signatures' : 'signatures'
  const url = `${location.origin}/${test ? 'podpis-test' : 'podpis'}/${encodeURIComponent(token)}`
  const [item, setItem] = useState<SignatureRequest | null>(null)
  const onFinishedRef = useRef(onFinished)
  useEffect(() => {
    onFinishedRef.current = onFinished
  }, [onFinished])

  useEffect(() => {
    let done = false
    const tick = () => api<SignatureRequest>(`${apiBase}/${requestId}`).then((r) => {
      if (done) return
      setItem(r)
      if (r.status !== 'Pending') {
        done = true
        onFinishedRef.current?.(r.status)
      }
    }, () => undefined)
    tick()
    const timer = setInterval(() => !done && tick(), POLL_MS)
    return () => {
      done = true
      clearInterval(timer)
    }
  }, [requestId, apiBase])

  if (!item) return null
  return (
    <div className="card sign-panel">
      <div>
        <h3>{item.title}</h3>
        <p>Podpisuje: <strong>{item.signerName}</strong></p>
        <p role="status" aria-live="polite">
          {item.status === 'Pending' ? 'Czekam na podpis…' : STATUS_LABELS[item.status]}
          {item.completedAt && ` · ${formatDate(item.completedAt)}`}
        </p>
        {item.status === 'Signed' && <SignatureImage path={`${apiBase}/${item.id}/image`} large />}
        {item.status === 'Pending' && (
          <div className="buttons">
            <a className="button" href={url} target="_blank" rel="noopener">Podpisz na tym urządzeniu</a>
            <button type="button" className="secondary" onClick={() => navigator.clipboard?.writeText(url).catch(() => undefined)}>
              Kopiuj link
            </button>
          </div>
        )}
        <button type="button" className="link" onClick={onClose}>Zamknij</button>
      </div>
      {item.status === 'Pending' && (
        <div className="sign-qr">
          <div className="qr"><QRCodeSVG value={url} size={220} marginSize={2} title="Kod QR z linkiem do podpisu" /></div>
          <p className="muted">Zeskanuj telefonem</p>
        </div>
      )}
    </div>
  )
}

/** Obraz wymaga tokenu, więc idzie przez fetch i blob URL, jak avatary. */
function SignatureImage({ path, large }: { path: string; large?: boolean }) {
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    let url: string | null = null
    let cancelled = false
    apiBlobUrl(path).then((u) => {
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
  }, [path])
  return src ? <img src={src} alt="Podpis odręczny" className={large ? 'signature-image large' : 'signature-image'} /> : null
}
