// H02 v2 · Rozpocznij ocenę: ścieżka w jednym wierszu, opis stanowiska → arkusz (fakt „0 podległych” połączony z wnioskiem),
// potwierdzenie „Opis aktualny”, a gdy dane wskazują koordynację — pytanie Tak → B / Nie → C (przełącznik arkusza z API).
import { useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { api } from '../api'
import { Info, Source, useStepHeader } from '../v2'
import { Pill, type StepProps } from './common'
import { useApi } from './data'
import { UiIcon } from './start-icons'
import { PERIODIC_REGULATION_URL, firstNameOf, nameCase, ospKey, reg, useLocalState, useOrg } from './start-model'
import { answerOf, fmtDate, isFirstTemplate, scoresFieldOf, sheetLetter, type Detail } from './types'

/** Nazwa stanowiska sugeruje kierowanie lub koordynację pracy (zasada Busoli: wtedy pytamy, a nie zgadujemy). */
const COORDINATION = /koordyn|kieru|kierown|zastępc/i

function positionOf(detail: Detail): string | null {
  return detail.employeePosition ?? answerOf(detail, 'evaluated', 'position')?.valueText ?? null
}

/** Łącznik od kafla z faktem do ramki wniosku: mierzy oba elementy i rysuje linię (łamaną, gdy są na różnych wysokościach). */
function useConnector(box: RefObject<HTMLElement | null>, from: RefObject<HTMLElement | null>, to: RefObject<HTMLElement | null>, deps: unknown[]) {
  const [line, setLine] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null)
  useLayoutEffect(() => {
    const measure = () => {
      const b = box.current?.getBoundingClientRect()
      const f = from.current?.getBoundingClientRect()
      const t = to.current?.getBoundingClientRect()
      // Gdy kafel i ramka są jedna pod drugą (wąski ekran), linii nie rysujemy.
      if (!b || !f || !t || t.left < f.right) return setLine(null)
      setLine({ x1: f.right - b.left, y1: f.top + f.height / 2 - b.top, x2: t.left - b.left, y2: t.top + t.height / 2 - b.top })
    }
    measure()
    const ro = new ResizeObserver(measure)
    if (box.current) ro.observe(box.current)
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return line
}

export function StartStep({ detail, steps, go, reload }: StepProps) {
  const first = isFirstTemplate(detail.templateCode)
  const notStarted = detail.phase === 'Oczekuje na start'
  useStepHeader(notStarted ? 'Rozpocznij ocenę' : 'Ścieżka oceny')
  const letter = sheetLetter(detail.templateCode)
  const templates = useApi<{ code: string; title: string }[]>('evaluation-templates')
  const periodic = (templates.data ?? []).filter((t) => t.code.startsWith('periodic-'))
  // Backend pozwala zmienić szablon tylko przed rozpoczęciem oceny (bez wpisów, podpisów, notatek).
  const canSwitch = detail.canEdit && notStarted && detail.answers.length === 0 && detail.signatures.length === 0
  const { reports } = useOrg(detail)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [pathOpen, setPathOpen] = useState(false)
  const [current, setCurrent] = useLocalState<boolean>(ospKey(detail.id), false)
  const [answer, setAnswer] = useState<'B' | 'C' | null>(null)
  const [askOpen, setAskOpen] = useState(false)
  const name = firstNameOf(detail.employeeName)
  const position = positionOf(detail)

  // Pytanie zamiast litery: stanowisko „koordynuje/kieruje”, ale bez podległych — albo dane kadrowe nie pasują do arkusza.
  const mismatch = reports != null && ((reports > 0 && letter === 'C') || (reports === 0 && letter === 'B'))
  const coordination = !!position && COORDINATION.test(position) && reports === 0
  const question = !first && (letter === 'B' || letter === 'C') && canSwitch && (mismatch || coordination || askOpen)
  const confirmed = !notStarted || !detail.canEdit || current
  const blockedReason = !confirmed ? 'Potwierdź, że opis stanowiska jest aktualny.'
    : question && !answer ? `Odpowiedz, czy ${name} kieruje pracownikami.` : ''

  async function switchTo(templateCode: string) {
    if (!canSwitch || busy || templateCode === detail.templateCode) return
    setBusy(true)
    try {
      await api(`evaluations/${detail.id}/template`, 'PUT', { templateCode })
      setError('')
      await reload()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function answerQuestion(value: 'B' | 'C') {
    setAnswer(value)
    const code = `periodic-${value.toLowerCase()}`
    if (code !== detail.templateCode && periodic.some((t) => t.code === code)) await switchTo(code)
  }

  const box = useRef<HTMLDivElement>(null)
  const fact = useRef<HTMLDivElement>(null)
  const reason = useRef<HTMLDivElement>(null)
  const line = useConnector(box, fact, reason, [question, reports, letter])
  const next = steps[steps.findIndex((s) => s.id === 'start') + 1]

  return (
    <div className="step sv2">
      <h2 className="sr-only">{notStarted ? 'Rozpocznij ocenę' : 'Ścieżka oceny'}</h2>

      <div className="sv2-pathrow">
        <span className="sv2-iconbox"><UiIcon name="cycle" size={20} /></span>
        <strong className="grow">{first ? `Pierwsza ocena · od ${fmtDate(detail.startDate)}` : 'Ocena okresowa · co 24 miesiące'}</strong>
        <span className="sv2-chip"><UiIcon name="idcard" size={16} /> Dane kadrowe</span>
        {canSwitch && (
          <button type="button" className="link" aria-expanded={pathOpen} onClick={() => setPathOpen((o) => !o)}>Zmień</button>
        )}
      </div>
      {pathOpen && canSwitch && (
        <div className="sv2-pathswitch" role="group" aria-label="Ścieżka oceny">
          <button type="button" className={first ? 'secondary' : 'secondary active'} aria-pressed={!first} disabled={busy}
            onClick={() => switchTo(periodic.find((t) => t.code === 'periodic-c')?.code ?? periodic[0]?.code ?? detail.templateCode)}>Ocena okresowa</button>
          <button type="button" className={first ? 'secondary active' : 'secondary'} aria-pressed={first} disabled={busy}
            onClick={() => switchTo('first')}>Pierwsza ocena</button>
        </div>
      )}
      {error && <p role="alert" className="error">{error}</p>}

      {!first && (
        <>
          <h3 className="sv2-h3">Opis stanowiska <span aria-hidden="true">→</span> arkusz</h3>
          <div className="sv2-osp" ref={box}>
            <section className="card sv2-osp-card" aria-label="Opis stanowiska">
              <div className="sv2-osp-head">
                <UiIcon name="doc" size={20} />
                <strong>Opis stanowiska</strong>
              </div>
              <p className="sv2-muted">{[position, detail.employeeDepartment].filter(Boolean).join(' · ') || '—'}</p>
              <div className="sv2-fact-row">
                <div ref={fact} className="sv2-fact">
                  <UiIcon name={reports ? 'people' : 'personx'} size={22} />
                  <strong>{reports ?? '—'}</strong>
                  <span>podległych</span>
                </div>
              </div>
              <div className="sv2-osp-foot">
                <button type="button" role="switch" aria-checked={confirmed} className="sv2-switch" disabled={!notStarted || !detail.canEdit}
                  onClick={() => setCurrent(!current)}>
                  <span className="sv2-switch-track" aria-hidden="true"><span className="sv2-switch-knob">{confirmed && <UiIcon name="check" size={12} />}</span></span>
                  Opis aktualny
                </button>
                <Info label="Co potwierdzasz">Opis stanowiska odpowiada obecnym obowiązkom. Od niego zależą arkusz i kryteria dodatkowe.</Info>
              </div>
            </section>

            {question ? (
              <section className="card sv2-result sv2-question" aria-label="Arkusz oceny">
                <div className="sv2-result-top">
                  <UiIcon name="people" size={24} />
                  <Info align="end" label="Dlaczego pytamy">
                    {coordination ? `Stanowisko: „${position}”, a w danych kadrowych brak podległych.` : 'Dane kadrowe nie pasują do arkusza.'} Arkusz B dotyczy bezpośredniego kierowania pracownikami.
                  </Info>
                </div>
                <h4 id="sv2-q">Czy {name} bezpośrednio kieruje pracownikami?</h4>
                <div className="sv2-answers" role="radiogroup" aria-labelledby="sv2-q">
                  {(['B', 'C'] as const).map((v) => (
                    <button key={v} type="button" role="radio" aria-checked={answer === v} disabled={busy}
                      className={`sv2-answer${answer === v ? ' selected' : ''}`} onClick={() => answerQuestion(v)}>
                      <span className="sv2-radio" aria-hidden="true" />
                      <span className="grow">{v === 'B' ? 'Tak' : 'Nie'}</span>
                      <UiIcon name="arrow" size={18} />
                      <span className="sv2-letter-sm">{v}</span>
                    </button>
                  ))}
                </div>
                <div className="sv2-sources">
                  <Source refText={reg('§ 3 ust. 3–4')} href={PERIODIC_REGULATION_URL}>§ 3</Source>
                  <span className="sv2-chip"><UiIcon name="idcard" size={16} /> Zmiana arkusza → HR</span>
                  <Info align="end" label="Zmiana arkusza">Inna odpowiedź niż w danych kadrowych: popraw dane stanowiska w HR.</Info>
                </div>
              </section>
            ) : (
              <section className="card sv2-result" aria-label={`Wynik: arkusz ${letter}`}>
                <div className="sv2-result-top">
                  <span className="sv2-letter" aria-hidden="true">{letter}</span>
                  <strong className="sv2-result-name">Arkusz {letter}</strong>
                  <Info align="end" label="Skąd ten arkusz">Wyliczone z danych kadrowych: liczba osób bezpośrednio podległych ({nameCase(name, 'gen')}: {reports ?? '—'}).</Info>
                </div>
                <div ref={reason} className="sv2-reason">
                  <UiIcon name={letter === 'B' ? 'people' : 'personx'} size={20} />
                  <span>{letter === 'B' ? 'bo: kieruje pracownikami' : 'bo: brak podległych pracowników'}</span>
                </div>
                <div className="sv2-sources">
                  <Source refText={reg(letter === 'B' ? '§ 3 ust. 3' : '§ 3 ust. 4')} href={PERIODIC_REGULATION_URL}>
                    {letter === 'B' ? '§ 3 ust. 3' : '§ 3 ust. 4'}
                  </Source>
                  {canSwitch && <button type="button" className="link sv2-small" onClick={() => setAskOpen(true)}>Inny arkusz?</button>}
                </div>
              </section>
            )}
            {line && (
              <svg className="sv2-connector" aria-hidden="true">
                <polyline points={line.y1 === line.y2 ? `${line.x1},${line.y1} ${line.x2},${line.y2}`
                  : `${line.x1},${line.y1} ${(line.x1 + line.x2) / 2},${line.y1} ${(line.x1 + line.x2) / 2},${line.y2} ${line.x2},${line.y2}`} />
                <circle cx={line.x2} cy={line.y2} r="4" />
              </svg>
            )}
          </div>
        </>
      )}

      {first && <FirstPathCard detail={detail} />}

      <div className="step-actions sv2-actions">
        <span className="grow" />
        {blockedReason && <span id="sv2-next-why" className="sv2-why">{blockedReason}</span>}
        {next && (
          <button type="button" disabled={!!blockedReason} aria-describedby={blockedReason ? 'sv2-next-why' : undefined}
            onClick={() => go(next.id)}>Dalej: {next.title.toLowerCase()}</button>
        )}
      </div>
    </div>
  )
}

/** Pierwsza ocena: skala i warunek wyniku z szablonu, kierujący komórką (współtworzy ocenę). */
function FirstPathCard({ detail }: { detail: Detail }) {
  const scores = scoresFieldOf(detail.schema)
  return (
    <section className="card sv2-first" aria-label="Pierwsza ocena">
      <div className="sv2-first-row">
        <span className="sv2-muted">Skala</span>
        <span className="sv2-first-scale">{scores?.scale.map((o) => <Pill key={o.key}>{o.value} · {o.label.toLowerCase()}</Pill>)}</span>
      </div>
      <div className="sv2-first-row">
        <span className="sv2-muted">Elementy oceny</span>
        <strong>{scores?.field.items?.length ?? 0}</strong>
      </div>
      <div className="sv2-first-row">
        <span className="sv2-muted">Kierujący komórką</span>
        <strong>{detail.unitHeadName ?? '—'}</strong>
        <Info label="Kierujący komórką">Współtworzy pierwszą ocenę i podpisuje jej potwierdzenie.</Info>
      </div>
      {!detail.unitHeadName && <p className="sv2-muted">Wskaż kierującego komórką w module Wydziały.</p>}
    </section>
  )
}
