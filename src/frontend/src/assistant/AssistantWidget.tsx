import { Fragment, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { api } from '../api'

/** Otwiera asystenta z dowolnego miejsca (np. przycisk „Zapytaj asystenta” na pulpicie). */
export const OPEN_ASSISTANT_EVENT = 'busola-open-assistant'
export const openAssistant = () => window.dispatchEvent(new Event(OPEN_ASSISTANT_EVENT))

// Krok kreatora oceny: zna go tylko Wizard, więc publikuje go tutaj, a asystent dołącza do kontekstu ekranu.
type Step = { id: string; title: string } | null
let step: Step = null
const listeners = new Set<() => void>()
export function setAssistantStep(next: Step) {
  step = next
  listeners.forEach((l) => l())
}
const useStep = () => useSyncExternalStore((cb) => (listeners.add(cb), () => listeners.delete(cb)), () => step)

/** Na co patrzy użytkownik. Backend dociąga dane encji sam, w zakresie uprawnień użytkownika. */
export type Screen = { page: string; evaluationId: number | null; employeeId: number | null }

/** signature: podpis serwera pod odpowiedzią asystenta — bez niego backend odrzuca historię (ochrona przed podrabianiem rozmowy). */
type Msg = { role: 'user' | 'assistant'; content: string; error?: boolean; signature?: string }

const STEP_CHIPS: Record<string, string[]> = {
  start: ['Który arkusz wybrać dla tej osoby?', 'Kto podlega ocenie okresowej i kto ją przeprowadza?'],
  criteria: ['Ile kryteriów dodatkowych mogę wybrać?', 'Jakie kryteria pasują do tego stanowiska?'],
  kickoff: ['Co muszę omówić na rozmowie rozpoczynającej?', 'Ile mam czasu na rozmowę rozpoczynającą?'],
  part1: ['Co potwierdza podpis ocenianego w części I?', 'Jaki termin sporządzenia oceny wpisać?'],
  notes: ['Czy okres oceny trwa zawsze równe 24 miesiące?', 'Jak nieobecność wpływa na termin oceny?'],
  indicators: ['Od czego zacząć wystawianie ocen cząstkowych?', 'Jak wyliczyć wynik oceny okresowej?'],
  interview: ['Jak przygotować rozmowę oceniającą z tą osobą?', 'Kiedy przeprowadzić rozmowę oceniającą?'],
  result: ['Czy wnioski do IPRZ są obowiązkowe?', 'Czy muszę pisać uzasadnienie oceny?'],
  review: ['Kiedy można złożyć wniosek o kolejny stopień służbowy?', 'Średnia 4,00 – jaki to poziom?'],
  ack: ['Do kogo oceniany składa sprzeciw?', 'Ile jest czasu na sprzeciw i jego rozpatrzenie?'],
}
const PAGE_CHIPS: Record<string, string[]> = {
  dashboard: ['Co jest najpilniejsze w moim zespole?', 'Kto z zespołu ma termin w tym tygodniu?'],
  team: ['Jakie etapy ocen czekają mój zespół?', 'Kto ma ocenę po terminie?'],
  evaluations: ['Na jakim etapie jest ta ocena i co dalej?', 'Ile mam czasu na ten etap?'],
  profile: ['Jakie etapy oceny czekają tę osobę?', 'Kiedy ta osoba ma kolejną ocenę okresową?'],
  'my-profile': ['Kiedy mam kolejną ocenę?', 'Jak przygotować się do samooceny?'],
  my: ['Co mnie czeka w mojej ocenie?', 'Ile mam czasu na sprzeciw od oceny?'],
}
const DEFAULT_CHIPS = ['Czy średnia 4,0 to ocena pozytywna?', 'Ile kryteriów dodatkowych mogę wybrać?', 'Ile dni ma pracownik na sprzeciw?']

/** **pogrubienie** w linii tekstu z modelu. */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : <Fragment key={i}>{part}</Fragment>)
}

