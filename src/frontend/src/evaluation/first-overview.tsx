// H15 v2 · Pierwsza ocena — przegląd w kroku „Ścieżka i terminy”: bohater „co teraz” (pierścień dni bieżącego etapu),
// oś 12 miesięcy z kamieniami milowymi z etapów API i 4 warunki oceny pozytywnej z `schema.scoring.positiveWhen`.
// Dane: detail.stages (dueFrom/dueTo/status), GET evaluations/{id}/terms (contractEnd), answers + prefill + scoring.
import { Avatar } from '../Avatar'
import { Info, Ring, Source } from '../v2'
import { useApi } from './data'
import './first-overview.css'
import {
  daysUntil, fmtDate, scoresFieldOf, valueOf, type Detail, type EvaluationTerms, type PositiveRule, type Stage,
} from './types'

const DAY = 86_400_000
const rozp = (ref: string) => `Rozp. 2015 · ${ref}`

function addMonths(iso: string, months: number): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() + months)
  return d.toISOString().slice(0, 10)
}
const addDays = (iso: string, days: number) => new Date(Date.parse(iso.slice(0, 10)) + days * DAY).toISOString().slice(0, 10)
const shortDate = (iso: string | null | undefined) => fmtDate(iso).slice(0, 5)

/** Pierwsze słowo tytułu etapu z fazy szablonu („Rozmowa wstępna”, „Sprawozdanie”, „Ocena”). */
function phaseOf(detail: Detail, stage: Stage) {
  return detail.schema.stages?.find((s) => s.key === stage.key)?.phase ?? stage.title
}
function legalOf(detail: Detail, key: string) {
  return detail.schema.stages?.find((s) => s.key === key)?.legalRef ?? null
}

/** Stan warunku: true spełniony, false niespełniony, null — jeszcze nie wiadomo (brak danych). */
function ruleState(detail: Detail, rule: PositiveRule): boolean | null {
  if (rule.rule === 'fieldIn' && rule.field) {
    const v = valueOf(detail, rule.field)?.valueText
    return v ? (rule.values ?? []).includes(v) : null
  }
  const crit = detail.scoring?.criteria ?? []
  if (rule.rule === 'maxCountOfScore') {
    if (crit.length === 0 || crit.some((c) => c.score == null)) return null
    return crit.filter((c) => c.score === rule.score).length <= (rule.count ?? 0)
  }
  if (rule.rule === 'minAverage') {
    const avg = detail.scoring?.average
    return avg == null ? null : avg >= (rule.value ?? 0)
  }
  return null
}

const FileIcon = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h6" />
  </svg>
)
const CalIcon = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="5" width="16" height="16" rx="2" /><path d="M8 3v4M16 3v4M4 10h16" />
  </svg>
)
const Pencil = () => (
  <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M3 13l1-3.5L10.5 3 13 5.5 6.5 12zM9.5 4l2.5 2.5" /></svg>
)
const Flag = () => (
  <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 14V2.5M4 3h7l-1.5 3L11 9H4" /></svg>
)
const Check = () => (
  <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3.5 8.4l3 3 6-6.4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
)

