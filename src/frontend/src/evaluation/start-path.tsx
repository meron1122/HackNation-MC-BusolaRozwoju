// H02 v2 · Rozpocznij ocenę: ścieżka w jednym wierszu, opis stanowiska → arkusz w jednej karcie (fakt → wniosek w jednej linii),
// potwierdzenie „Opis aktualny”, a gdy dane są sprzeczne (np. „Naczelnik” bez podległych) — pytanie Tak → B / Nie → C
// (przełącznik arkusza z API, PUT /template). Reguła decyzji: start-sheet-rule.ts.
import { useState } from 'react'
import { api } from '../api'
import { Info, Source } from '../v2'
import { FirstOverview } from './first-overview'
import { StartHead } from './start-head'
import type { StepProps } from './common'
import { useApi } from './data'
import { UiIcon } from './start-icons'
import { PERIODIC_REGULATION_URL, firstNameOf, nameCase, ospKey, reg, useLocalState, useOrg } from './start-model'
import { sheetDecision } from './start-sheet-rule'
import { answerOf, fmtDate, isFirstTemplate, sheetLetter, type Detail } from './types'

function positionOf(detail: Detail): string | null {
  return detail.employeePosition ?? answerOf(detail, 'evaluated', 'position')?.valueText ?? null
}

export function StartStep({ detail, steps, go, reload }: StepProps) {
  const first = isFirstTemplate(detail.templateCode)
  const notStarted = detail.phase === 'Oczekuje na start'
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
  // Odpowiedź na pytanie o kierowanie: sam arkusz zapisuje PUT /template, a tu pamiętamy, że przełożona już odpowiedziała.
  const [answer, setAnswer] = useLocalState<'B' | 'C' | null>(`busola.sheet-answer.${detail.id}`, null)
  const [askOpen, setAskOpen] = useState(false)
  const name = firstNameOf(detail.employeeName)
  const position = positionOf(detail)

  // Pytanie zamiast litery: nazwa stanowiska wskazuje kierowanie, a podległych brak — albo dane kadrowe nie pasują do arkusza.
  const decision = first ? { kind: 'none' as const } : sheetDecision({ position, reports, letter })
  const leadership = decision.kind === 'ask' && decision.reason === 'leadership-no-reports'
  const question = !first && (letter === 'B' || letter === 'C') && canSwitch && (decision.kind === 'ask' || askOpen)
  // Opis stanowiska (i jego potwierdzenie) dotyczy tylko oceny okresowej — przy pierwszej ocenie karty OSP nie ma.
  const confirmed = first || !notStarted || !detail.canEdit || current
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

  const next = steps[steps.findIndex((s) => s.id === 'start') + 1]

  return (
    <div className="step sv2">
      <StartHead detail={detail} topic={notStarted ? 'Rozpocznij ocenę' : 'Ścieżka oceny'} />

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
          <section className="card sv2-osp" aria-label="Opis stanowiska i arkusz">
            <div className="sv2-osp-head">
              <span className="sv2-iconbox"><UiIcon name="doc" size={20} /></span>
              <strong>Opis stanowiska</strong>
              <span className="sv2-muted sv2-osp-pos">{[position, detail.employeeDepartment].filter(Boolean).join(' · ') || '—'}</span>
            </div>

            <div className="sv2-flow">
              <div className="sv2-fact">
                <UiIcon name={reports ? 'people' : 'personx'} size={22} />
                <strong>{reports ?? '—'}</strong>
                <span>podległych</span>
              </div>
              <span className="sv2-flow-arrow" aria-hidden="true">→</span>

              {question ? (
                <div className="sv2-conclusion sv2-question" role="group" aria-labelledby="sv2-q">
                  <div className="sv2-row-head sv2-q-head">
                    <h4 id="sv2-q">Czy {name} bezpośrednio kieruje pracownikami?</h4>
                    <Info align="end" label="Dlaczego pytamy">
                      {leadership ? 'W danych kadrowych brak podległych, a nazwa stanowiska wskazuje kierowanie.' : 'Dane kadrowe nie pasują do arkusza.'} Arkusz B dotyczy bezpośredniego kierowania pracownikami.
                    </Info>
                  </div>
                  <div className="sv2-answers" role="radiogroup" aria-labelledby="sv2-q">
                    {(['B', 'C'] as const).map((v) => (
                      <button key={v} type="button" role="radio" aria-checked={answer === v} disabled={busy}
                        className={`sv2-answer${answer === v ? ' selected' : ''}`} onClick={() => answerQuestion(v)}>
                        <span className="sv2-radio" aria-hidden="true" />
                        <span className="grow">{v === 'B' ? 'Tak' : 'Nie'}</span>
                        <span aria-hidden="true">→</span>
                        <span className="sv2-letter-sm">{v}</span>
                        <span className="sr-only">, arkusz {v}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="sv2-conclusion" aria-label={`Wynik: arkusz ${letter}`}>
                  <span className="sv2-letter" aria-hidden="true">{letter}</span>
                  <div className="sv2-conclusion-text">
                    <strong className="sv2-result-name">Arkusz {letter}</strong>
                    <span>{decision.kind === 'ask' ? 'ustalony przy starcie oceny'
                      : letter === 'B' ? 'kieruje pracownikami' : 'brak podległych pracowników'}</span>
                  </div>
                  <Info align="end" label="Skąd ten arkusz">
                    {decision.kind === 'ask' ? 'Dane kadrowe nie rozstrzygają arkusza; wybrał go przełożony.' : `Wyliczone z danych kadrowych: liczba osób bezpośrednio podległych (${nameCase(name, 'gen')}: ${reports ?? '—'}).`}
                  </Info>
                </div>
              )}
            </div>

            <div className="sv2-osp-foot">
              <button type="button" role="switch" aria-checked={confirmed} className="sv2-switch" disabled={!notStarted || !detail.canEdit}
                onClick={() => setCurrent(!current)}>
                <span className="sv2-switch-track" aria-hidden="true"><span className="sv2-switch-knob">{confirmed && <UiIcon name="check" size={12} />}</span></span>
                Opis aktualny
              </button>
              <Info label="Co potwierdzasz">Opis stanowiska odpowiada obecnym obowiązkom. Od niego zależą arkusz i kryteria dodatkowe.</Info>
              <span className="grow" />
              {question ? (
                <>
                  <Source refText={reg('§ 3 ust. 3–4')} href={PERIODIC_REGULATION_URL}>§ 3</Source>
                  <Info align="end" label="Zmiana arkusza">Inna odpowiedź niż w danych kadrowych: popraw dane stanowiska w HR.</Info>
                </>
              ) : (
                <>
                  <Source refText={reg(letter === 'B' ? '§ 3 ust. 3' : '§ 3 ust. 4')} href={PERIODIC_REGULATION_URL}>
                    {letter === 'B' ? '§ 3 ust. 3' : '§ 3 ust. 4'}
                  </Source>
                  {canSwitch && <button type="button" className="link sv2-small" onClick={() => setAskOpen(true)}>Inny arkusz?</button>}
                </>
              )}
            </div>
          </section>
        </>
      )}

      {first && (
        <FirstOverview detail={detail} next={next ? {
          label: detail.currentStageKey === detail.stages[0]?.key && notStarted ? 'Przygotuj rozmowę wstępną' : `Dalej: ${next.title.toLowerCase()}`,
          onGo: () => go(next.id),
        } : null} />
      )}

      {!first && <div className="step-actions sv2-actions">
        <span className="grow" />
        {blockedReason && <span id="sv2-next-why" className="sv2-why">{blockedReason}</span>}
        {next && (
          <button type="button" disabled={!!blockedReason} aria-describedby={blockedReason ? 'sv2-next-why' : undefined}
            onClick={() => go(next.id)}>Dalej: {next.title.toLowerCase()}</button>
        )}
      </div>}
    </div>
  )
}
