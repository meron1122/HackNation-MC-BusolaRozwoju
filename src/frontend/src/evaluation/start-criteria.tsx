// H03 v2 · Kryteria oceny: obowiązkowe jako rząd chipów z kłódką, 3 sloty dodatkowych, katalog kafli z ikonami,
// propozycja asystenta raz (AiFrame, ze źródłem) — nic nie wchodzi do slotu samo. Zapis jak dotąd: PUT answers.
import { useState } from 'react'
import { api } from '../api'
import { SheetForm } from '../Evaluations'
import { AiFrame, Info, Source, askAssistant } from '../v2'
import { StartHead } from './start-head'
import type { StepProps } from './common'
import { saveAnswers } from './data'
import { CompetencyIcon, UiIcon, shortName } from './start-icons'
import { PERIODIC_REGULATION_URL, reg } from './start-model'
import { criteriaFieldOf, criteriaOf, emptyAnswer, isFirstTemplate, sheetLetter, type Answer, type Detail, type Field, type Section } from './types'

type Proposal =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'ready'; key: string; reason: string; source: string | null }
  | { state: 'none'; reason: string }
  | { state: 'error'; message: string }

const MANDATORY_REF: Record<string, string> = { A: '§ 4 ust. 1', B: '§ 4 ust. 2', C: '§ 4 ust. 3' }
const CATALOG_SHOWN = 5

/** Odpowiedź asystenta jako JSON (pierwszy obiekt w tekście). */
function parseProposal(reply: string, allowed: string[]): Proposal {
  const match = reply.match(/\{[\s\S]*\}/)
  if (!match) return { state: 'none', reason: 'Nie znalazłem podstaw w bazie wiedzy.' }
  try {
    const json = JSON.parse(match[0]) as { key?: string | null; reason?: string; source?: string | null }
    if (!json.key || !allowed.includes(json.key)) return { state: 'none', reason: json.reason || 'Nie znalazłem podstaw w bazie wiedzy.' }
    return { state: 'ready', key: json.key, reason: json.reason ?? '', source: json.source ?? null }
  } catch {
    return { state: 'none', reason: 'Nie znalazłem podstaw w bazie wiedzy.' }
  }
}

/** Źródło propozycji asystenta: najwyżej dwie linie z wielokropkiem, pełny tekst w dymku (title) i dla czytnika ekranu. */
function SourceLine({ text }: { text: string }) {
  return <span className="sv2-srcline" title={text}><span className="sv2-srcline-text"><span className="sr-only">Źródło: </span>{text}</span></span>
}

