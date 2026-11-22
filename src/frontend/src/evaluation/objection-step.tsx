// H16 v2 · Sprzeciw (etap `objection` szablonu okresowego, art. 83 ustawy o służbie cywilnej).
// Co daje API: etap opcjonalny bez pól. POST stages/objection/complete = „sprzeciw wniesiony” (status objection_filed),
// POST stages/objection/skip = „brak sprzeciwu”. Treści sprzeciwu ani decyzji dyrektora generalnego API nie przechowuje,
// więc część „decyzja” jest tylko do odczytu (konsekwencje z ustawy i Poradnika), bez zapisu.
import { useState } from 'react'
import { api } from '../api'
import { Avatar } from '../Avatar'
import { Info, Ring, Source, Warn, useStepHeader } from '../v2'
import type { StepProps } from './common'
import './objection.css'
import { answerOf, daysUntil, fmtDate, plural, today, type Detail } from './types'

const DAY = 86_400_000
const USTAWA = 'Ustawa o służbie cywilnej'
const addDays = (iso: string, days: number) => new Date(Date.parse(iso.slice(0, 10)) + days * DAY).toISOString().slice(0, 10)
const firstName = (name: string | null | undefined) => (name ?? '').split(/\s+/)[0] || '—'
const genitive = (name: string) => (name.endsWith('a') ? `${name.slice(0, -1)}y` : `${name}a`)

/** Uzasadnienie oceny z arkusza (pole longText wymagane przy wyniku negatywnym). */
function justificationOf(detail: Detail): string | null {
  const field = detail.schema.sections.flatMap((s) => s.fields).find((f) => f.type === 'longText' && f.requiredWhen)
  return field ? answerOf(detail, field.key)?.valueText ?? null : null
}

