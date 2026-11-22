// H06 v2 · części ekranu notatek: oś okresu z kropkami notatek (szary obszar ostatnich 4 miesięcy, „dziś”, podgląd notatki)
// i mapa pokrycia wskaźników (kratki z liczbą, „0” z granatowym obrysem, zaznaczona kratka ustawia wskaźnik w formularzu).
import { Fragment, useState } from 'react'
import { Info } from '../v2'
import { CompetencyIcon, UiIcon } from './start-icons'
import { fmtDate, plural, type Note } from './types'

const notesWord = (n: number) => plural(n, 'notatka', 'notatki', 'notatek')

export type IndicatorOption = { key: string; text: string; criterionKey: string; criterionLabel: string }

const DAY = 86_400_000
const addMonths = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() + n)
  return d.toISOString().slice(0, 10)
}

/** Ostrzeżenie reguły (nie AI): granatowy obrys, ⚠ i słowo na #DCEEFB. */
export function WarnChip({ children, info }: { children: string; info?: string }) {
  return (
    <span className="nv2-warnchip">
      <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
        <path d="M12 3.5 21.5 20h-19z" /><path d="M12 10v4.5M12 17.2v.3" strokeLinecap="round" />
      </svg>
      <span>{children}</span>
      {info && <Info align="end" label="Skąd to ostrzeżenie">{info}</Info>}
    </span>
  )
}

export function NotesTimeline({ start, end, today, notes, options, recentShare }: {
  start: string
  end: string
  today: string
  notes: Note[]
  options: IndicatorOption[]
  recentShare: number | null
}) {
  const span = Math.max(DAY, Date.parse(end) - Date.parse(start))
  const pct = (iso: string) => Math.min(100, Math.max(0, ((Date.parse(iso) - Date.parse(start)) / span) * 100))
  const inPeriod = notes.filter((n) => n.inPeriod).sort((a, b) => a.observedOn.localeCompare(b.observedOn))
  const [selected, setSelected] = useState<number | null>(inPeriod[inPeriod.length - 1]?.id ?? null)
  const recentFrom = pct(addMonths(today, -4))
  const now = pct(today)
  const years: number[] = []
  for (let y = new Date(start).getUTCFullYear() + 1; y <= new Date(end).getUTCFullYear(); y++) years.push(y)

  // Kropki w koszykach co ok. 1,6% osi, ułożone w stos (beeswarm).
  const stacks = new Map<number, number>()
  const dots = inPeriod.map((n) => {
    const bin = Math.round(pct(n.observedOn) / 1.6)
    const level = stacks.get(bin) ?? 0
    stacks.set(bin, level + 1)
    return { note: n, left: bin * 1.6, level }
  })
  const current = dots.find((d) => d.note.id === selected)
  const indicator = (key: string | null) => options.find((o) => o.key === key)
  const heavy = recentShare != null && inPeriod.length >= 3 && recentShare >= 0.5

  return (
    <section className="card nv2-period" aria-labelledby="nv2-period-title">
      <div className="sv2-row-head">
        <h3 id="nv2-period-title" className="sv2-h3">Okres oceny</h3>
        <span className="grow" />
        {heavy && (
          <WarnChip info="Zasada Busoli, nie przepis: ocena ma objąć cały okres, a nie ostatnie wrażenie.">
            {`${Math.round(recentShare! * 100)}% z ostatnich 4 mies.`}
          </WarnChip>
        )}
      </div>
      <div className="nv2-axis">
        {inPeriod.length > 0 && <span className="nv2-recent" style={{ left: `${recentFrom}%`, width: `${Math.max(0, now - recentFrom)}%` }} aria-hidden="true" />}
        <span className="nv2-line" aria-hidden="true" />
        <span className="nv2-line-done" style={{ width: `${now}%` }} aria-hidden="true" />
        <span className="nv2-start" aria-hidden="true" />
        <span className="nv2-end" aria-hidden="true" />
        {years.map((y) => {
          const left = pct(`${y}-01-01`)
          return left > 6 && left < 94 ? <span key={y} className="nv2-year" style={{ left: `${left}%` }} aria-hidden="true">{y}</span> : null
        })}
        <span className="nv2-today" style={{ left: `${now}%` }} aria-hidden="true"><b>dziś</b></span>
        <ul className="nv2-dots" aria-label={`Notatki na osi okresu: ${inPeriod.length}`}>
          {dots.map(({ note, left, level }) => {
            const ind = indicator(note.indicatorKey)
            return (
              <li key={note.id} style={{ left: `${left}%`, bottom: `${22 + level * 13}px` }}>
                <button type="button" className={note.id === selected ? 'on' : undefined} aria-pressed={note.id === selected}
                  aria-label={`${fmtDate(note.observedOn)}${ind ? `, ${ind.criterionLabel}` : ''}`} onClick={() => setSelected(note.id)} />
              </li>
            )
          })}
        </ul>
      </div>
      <div className="nv2-axis-labels">
        <strong>{fmtDate(start)}</strong>
        <strong>{fmtDate(end)}</strong>
      </div>
      {current && (
        <div className="nv2-preview" style={{ marginLeft: `clamp(0px, calc(${current.left}% - 160px), calc(100% - 420px))` }} aria-live="polite">
          <div className="nv2-preview-head">
            <strong>{fmtDate(current.note.observedOn)}</strong>
            {indicator(current.note.indicatorKey) && (
              <span className="sv2-muted">{indicator(current.note.indicatorKey)!.criterionLabel}</span>
            )}
          </div>
          <p>{current.note.action || current.note.situation || current.note.result || '—'}</p>
        </div>
      )}
      {inPeriod.length === 0 && <p className="sv2-muted">Brak notatek w okresie oceny.</p>}
    </section>
  )
}

