// „Mój zespół” (H01 v2): cykle ocen na wspólnej osi lat. Czas miniony cienki i szary, pozostały z obrysem,
// romb końcowy z datą oceny; akcent i słowo stanu tylko przy osobach z akcją. Etapy w dymku (hover i focus).
import { useId, useState, type CSSProperties } from 'react'
import { Avatar } from './Avatar'
import { monthYear, stageLabel, stagePos, todayIso, yearFrac } from './dash-model'
import { fmtDate, type Progress } from './evaluation/types'

export type TimelineRow = {
  id: number
  name: string
  progress: Progress | null
  /** Osoba ma teraz sprawę do załatwienia (akcent, pogrubienie, słowo stanu). */
  action: boolean
  start: string | null
  end: string | null
}

export function DashTimeline({ rows, onOpenEvaluation, onOpenProfile }: {
  rows: TimelineRow[]
  onOpenEvaluation: (id: number) => void
  onOpenProfile: (employeeId: number) => void
}) {
  const today = todayIso()
  const dates = rows.flatMap((r) => [r.start, r.end]).filter((d): d is string => !!d)
  const y0 = Math.floor(Math.min(yearFrac(today), ...dates.map(yearFrac)))
  const y1 = Math.max(y0 + 2, Math.ceil(Math.max(yearFrac(today), ...dates.map(yearFrac)) + 0.02))
  const pos = (iso: string) => ((yearFrac(iso) - y0) / (y1 - y0)) * 100
  const years = Array.from({ length: y1 - y0 }, (_, i) => y0 + i)
  const now = pos(today)

  // Najpierw osoby z akcją (kolejność z pulpitu), potem według terminu oceny.
  const sorted = [...rows].sort((a, b) => Number(b.action) - Number(a.action)
    || (a.action ? (a.progress?.daysLeft ?? 0) - (b.progress?.daysLeft ?? 0) : (a.end ?? '9').localeCompare(b.end ?? '9')))

  return (
    <div className="dash-tl" style={{ '--now': `${now}%` } as CSSProperties}>
      <div className="dash-tl-axis" aria-hidden="true">
        <span />
        <span className="dash-tl-years">
          {years.map((y) => <span key={y} style={{ left: `${pos(`${y}-01-01`)}%` }}>{y}</span>)}
          <span className="dash-tl-today" style={{ left: `${now}%` }}>dziś</span>
        </span>
        <span />
      </div>
      <ul className="dash-tl-rows">
        {sorted.map((r) => <Row key={r.id} r={r} pos={pos} now={now} onOpenEvaluation={onOpenEvaluation} onOpenProfile={onOpenProfile} />)}
      </ul>
      <span className="dash-tl-grid" aria-hidden="true">
        {years.map((y) => <span key={y} style={{ left: `${pos(`${y}-01-01`)}%` }} />)}
        <span className="dash-tl-nowline" style={{ left: `${now}%` }} />
      </span>
    </div>
  )
}

function Row({ r, pos, now, onOpenEvaluation, onOpenProfile }: {
  r: TimelineRow
  pos: (iso: string) => number
  now: number
  onOpenEvaluation: (id: number) => void
  onOpenProfile: (employeeId: number) => void
}) {
  const [open, setOpen] = useState(false)
  const tip = useId()
  const p = r.progress
  const s = p ? stagePos(p) : null
  const start = r.start ? pos(r.start) : null
  const end = r.end ? pos(r.end) : null
  const label = p ? `${r.name}: ${stageLabel(p)}${r.end ? `, ocena ${fmtDate(r.end)}` : ''}` : r.name

  return (
    <li className={r.action ? 'action' : undefined}>
      <span className="dash-tl-who">
        <Avatar path={`org/${r.id}/avatar`} name={r.name} size={32} decorative />
        <button type="button" className="link" onClick={() => onOpenProfile(r.id)}>{r.name}</button>
      </span>
      <span className="dash-tl-track">
        {p && end != null && (
          <button type="button" className="dash-tl-bar" aria-label={label} aria-describedby={tip}
            onClick={() => onOpenEvaluation(p.evaluationId)}
            onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}
            onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}
            onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}>
            {start != null && start < now && <span className="dash-tl-past" style={{ left: `${start}%`, width: `${now - start}%` }} />}
            <span className="dash-tl-left" style={{ left: `${Math.max(now, start ?? now)}%`, width: `${Math.max(0, end - Math.max(now, start ?? now))}%` }} />
            {r.action && <span className={`dash-tl-now${s?.first ? ' first' : ''}`} style={{ left: `${now}%` }} />}
            <span className="dash-tl-end" style={{ left: `${end}%` }} />
            <span className="dash-tl-date" style={{ left: `${end}%` }}>{monthYear(r.end!)}</span>
          </button>
        )}
        {p && s && (
          <span role="tooltip" id={tip} className="dash-tl-tip" data-open={open || undefined}
            style={{ left: `${Math.min(70, Math.max(0, now - 10))}%` }}>
            {s.labels.map((l, i) => (
              <span key={l} className={i === s.index ? 'now' : i < s.index ? 'done' : undefined}>
                {l}{i === s.index && p.dueTo ? ` · do ${fmtDate(p.dueTo).slice(0, 5)}` : ''}
              </span>
            ))}
            {r.end && <span className="end">Ocena · {fmtDate(r.end)}</span>}
          </span>
        )}
      </span>
      <span className="dash-tl-state">
        {r.action && p ? <>{s?.first && <span className="dash-first" aria-hidden="true">◆</span>}{stageLabel(p)}</> : !p ? <span className="dash-muted">brak oceny</span> : null}
      </span>
    </li>
  )
}