/** Przegląd pierwszej oceny (H15). `next` = główna akcja obok pierścienia (przejście do kolejnego kroku kreatora). */
export function FirstOverview({ detail, next }: { detail: Detail; next: { label: string; onGo: () => void } | null }) {
  const terms = useApi<EvaluationTerms>(`evaluations/${detail.id}/terms`)
  const start = detail.startDate.slice(0, 10)
  // Umowa na 12 miesięcy (art. 35 ust. 1 ustawy); przedłużenie z API (contractEnd) ma pierwszeństwo.
  const contractEnd = terms.data?.contractEnd ?? addDays(addMonths(start, 12), -1)
  const span = Math.max(1, Date.parse(contractEnd) - Date.parse(start))
  const at = (iso: string) => Math.min(100, Math.max(0, ((Date.parse(iso.slice(0, 10)) - Date.parse(start)) / span) * 100))
  const months = Array.from({ length: 13 }, (_, i) => ({ i, left: at(addMonths(start, i)) }))

  const stage = (key: string) => detail.stages.find((s) => s.key === key)
  const interview = stage('initial_interview') ?? detail.stages[0]
  const report = stage('report')
  const evaluation = stage('evaluation')
  const current = detail.stages.find((s) => s.key === detail.currentStageKey) ?? detail.stages.find((s) => s.status === 'Pending')
  const todayIso = new Date().toISOString().slice(0, 10)
  const left = current ? daysUntil(current.dueTo) : null
  const ringMax = current?.dueTo ? Math.max(1, Math.round((Date.parse(current.dueTo) - Date.parse(current.dueFrom ?? start)) / DAY)) : 1
  const currentRef = current ? legalOf(detail, current.key) : null

  const rules = detail.schema.scoring?.positiveWhen ?? []
  const states = rules.map((r) => ruleState(detail, r))
  const met = states.filter((s) => s === true).length
  const scale = scoresFieldOf(detail.schema)?.scale ?? []

  const milestones = [
    interview && { name: phaseOf(detail, interview), date: `do ${fmtDate(interview.dueTo)}`, state: interview.status },
    report && { name: 'Sprawozdanie', date: `${fmtDate(report.dueFrom)} – ${fmtDate(report.dueTo)}`, state: report.status },
    evaluation && { name: 'Okno oceny', date: `${fmtDate(evaluation.dueFrom)} – ${fmtDate(evaluation.dueTo)}`, state: evaluation.status },
    { name: 'Koniec umowy', date: fmtDate(contractEnd), state: '' },
  ].filter(Boolean) as { name: string; date: string; state: string }[]
  const stateWord = (s: string) => (s === 'Completed' ? ', zakończone' : s === 'Skipped' ? ', pominięte' : s === 'Pending' ? ', przed nami' : '')

  return (
    <div className="fo">
      <div className="fo-meta">
        <span className="fo-muted">Umowa {fmtDate(start)} – {fmtDate(contractEnd)}</span>
        <span className="grow" />
        {detail.unitHeadName ? (
          <span className="fo-person">
            <Avatar path={null} name={detail.unitHeadName} size={40} decorative />
            <span><strong>{detail.unitHeadName}</strong><span className="fo-muted">kierujący komórką</span></span>
          </span>
        ) : (
          <span className="fo-muted">Kierujący komórką: — <Info align="end" label="Kierujący komórką">Współtworzy pierwszą ocenę i podpisuje jej potwierdzenie. Wskaż go w module Wydziały.</Info></span>
        )}
      </div>

      <section className="card fo-card" aria-labelledby="fo-now">
        <div className="fo-hero">
          {current && left != null && (
            <Ring value={left} max={ringMax} size={84} caption={Math.abs(left) === 1 ? 'dzień' : 'dni'} overdue={current.overdue || left < 0}
              label={`${phaseOf(detail, current)}: ${left < 0 ? 'po terminie' : `zostało ${left} dni`}`} />
          )}
          <div className="fo-hero-text">
            <h3 id="fo-now">{current ? phaseOf(detail, current) : detail.statusLabel}</h3>
            {current?.dueTo && (
              <p className="fo-muted">
                {current.dueFrom ? `${fmtDate(current.dueFrom)} – ${fmtDate(current.dueTo)}` : `do ${fmtDate(current.dueTo)}`}
                {currentRef && <Source refText={rozp(currentRef)} />}
              </p>
            )}
          </div>
          <span className="grow" />
          {next && <button type="button" onClick={next.onGo}>{next.label}</button>}
        </div>

        <div className="fo-axiswrap">
        <div className="fo-axis" aria-hidden="true">
          <div className="fo-track" />
          {evaluation?.dueFrom && evaluation.dueTo && (
            <div className="fo-window" style={{ left: `${at(evaluation.dueFrom)}%`, width: `${at(evaluation.dueTo) - at(evaluation.dueFrom)}%` }} />
          )}
          {report?.dueFrom && report.dueTo && (
            <div className="fo-band" style={{ left: `${at(report.dueFrom)}%`, width: `${at(report.dueTo) - at(report.dueFrom)}%` }} />
          )}
          <div className="fo-today" style={{ left: `${at(todayIso)}%` }}><span>dziś</span></div>
          {interview?.dueTo && (
            <span className={`fo-dot${interview.status === 'Completed' ? ' done' : ''}`} style={{ left: `${at(interview.dueTo)}%` }}>
              {interview.status === 'Completed' ? <Check /> : <Pencil />}
            </span>
          )}
          <span className="fo-dot fo-flag" style={{ left: '100%' }}><Flag /></span>
          {months.map((m) => (
            <span key={m.i} className="fo-tick" style={{ left: `${m.left}%` }}><span>{m.i}</span></span>
          ))}
          {interview?.dueTo && (
            <span className="fo-label below" style={{ left: `${at(interview.dueTo)}%` }}><strong>{fmtDate(interview.dueTo)}</strong></span>
          )}
          {evaluation?.dueFrom && (
            <span className="fo-label below" style={{ left: `${at(evaluation.dueFrom)}%` }}>
              <strong>Ocena</strong><span>{shortDate(evaluation.dueFrom)}–{shortDate(evaluation.dueTo)}</span>
            </span>
          )}
          <span className="fo-label below end" style={{ left: '100%' }}><strong>Koniec umowy</strong><span>{fmtDate(contractEnd)}</span></span>
        </div>
        {/* Podpisy nad pasmem sprawozdania z ⓘ i ↗ są interaktywne, więc poza warstwą aria-hidden. */}
        {report?.dueFrom && (
          <div className="fo-above" style={{ left: `${at(report.dueFrom)}%` }}>
            <strong>Sprawozdanie</strong>
            <Info label="Sprawozdanie" align="end">Obejmuje co najmniej 7 przepracowanych miesięcy (§ 6 ust. 1). Termin ustala przełożona w rozmowie wstępnej.</Info>
            <Source refText={rozp('§ 4 ust. 1')} />
          </div>
        )}
        </div>
        <ol className="sr-only" aria-label="Kamienie milowe pierwszej oceny">
          {milestones.map((m) => <li key={m.name}>{m.name}: {m.date}{stateWord(m.state)}</li>)}
        </ol>
      </section>

      {rules.length > 0 && (
        <section className="card fo-card" aria-labelledby="fo-cond">
          <div className="fo-cond-head">
            <h3 id="fo-cond">Ocena pozytywna, gdy</h3>
            <Source refText={rozp('§ 10 ust. 1')} />
            <span className="fo-count" aria-label={`Spełnione ${met} z ${rules.length}`}>{met} / {rules.length}</span>
          </div>
          <div className="fo-cond">
            <ul className="fo-tiles">
              {rules.map((r, i) => <RuleTile key={i} rule={r} state={states[i]} />)}
            </ul>
            {scale.length > 0 && <ScaleMap values={scale.map((o) => o.value)} />}
          </div>
        </section>
      )}
    </div>
  )
}