const Icon = ({ d, size = 18 }: { d: string; size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
)
const GAVEL = 'M4 20h10M7 15l7-7M11 4l6 6M9 6l6 6-3 3-6-6z'
const SHIELD = 'M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z'
const DOC = 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h6'
const EDIT = 'M4 20l1-4L16 5l3 3L8 19zM14 7l3 3'

export function ObjectionStep({ detail, steps, go, reload }: StepProps) {
  useStepHeader('Sprzeciw')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const stage = detail.stages.find((s) => s.key === 'objection')
  const ackStepKey = steps.find((s) => s.id === 'ack')?.stageKey
  const ack = detail.stages.find((s) => s.key === ackStepKey)
  const person = firstName(detail.employeeName)
  const evaluator = detail.evaluatorName ?? '—'

  if (!stage) return <p className="muted">Ten arkusz nie ma etapu sprzeciwu.</p>

  async function act(action: 'complete' | 'skip') {
    setBusy(true)
    try {
      if (action === 'complete') await api(`evaluations/${detail.id}/stages/${stage!.key}/complete`, 'POST', { completedOn: today() })
      else await api(`evaluations/${detail.id}/stages/${stage!.key}/skip`, 'POST')
      setError('')
      await reload()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  // Przed zapoznaniem okno sprzeciwu się nie otworzyło (7 dni liczy się od zapoznania, art. 83 ust. 1).
  if (ack?.status !== 'Completed') {
    return (
      <div className="step obj">
        <section className="card obj-empty">
          <span className="obj-empty-icon"><Icon d={GAVEL} size={28} /></span>
          <p><strong>Okno sprzeciwu otworzy się po zapoznaniu z oceną.</strong> 7 dni od zapoznania. <Source refText={`${USTAWA} · art. 83 ust. 1`} /></p>
          {steps.some((s) => s.id === 'ack') && <button type="button" onClick={() => go('ack')}>Przejdź do: Zapoznanie</button>}
        </section>
      </div>
    )
  }

  const filed = stage.status === 'Completed'
  const skipped = stage.status === 'Skipped'
  const open = stage.status === 'Pending'
  // Termin: przy otwartym oknie — 7 dni na wniesienie (z API), po wniesieniu — 14 dni na rozpatrzenie (art. 83 ust. 3, liczone od daty wniesienia).
  const due = filed && stage.completedOn ? addDays(stage.completedOn, 14) : stage.dueTo ?? (ack.completedOn ? addDays(ack.completedOn, 7) : null)
  const left = daysUntil(due)
  const ringMax = filed ? 14 : 7

  return (
    <div className="step obj">
      <div className="obj-head">
        <div className="obj-head-who">
          <span className={`obj-chip${filed ? ' strong' : ''}`}>
            <Icon d={filed ? GAVEL : skipped ? SHIELD : EDIT} size={16} />
            {filed ? 'Sprzeciw · do rozpatrzenia' : skipped ? 'Bez sprzeciwu' : 'Okno sprzeciwu'}
          </span>
          <span className="obj-mini"><Avatar path={null} name={evaluator} size={28} decorative /> {evaluator}</span>
        </div>
        {!skipped && left != null && due && (
          <div className="obj-term">
            <Ring value={left} max={ringMax} size={84} overdue={left < 0} caption={Math.abs(left) === 1 ? 'dzień' : 'dni'}
              label={`${filed ? 'Rozpatrzenie' : 'Sprzeciw'}: ${left < 0 ? 'po terminie' : `zostało ${left} ${plural(left, 'dzień', 'dni', 'dni')}`}`} />
            <p>
              <strong>{filed ? 'Rozpatrz do' : 'Sprzeciw do'} {fmtDate(due)}</strong>
              <Source align="end" refText={filed
                ? `${USTAWA} · art. 83 ust. 3: 14 dni od wniesienia; obejmuje też poprawkę oceny (Poradnik s. 33)`
                : `${USTAWA} · art. 83 ust. 1: 7 dni od zapoznania`} />
            </p>
          </div>
        )}
      </div>

      <div className="obj-grid">
        <div className="obj-col">
          <section className="card obj-card obj-sides" aria-label="Stanowiska">
            <div className="obj-side">
              <p className="obj-side-head"><Avatar path={`org/${detail.employeeId}/avatar`} name={detail.employeeName} size={32} decorative /> <strong>Wniosek {genitive(person)}</strong></p>
              {filed ? (
                <p className="obj-quote muted">Treść na piśmie <Info label="Treść sprzeciwu">Busola odnotowuje tylko wniesienie sprzeciwu i jego datę. Treść wpływa na piśmie do dyrektora generalnego.</Info></p>
              ) : (
                <p className="obj-quote muted">{skipped ? 'Nie wniesiono.' : 'Jeszcze nie wniesiono.'}</p>
              )}
              <span className="obj-tag">✓ Zapoznanie {fmtDate(ack.completedOn).slice(0, 5)}{filed && stage.completedOn ? ` · sprzeciw ${fmtDate(stage.completedOn).slice(0, 5)}` : ''}</span>
            </div>
            <div className="obj-side">
              <p className="obj-side-head"><Avatar path={null} name={evaluator} size={32} decorative /> <strong>Uzasadnienie {genitive(firstName(evaluator))}</strong></p>
              <p className="obj-quote">{justificationOf(detail) ? `„${justificationOf(detail)}”` : <span className="muted">Bez uzasadnienia w arkuszu.</span>}</p>
              {steps.some((s) => s.id === 'result') && <button type="button" className="link" onClick={() => go('result')}>Arkusz →</button>}
            </div>
          </section>

          <ScoresCard detail={detail} />
        </div>

        {!skipped && (
          <section className="card obj-card obj-decision" aria-labelledby="obj-dec">
            <h3 id="obj-dec">Decyzja dyrektora generalnego</h3>
            <ul className="obj-options">
              <li className="obj-option">
                <strong>Uwzględnia</strong>
                <ul className="obj-cons">
                  <li><span className="obj-ci"><Icon d={EDIT} size={16} /></span> Zmiana albo ponowne sporządzenie <Source refText={`${USTAWA} · art. 83 ust. 4`} /></li>
                  <li><span className="obj-ci"><Avatar path={null} name={evaluator} size={24} decorative /></span> {firstName(evaluator)} wykona</li>
                  <li><span className="obj-ci"><Icon d={SHIELD} size={16} /></span> Bez obniżania <Source align="end" refText="Poradnik KPRM (oceny okresowe) · s. 32: uwzględnienie sprzeciwu nie może obniżyć oceny ani jej elementów" /></li>
                </ul>
              </li>
              <li className="obj-option">
                <strong>Nie uwzględnia</strong>
                <ul className="obj-cons">
                  <li><span className="obj-ci"><Icon d={GAVEL} size={16} /></span> Sąd pracy · 14 dni <Source align="end" refText={`${USTAWA} · art. 83 ust. 5: 14 dni od doręczenia decyzji albo od upływu terminu z ust. 3`} /></li>
                  <li><span className="obj-ci"><Icon d={DOC} size={16} /></span> Uzasadnienie wymagane <Info align="end" label="Uzasadnienie">Zasada Busoli i zalecenie Poradnika: odmowę zawsze uzasadnij na piśmie.</Info></li>
                </ul>
              </li>
            </ul>
            {filed && <Warn>Decyzję zapisuje dyrektor generalny poza Busolą.</Warn>}
          </section>
        )}
      </div>

      {open && detail.canEdit && (
        <div className="step-actions obj-actions">
          <span className="grow" />
          <button type="button" className="secondary" disabled={busy} onClick={() => act('skip')}>Brak sprzeciwu</button>
          <button type="button" disabled={busy} onClick={() => act('complete')}>Odnotuj sprzeciw</button>
        </div>
      )}
      {error && <p role="alert" className="error">{error}</p>}
    </div>
  )
}

/** Oceny cząstkowe jako kropki 1/3/5/7/9 z liczbą, średnia i poziom (z `detail.scoring`). */
function ScoresCard({ detail }: { detail: Detail }) {
  const s = detail.scoring
  if (!s || s.criteria.length === 0) return null
  const points = [1, 3, 5, 7, 9]
  return (
    <section className="card obj-card" aria-labelledby="obj-scores">
      <h3 id="obj-scores">Ocena</h3>
      <ul className="obj-scores">
        {s.criteria.map((c) => (
          <li key={c.key}>
            <span className="obj-crit">{c.label}</span>
            <span className="obj-dots" aria-hidden="true">
              {points.map((p) => <span key={p} className={c.score === p ? 'on' : ''} />)}
            </span>
            <strong className="obj-num">{c.score ?? '—'}<span className="sr-only"> pkt</span></strong>
          </li>
        ))}
      </ul>
      <p className="obj-avg">
        <span>Średnia</span>
        <strong>{s.average != null ? s.average.toFixed(2).replace('.', ',') : '—'}</strong>
        {s.levelLabel && <span className="obj-chip">{s.levelLabel}</span>}
        <Source align="end" refText="Rozp. 2016 · § 11 ust. 1 pkt 2" />
      </p>
    </section>
  )
}