function CriteriaBoard({ detail, field, section, reload }: { detail: Detail; field: Field; section: Section; reload: () => Promise<void> }) {
  const competencies = detail.schema.competencyModel?.competencies ?? {}
  const mandatory: { key: string; label: string }[] = field.mandatory ?? []
  const isMandatory = (key: string) => mandatory.some((m) => m.key === key)
  const max: number = field.additional?.max ?? 3
  const savedKeys = detail.answers
    .filter((a) => a.fieldKey === field.key && a.itemKey && a.valueText && !isMandatory(a.itemKey))
    .map((a) => a.itemKey!)
  const [selected, setSelected] = useState<string[]>(savedKeys)
  const [sources, setSources] = useState<Record<string, string>>({})
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const [all, setAll] = useState(false)
  const [proposal, setProposal] = useState<Proposal>({ state: 'idle' })
  const [rejected, setRejected] = useState<string[]>([])
  const locked = detail.lockedSections.includes(section.key)
  const editable = detail.canEdit && !locked
  const full = selected.length >= max
  const letter = sheetLetter(detail.templateCode) ?? ''
  const pending = proposal.state === 'ready' && !selected.includes(proposal.key) ? proposal : null
  const options = Object.entries(competencies)
    .filter(([key]) => !isMandatory(key) && !selected.includes(key) && key !== pending?.key)
    .sort(([, a], [, b]) => a.name.localeCompare(b.name, 'pl'))
  const shown = all ? options : options.slice(0, CATALOG_SHOWN)

  async function save(next: string[]) {
    if (!editable || busy) return
    const touched = new Set([...next, ...selected, ...savedKeys])
    const answers: Answer[] = [
      ...mandatory.map((m) => ({ ...emptyAnswer(field.key, m.key), valueText: m.label })),
      ...[...touched].map((k) => ({ ...emptyAnswer(field.key, k), valueText: next.includes(k) ? competencies[k]?.name ?? k : null })),
    ]
    const previous = selected
    setSelected(next)
    setBusy(true)
    setStatus('Zapisywanie…')
    try {
      await saveAnswers(detail.id, answers)
      setStatus('Zapisano.')
      await reload()
    } catch (e) {
      setSelected(previous)
      setStatus((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const add = (key: string, source?: string) => {
    if (full || selected.includes(key)) return
    if (source) setSources((s) => ({ ...s, [key]: source }))
    void save([...selected, key])
  }
  const remove = (key: string) => void save(selected.filter((k) => k !== key))

  async function fromPrevious() {
    if (!detail.previous) return
    try {
      const prev = await api<Detail>(`evaluations/${detail.previous.id}`)
      const keys = criteriaOf(prev).map((c) => c.key).filter((k) => !isMandatory(k) && competencies[k]).slice(0, max)
      if (keys.length === 0) return setStatus('Poprzednia ocena nie miała kryteriów dodatkowych.')
      await save(keys)
    } catch (e) {
      setStatus((e as Error).message)
    }
  }

  async function propose() {
    const allowed = options.map(([k]) => k).filter((k) => !rejected.includes(k))
    if (allowed.length === 0) return
    setProposal({ state: 'loading' })
    const list = allowed.map((k) => `${k}: ${competencies[k].name}`).join('; ')
    const prompt = `Zaproponuj jedno kryterium dodatkowe do tej oceny okresowej spośród: ${list}. `
      + 'Wybór ma wynikać z charakteru obowiązków na stanowisku (§ 2 ust. 2 rozporządzenia). '
      + 'Odpowiedz wyłącznie jednym obiektem JSON: {"key": "...", "reason": "jedno zdanie do 12 słów", "source": "na czym się opierasz: dokument i punkt"}. '
      + 'Jeśli w danych nie ma podstaw, zwróć {"key": null, "reason": "..."}.'
    try {
      const r = await api<{ reply: string }>('agent/chat', 'POST', {
        messages: [{ role: 'user', content: prompt }],
        context: { evaluationId: detail.id, step: 'Kryteria i wskaźniki' },
      })
      setProposal(parseProposal(r.reply, allowed))
    } catch (e) {
      setProposal({ state: 'error', message: (e as Error).message })
    }
  }

  const slots = Array.from({ length: max }, (_, i) => selected[i] ?? null)

  return (
    <>
      <section className="sv2-mandatory" aria-labelledby="sv2-mand">
        <div className="sv2-row-head">
          <UiIcon name="lock" size={16} />
          <h3 id="sv2-mand" className="sv2-label">Obowiązkowe</h3>
          {MANDATORY_REF[letter] && <Source refText={reg(MANDATORY_REF[letter])} href={PERIODIC_REGULATION_URL} />}
        </div>
        <ul className="sv2-chips">
          {mandatory.map((m) => (
            <li key={m.key} className="sv2-lockchip" title={m.label}>
              <CompetencyIcon id={m.key} size={20} />
              <span aria-hidden="true">{shortName(m.key, m.label)}</span>
              <span className="sr-only">{m.label} (obowiązkowe, zablokowane)</span>
              <UiIcon name="lock" size={15} />
            </li>
          ))}
        </ul>
      </section>

      <section className="sv2-extra" aria-labelledby="sv2-extra">
        <div className="sv2-row-head">
          <h3 id="sv2-extra" className="sv2-h3">Dodatkowe</h3>
          <span className="sv2-muted">do {max} · opcjonalne</span>
          <span className="grow" />
          <strong className="sv2-count" aria-label={`Wybrano ${selected.length} z ${max}`}>{selected.length}/{max}</strong>
        </div>
        <div className="sv2-extra-grid">
          <div className="sv2-extra-main">
            <ul className="sv2-slots">
              {slots.map((key, i) => key ? (
                <li key={key} className="sv2-slot filled">
                  <span className="sv2-iconbox"><CompetencyIcon id={key} size={20} /></span>
                  <strong>{competencies[key]?.name ?? key}</strong>
                  {editable && (
                    <button type="button" className="sv2-x" aria-label={`Usuń: ${competencies[key]?.name ?? key}`} disabled={busy}
                      onClick={() => remove(key)}><UiIcon name="close" size={16} /></button>
                  )}
                  <span className="sv2-slot-foot">
                    {sources[key]
                      ? <SourceLine text={sources[key]} />
                      : <Info align="start" label="Podstawa wyboru">Kryterium dodatkowe wybierasz, gdy uzasadnia je opis stanowiska (§ 2 ust. 2).</Info>}
                  </span>
                </li>
              ) : (
                <li key={`empty-${i}`} className="sv2-slot empty" aria-label="Wolne miejsce">
                  <UiIcon name="plus" size={22} />
                </li>
              ))}
            </ul>
            {editable && (
              <>
                <ul className="sv2-catalog" aria-label="Kryteria do wyboru">
                  {shown.map(([key, c]) => (
                    <li key={key}>
                      <button type="button" className="sv2-tile" disabled={full || busy} onClick={() => add(key)}
                        aria-label={`Dodaj: ${c.name}`} title={c.name}>
                        <CompetencyIcon id={key} size={20} />
                        <span className="grow">{shortName(key, c.name)}</span>
                        <UiIcon name="plus" size={18} />
                      </button>
                    </li>
                  ))}
                  {options.length > CATALOG_SHOWN && (
                    <li>
                      <button type="button" className="link sv2-more" aria-expanded={all} onClick={() => setAll((a) => !a)}>
                        {all ? 'Mniej' : `Wszystkie (${options.length})`} <UiIcon name="chevron" size={16} />
                      </button>
                    </li>
                  )}
                </ul>
              </>
            )}
            {!editable && selected.length === 0 && <p className="sv2-muted">Bez kryteriów dodatkowych.</p>}
            {locked && <p className="sv2-muted"><UiIcon name="lock" size={15} /> Zablokowane po zamknięciu części I.</p>}
            {status && <p className="sv2-muted" role="status">{status}</p>}
          </div>

          {editable && !full && (
            <AiFrame label={null} live className="sv2-proposal" busy={proposal.state === 'loading'}
              actions={pending ? (
                <>
                  <button type="button" disabled={busy} onClick={() => { add(pending.key, pending.source ?? 'propozycja asystenta'); setProposal({ state: 'idle' }) }}>
                    <UiIcon name="plus" size={16} /> Wstaw
                  </button>
                  <button type="button" className="secondary" onClick={() => { setRejected((r) => [...r, pending.key]); setProposal({ state: 'idle' }) }}>Odrzuć</button>
                  <button type="button" className="link" onClick={() => askAssistant(`Dlaczego proponujesz kryterium „${competencies[pending.key]?.name}” w tej ocenie? Wskaż źródło.`)}>Dlaczego?</button>
                </>
              ) : undefined}>
              {pending ? (
                <>
                  <span className="sv2-iconbox sv2-iconbox-ai"><CompetencyIcon id={pending.key} size={20} /></span>
                  <h4 className="sv2-proposal-name">{competencies[pending.key]?.name}</h4>
                  {pending.reason && <p>{pending.reason}</p>}
                  {pending.source && <SourceLine text={pending.source} />}
                </>
              ) : proposal.state === 'loading' ? (
                <p className="sv2-muted">Szukam w danych stanowiska…</p>
              ) : (
                <>
                  {proposal.state === 'none' && <p>{proposal.reason}</p>}
                  {proposal.state === 'error' && <p>Asystent jest teraz niedostępny. {proposal.message}</p>}
                  <button type="button" className="secondary" onClick={propose} disabled={options.length === 0}>Zaproponuj kryterium</button>
                </>
              )}
            </AiFrame>
          )}
        </div>
      </section>
      {editable && detail.previous && (
        <div className="sv2-prev">
          <button type="button" className="secondary" onClick={fromPrevious} disabled={busy}>
            <UiIcon name="cycle" size={16} /> Z poprzedniej oceny
          </button>
        </div>
      )}
    </>
  )
}

/** W03: kryteria obowiązkowe (z arkusza) + do 3 dodatkowych z modelu kompetencji. */
export function CriteriaStep({ detail, steps, go, reload }: StepProps) {
  const first = isFirstTemplate(detail.templateCode)
  const schema = detail.schema
  const criteriaField = criteriaFieldOf(schema)
  const section = schema.sections.find((s) => s.fields.some((f) => f === criteriaField))
  const fromModel = criteriaField?.additional?.from === 'competencyModel'
  const next = steps[steps.findIndex((s) => s.id === 'criteria') + 1]

  return (
    <div className="step sv2">
      <StartHead detail={detail} topic={first ? 'Elementy oceny' : 'Kryteria oceny'} />
      {criteriaField && section ? (
        fromModel
          ? <CriteriaBoard detail={detail} field={criteriaField} section={section} reload={reload} />
          : <SheetForm key={JSON.stringify(detail.answers)} detail={detail} onSaved={reload} sectionKeys={[section.key]}
            fieldFilter={(f: Field) => f.type === 'criteriaSelection'} showStage={false} />
      ) : (
        <section className="sv2-mandatory" aria-label="Elementy oceny">
          <div className="sv2-row-head"><UiIcon name="lock" size={16} /><h3 className="sv2-label">Stałe elementy oceny</h3></div>
          <ul className="sv2-chips">
            {criteriaOf(detail).map((c) => (
              <li key={c.key} className="sv2-lockchip"><CompetencyIcon id={c.key} size={20} /><span>{c.label}</span><UiIcon name="lock" size={15} /></li>
            ))}
          </ul>
        </section>
      )}
      <div className="step-actions sv2-actions">
        <span className="grow" />
        {next && <button type="button" onClick={() => go(next.id)}>Dalej: {next.title.toLowerCase()}</button>}
      </div>
    </div>
  )
}