export function CoverageMap({ options, criteria, count, selected, onSelect }: {
  options: IndicatorOption[]
  criteria: { key: string; label: string }[]
  count: (indicatorKey: string) => number
  selected: string | null
  onSelect: (indicatorKey: string) => void
}) {
  const uncovered = options.filter((o) => count(o.key) === 0).length
  const tone = (n: number) => (n === 0 ? 'c0' : n === 1 ? 'c1' : n === 2 ? 'c2' : n === 3 ? 'c3' : 'c4')
  return (
    <section className="card nv2-map" aria-labelledby="nv2-map-title">
      <div className="sv2-row-head">
        <h3 id="nv2-map-title" className="sv2-h3">Pokrycie wskaźników</h3>
        <span className="grow" />
        {uncovered > 0 && <WarnChip>{`${uncovered} bez notatek`}</WarnChip>}
      </div>
      <div className="nv2-grid">
        {criteria.map((c) => {
          const items = options.filter((o) => o.criterionKey === c.key)
          if (items.length === 0) return null
          return (
            <Fragment key={c.key}>
              <span className="nv2-crit"><CompetencyIcon id={c.key} size={20} /><span>{c.label}</span></span>
              <ul className="nv2-cells" aria-label={c.label}>
                {items.map((o) => {
                  const n = count(o.key)
                  return (
                    <li key={o.key}>
                      <button type="button" className={`nv2-cell ${tone(n)}${selected === o.key ? ' on' : ''}`} aria-pressed={selected === o.key}
                        aria-label={`${c.label} · ${o.text} · ${n} ${notesWord(n)}`}
                        onClick={() => onSelect(o.key)}>
                        {n}
                        <span className="nv2-cell-tip" aria-hidden="true"><strong>{o.text}</strong><span>{n} {notesWord(n)}</span></span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </Fragment>
          )
        })}
      </div>
    </section>
  )
}

/** Baner trybu alertu (≤ 30 dni do terminu oceny): jedyna granatowa akcja „Przejdź do oceny”. */
export function DeadlineBanner({ left, uncovered, onGo }: { left: number; uncovered: number; onGo?: () => void }) {
  const days = Math.abs(left)
  const dni = plural(days, 'dzień', 'dni', 'dni')
  return (
    <div className="nv2-banner" role="status">
      <UiIcon name="clock" size={24} />
      <strong className="grow">
        {left < 0 ? `Termin oceny minął ${days} ${dni} temu` : `${days} ${dni} do oceny`}
        {uncovered > 0 && ` · ${uncovered} ${plural(uncovered, 'wskaźnik', 'wskaźniki', 'wskaźników')} bez notatek`}
      </strong>
      <Info align="end" label="Dlaczego teraz">Próg 30 dni to zasada Busoli, nie przepis: czas zaplanować rozmowę oceniającą.</Info>
      {onGo && <button type="button" onClick={onGo}><UiIcon name="arrow" size={18} /> Przejdź do oceny</button>}
    </div>
  )
}
