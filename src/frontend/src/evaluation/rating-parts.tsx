// Elementy ekranów H07–H09 v2 (agent „Ocena”): oś okresu z notatkami, skala z osią średniej, radar.
import { useEffect, useState, type ReactNode } from 'react'
import { reducedMotion } from './mw-motion'
import { fmtDate, type Notes, type ScaleOption } from './types'

type Note = Notes['notes'][number]

/** Chronologicznie: numery na osi i w kartach rosną z czasem. */
export const byDate = (notes: Note[]) => [...notes].sort((a, b) => a.observedOn.localeCompare(b.observedOn) || a.id - b.id)

const monthYear = (iso: string) => { const [y, m] = iso.split('-'); return `${m}.${y}` }
const ms = (iso: string) => Date.parse(iso.slice(0, 10))

/**
 * Oś okresu oceny z ponumerowanymi notatkami. Notatka sprzed okresu = szary punkt przed startem osi.
 * Najechanie lub fokus na kropce podświetla kartę notatki (i odwrotnie).
 */
export function PeriodAxis({ start, end, notes, active, onActive, endLabel }: {
  start: string
  end: string
  notes: Note[]
  active: number | null
  onActive: (id: number | null) => void
  /** Podpis prawego końca (domyślnie miesiąc końca okresu). */
  endLabel?: string
}) {
  const s = ms(start), e = Math.max(ms(end), s + 1)
  const pos = (iso: string) => Math.min(100, Math.max(0, ((ms(iso) - s) / (e - s)) * 100))
  const todayPos = pos(new Date().toISOString())
  const inPeriod = notes.filter((n) => n.inPeriod)
  const before = notes.filter((n) => !n.inPeriod)
  return (
    <div className="rh-axis">
      <div className="rh-axis-track">
        <span className="rh-axis-line" />
        {before.length > 0 && <span className="rh-axis-before" title={`${before.length} sprzed okresu`} aria-hidden="true" />}
        {todayPos > 0 && todayPos < 100 && <span className="rh-axis-today" style={{ left: `${todayPos}%` }} aria-hidden="true" />}
        {inPeriod.map((n, i) => (
          <button key={n.id} type="button" className={active === n.id ? 'rh-axis-dot active' : 'rh-axis-dot'}
            style={{ left: `${pos(n.observedOn)}%` }} aria-label={`Notatka ${i + 1}, ${fmtDate(n.observedOn)}`}
            onMouseEnter={() => onActive(n.id)} onMouseLeave={() => onActive(null)} onFocus={() => onActive(n.id)} onBlur={() => onActive(null)}>
            {i + 1}
          </button>
        ))}
      </div>
      <div className="rh-axis-ends"><span>{fmtDate(start)}</span><span>{endLabel ?? monthYear(end)}</span></div>
    </div>
  )
}

/** Karty notatek z numerami jak na osi. */
export function NoteCards({ notes, active, onActive, empty }: { notes: Note[]; active: number | null; onActive: (id: number | null) => void; empty: ReactNode }) {
  if (notes.length === 0) return <p className="rh-muted">{empty}</p>
  let k = 0
  return (
    <ul className="rh-note-list">
      {notes.map((n) => {
        const num = n.inPeriod ? ++k : null
        return (
          <li key={n.id} className={['rh-note', active === n.id && 'active', !n.inPeriod && 'out'].filter(Boolean).join(' ')}
            onMouseEnter={() => onActive(n.id)} onMouseLeave={() => onActive(null)}>
            <span className="rh-note-head">
              {num != null ? <span className="rh-note-num" aria-hidden="true">{num}</span> : <span className="rh-note-num out" aria-hidden="true">·</span>}
              <time>{fmtDate(n.observedOn)}</time>
              {!n.inPeriod && <span className="sr-only">(sprzed okresu oceny)</span>}
            </span>
            <span>{[n.situation, n.action, n.result].filter(Boolean).join(' ')}</span>
          </li>
        )
      })}
    </ul>
  )
}

/** Panel „Notatki · n” z osią okresu (prawa kolumna kroku). */
export function NotesAside({ notes: raw, start, end, error, empty }: { notes: Note[]; start: string | null; end: string | null; error?: string; empty: ReactNode }) {
  const [active, setActive] = useState<number | null>(null)
  const notes = byDate(raw)
  return (
    <aside className="rh-aside" aria-labelledby="rh-aside-title">
      <h3 id="rh-aside-title" className="rh-aside-tab">Notatki · {notes.filter((n) => n.inPeriod).length}</h3>
      {error ? <p className="rh-muted">{error}</p> : (
        <>
          {start && end && notes.length > 0 && <PeriodAxis start={start} end={end} notes={notes} active={active} onActive={setActive} />}
          <NoteCards notes={notes} active={active} onActive={setActive} empty={empty} />
        </>
      )}
    </aside>
  )
}