function RuleTile({ rule, state }: { rule: PositiveRule; state: boolean | null }) {
  const stateText = state === true ? 'spełniony' : state === false ? 'niespełniony' : 'jeszcze nie wiadomo'
  let icon, title, sub, info
  if (rule.rule === 'fieldIn' && rule.field === 'exam') {
    icon = <span className="fo-ibox"><FileIcon /></span>; title = 'Egzamin'; sub = 'zaliczony'
    info = 'O ile obowiązywał. Służba przygotowawcza kończy się najpóźniej w 8. miesiącu.'
  } else if (rule.rule === 'fieldIn') {
    icon = <span className="fo-ibox"><CalIcon /></span>; title = 'Sprawozdanie'; sub = 'w terminie'
  } else if (rule.rule === 'maxCountOfScore') {
    icon = <span className="fo-big">≤ {rule.count}</span>; title = `Najwyżej ${rule.count === 1 ? 'jedna' : rule.count} ${rule.score}`
  } else {
    icon = <span className="fo-big">≥ {rule.value}</span>; title = 'Średnia'
  }
  return (
    <li className={`fo-tile${state === true ? ' met' : state === false ? ' unmet' : ''}`}>
      {icon}
      <span className="fo-tile-title">{title}{info && <Info label={title}>{info}</Info>}</span>
      {sub && <span className="fo-muted">{sub}</span>}
      {state !== null && <span className="fo-tile-state">{state ? <Check /> : '✕'} {stateText}</span>}
      <span className="sr-only">Warunek {stateText}.</span>
    </li>
  )
}

/** Przeliczenie skali 1–9 (model kompetencji) na skalę 3/5/7: 1 i 3 → 3, 5 → 5, 7 i 9 → 7. */
function ScaleMap({ values }: { values: number[] }) {
  const map: [number, number][] = [[1, 3], [3, 3], [5, 5], [7, 7], [9, 7]]
  const x = (v: number) => 16 + ((v - 1) / 8) * 248
  const tx = (v: number) => x(v === 3 ? 2 : v === 7 ? 8 : 5)
  return (
    <div className="fo-scale">
      <p className="fo-scale-head">
        <strong>Skala {values.join(' / ')}</strong>
        <Info align="end" label="Przeliczenie skali">Zasada Busoli, nie przepis: przeliczenie to podpowiedź, ocenę {values.join('/')} wybiera przełożona.</Info>
      </p>
      <svg viewBox="0 0 280 96" width="100%" role="img" aria-label="1 i 3 to 3, 5 to 5, 7 i 9 to 7">
        {map.map(([from, to]) => (
          <path key={from} d={`M${x(from)} 26 C ${x(from)} 50, ${tx(to)} 48, ${tx(to)} 70`} className="fo-scale-line" />
        ))}
        {[1, 3, 5, 7, 9].map((v) => (
          <g key={v}><circle cx={x(v)} cy={16} r={12} className="fo-scale-from" /><text x={x(v)} y={21} textAnchor="middle">{v}</text></g>
        ))}
        {values.map((v) => (
          <g key={v}><circle cx={tx(v)} cy={80} r={14} className="fo-scale-to" /><text x={tx(v)} y={85} textAnchor="middle" className="fo-scale-to-text">{v}</text></g>
        ))}
      </svg>
    </div>
  )
}