/** Odpowiedź modelu: akapity i listy „- ” / „1. ” (podzbiór Markdownu, bez HTML-a z modelu). Tabela, gdyby model ją wstawił, staje się listą „a · b · c” — w wąskim oknie i tak by się nie zmieściła. */
function Rich({ text }: { text: string }) {
  const blocks: ReactNode[] = []
  let list: string[] = []
  const flush = () => {
    if (list.length) blocks.push(<ul key={blocks.length}>{list.map((l, i) => <li key={i}>{inline(l)}</li>)}</ul>)
    list = []
  }
  let tableHeader = true
  for (const line of text.split('\n')) {
    if (/^\s*\|/.test(line)) {
      const cells = line.split('|').map((c) => c.trim()).filter(Boolean)
      if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue
      if (tableHeader) tableHeader = false // wiersz nagłówka pomijamy: kolumny bez tabeli nic nie znaczą
      else list.push(cells.join(' · '))
      continue
    }
    tableHeader = true
    const item = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/)
    if (item) list.push(item[1])
    else {
      flush()
      if (line.trim()) blocks.push(<p key={blocks.length}>{inline(line.replace(/^#+\s*/, ''))}</p>)
    }
  }
  flush()
  return <>{blocks}</>
}

/** Asystent zawsze pod ręką: przycisk w prawym dolnym rogu, rozmowa trwa przy zmianie ekranów, kontekst idzie z ekranem. */
export function AssistantWidget({ screen }: { screen: Screen }) {
  const [open, setOpen] = useState(false)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [busy, setBusy] = useState(false)
  const [label, setLabel] = useState('')
  const [draft, setDraft] = useState('')
  const currentStep = useStep()
  const input = useRef<HTMLInputElement>(null)
  const end = useRef<HTMLDivElement>(null)
  const context = { ...screen, step: currentStep?.title ?? null }
  const contextKey = JSON.stringify(context)

  useEffect(() => {
    const show = () => setOpen(true)
    window.addEventListener(OPEN_ASSISTANT_EVENT, show)
    return () => window.removeEventListener(OPEN_ASSISTANT_EVENT, show)
  }, [])

  useEffect(() => {
    if (!open) return
    input.current?.focus()
    const escape = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('keydown', escape)
    return () => document.removeEventListener('keydown', escape)
  }, [open])

  useEffect(() => {
    if (!open) return
    let active = true
    api<{ label: string }>('agent/context', 'POST', JSON.parse(contextKey)).then((r) => active && setLabel(r.label), () => active && setLabel(''))
    return () => { active = false }
  }, [open, contextKey])

  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }) }, [msgs, busy])

  async function send(question: string) {
    const q = question.trim()
    if (!q || busy) return
    const history = [...msgs.filter((m) => !m.error), { role: 'user' as const, content: q }]
    setMsgs((m) => [...m, { role: 'user', content: q }])
    setDraft('')
    setBusy(true)
    try {
      const r = await api<{ reply: string; contextLabel: string; signature: string }>('agent/chat', 'POST', {
        messages: history.slice(-19).map(({ role, content, signature }) => ({ role, content, signature })),
        context,
      })
      setLabel(r.contextLabel)
      setMsgs((m) => [...m, { role: 'assistant', content: r.reply, signature: r.signature }])
    } catch (e) {
      setMsgs((m) => [...m, { role: 'assistant', content: (e as Error).message, error: true }])
    } finally {
      setBusy(false)
    }
  }

  const chips = (currentStep && STEP_CHIPS[currentStep.id]) ?? PAGE_CHIPS[screen.evaluationId ? 'evaluations' : screen.page] ?? DEFAULT_CHIPS

  return (
    <>
      {open && (
        <section className="assistant-pop" role="dialog" aria-label="Asystent">
          <header className="assistant-head">
            <span className="assistant-spark" aria-hidden="true">✦</span>
            <div className="assistant-title">
              <h2>Asystent</h2>
              {label && <span className="assistant-sees" title="To, na co patrzysz — asystent widzi to samo, w ramach Twoich uprawnień">Widzi: {label}</span>}
            </div>
            {msgs.length > 0 && <button type="button" className="link" onClick={() => setMsgs([])}>Nowa rozmowa</button>}
            <button type="button" className="assistant-close" aria-label="Zamknij asystenta" onClick={() => setOpen(false)}>×</button>
          </header>
          <div className="assistant-feed" aria-live="polite">
            {msgs.length === 0 && (
              <p className="muted small">
                Pytaj o zasady ocen (rozporządzenia, ustawa o służbie cywilnej) i o to, co masz na ekranie. Podaję podstawę prawną.
              </p>
            )}
            {msgs.map((m, i) => m.role === 'user'
              ? <div key={i} className="bubble-q">{m.content}</div>
              : (
                <div key={i} className={m.error ? 'bubble-a error' : 'bubble-a'}>
                  {!m.error && <span className="ai-tag">✦ Asystent</span>}
                  <Rich text={m.content} />
                </div>
              ))}
            {busy && <div className="bubble-a" aria-label="Asystent pisze odpowiedź"><span className="typing" aria-hidden="true"><span /><span /><span /></span></div>}
            <div ref={end} />
          </div>
          <footer className="assistant-foot">
            {msgs.length === 0 && (
              <div className="assistant-chips">
                {chips.map((c) => <button key={c} type="button" className="assistant-chip" onClick={() => send(c)}>{c}</button>)}
              </div>
            )}
            <form className="assistant-ask" onSubmit={(e) => { e.preventDefault(); send(draft) }}>
              <label className="sr-only" htmlFor="assistant-q">Pytanie do asystenta</label>
              <input id="assistant-q" ref={input} value={draft} onChange={(e) => setDraft(e.target.value)}
                placeholder="Zapytaj o zasady albo o to, co widzisz…" autoComplete="off" />
              <button type="submit" disabled={!draft.trim() || busy}>Wyślij</button>
            </form>
            <p className="muted assistant-note">Asystent podpowiada, decyzję podejmujesz Ty. Widzi tylko to, do czego masz uprawnienia.</p>
          </footer>
        </section>
      )}
      <button type="button" className={open ? 'assistant-fab open' : 'assistant-fab'} aria-expanded={open}
        aria-label={open ? 'Zamknij asystenta' : 'Otwórz asystenta'} onClick={() => setOpen((o) => !o)}>
        <span aria-hidden="true">{open ? '×' : '✦'}</span>
        {!open && <span>Asystent</span>}
      </button>
    </>
  )
}