/** 6 → „6,0”, 6.33 → „6,33” (jak w makiecie: jedno miejsce, chyba że drugie coś znaczy). */
export const fmtAvg = (n: number) => (Math.round(n * 10) === n * 10 ? n.toFixed(1) : n.toFixed(2)).replace('.', ',')

/**
 * Jedyna skala decyzji: 5 kafli, nad nimi cienka oś z podziałkami w środkach kafli i kropką średniej
 * (w remisie kropka między wartościami). „▲ sugestia” pod kaflem (nie zaznacza się sam).
 */
export function ScaleTiles({ scale, value, suggested, mean, disabled, label, onPick, describedBy }: {
  scale: ScaleOption[]
  value: number | null
  suggested: number[]
  mean: number | null
  disabled: boolean
  label: string
  onPick: (v: number) => void
  describedBy?: string
}) {
  const values = scale.map((o) => o.value)
  const n = values.length
  // Pozycja średniej: interpolacja między środkami sąsiednich kafli.
  let meanPos: number | null = null
  if (mean != null && n > 1) {
    const i = Math.max(0, Math.min(n - 2, values.findIndex((_, k) => k < n - 1 && mean <= values[k + 1])))
    const t = Math.max(0, Math.min(1, (mean - values[i]) / (values[i + 1] - values[i])))
    meanPos = ((i + 0.5 + t) / n) * 100
  }
  // Karta 04: przy pierwszym pokazaniu średnia „jedzie” od punktu startu (środek skali, „na poziomie”) do wartości.
  const startPos = n > 0 ? ((Math.floor(n / 2) + 0.5) / n) * 100 : 50
  const [shownPos, setShownPos] = useState<number | null>(() => (meanPos != null && !reducedMotion() ? startPos : meanPos))
  useEffect(() => {
    if (meanPos == null) { setShownPos(null); return }
    if (shownPos == null && !reducedMotion()) {
      setShownPos(startPos)
      return
    }
    if (shownPos === meanPos) return
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => setShownPos(meanPos)))
    return () => cancelAnimationFrame(raf)
  }, [meanPos, shownPos, startPos])
  const markPos = shownPos ?? (reducedMotion() ? meanPos : startPos)
  const lower = (o: ScaleOption) => o.label.charAt(0).toLowerCase() + o.label.slice(1)
  const short = (o: ScaleOption) => lower(o).replace(' oczekiwań', '')
  return (
    <div className="rh-scale-wrap" style={{ ['--n' as string]: n }}>
      <div className="rh-scale-axis" aria-hidden={meanPos == null}>
        <span className="rh-scale-axis-line" />
        {values.map((v, i) => <span key={v} className="rh-scale-tick" style={{ left: `${((i + 0.5) / n) * 100}%` }} />)}
        {meanPos != null && (
          <>
            <span className="rh-scale-mean" style={{ left: `${markPos}%` }} />
            <span className="rh-scale-mean-label" style={{ left: `${markPos}%` }}>średnia {fmtAvg(mean!)}</span>
          </>
        )}
      </div>
      <div className="rh-tiles" role="radiogroup" aria-label={label} aria-describedby={describedBy}>
        {scale.map((o) => {
          const checked = value === o.value
          return (
            <button key={o.value} type="button" role="radio" aria-checked={checked} disabled={disabled}
              className={checked ? 'rh-tile selected' : 'rh-tile'} onClick={() => onPick(o.value)}
              aria-label={`${o.value} · ${lower(o)}${suggested.includes(o.value) ? ' (sugestia)' : ''}`}>
              {checked && <span className="rh-tile-check" aria-hidden="true">✓</span>}
              <strong aria-hidden="true">{o.value}</strong>
              <span aria-hidden="true">{short(o)}</span>
            </button>
          )
        })}
      </div>
      <div className="rh-tiles rh-tiles-marks" aria-hidden="true">
        {scale.map((o) => suggested.includes(o.value)
          ? <span key={`${o.value}-s`} className="mw-sugg">▲ sugestia</span>
          : <span key={o.value} />)}
      </div>
    </div>
  )
}

/** Krótkie nazwy osi radaru (pełna nazwa kryterium jest za długa na podpis). */
const SHORT: Record<string, string> = {
  knowledge: 'Wiedza', reliability: 'Rzetelność', organization: 'Organizacja pracy', cooperation: 'Współpraca',
  communication: 'Komunikacja', crisis_management: 'Sytuacje kryzysowe', people_management: 'Zarządzanie ludźmi',
  decisions: 'Decyzje', strategic_management: 'Zarządzanie strategiczne', analytical_thinking: 'Myślenie analityczne',
  customer_orientation: 'Orientacja na klienta', creativity: 'Kreatywność', negotiation: 'Negocjacje', public_speaking: 'Wystąpienia publiczne',
}
export const shortCriterion = (key: string, label: string) => SHORT[key] ?? (label.length > 22 ? `${label.slice(0, 20)}…` : label)
