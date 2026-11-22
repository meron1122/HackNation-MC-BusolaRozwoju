import { Fragment, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { api, LOGOUT_EVENT } from '../api'
import { Avatar } from '../Avatar'
import { AiFrame, Compass, Info, ScaleBar, Spark, Warn } from '../v2'
import { ErrorState, Needle, TypingDots, usePrefersReducedMotion } from '../v2/motion'
import { DOCS, parseReply, type Parsed, type SourceRef } from './parse'
import { ask, contextFor, hasEntity, resetChat, useAssistant, type Mode, type Msg } from './store'

const CONTEXT_LABELS = new Map<string, string>()
if (typeof window !== 'undefined') window.addEventListener(LOGOUT_EVENT, () => CONTEXT_LABELS.clear())
import './assistant.css'
import './ma-assistant.css'
import { extractGuide, guideTried, startGuide, type GuideStep } from './tours'

export type Variant = 'page' | 'panel' | 'pop'

const STEP_CHIPS: Record<string, string[]> = {
  start: ['Który arkusz wybrać dla tej osoby?', 'Kto podlega ocenie okresowej?'],
  criteria: ['Ile kryteriów dodatkowych mogę wybrać?', 'Jakie kryteria pasują do tego stanowiska?'],
  kickoff: ['Co omówić na rozmowie rozpoczynającej?', 'Ile mam czasu na rozmowę rozpoczynającą?'],
  part1: ['Co potwierdza podpis ocenianego w części I?', 'Jaki termin sporządzenia oceny wpisać?'],
  notes: ['Jak nieobecność wpływa na termin oceny?', 'Czy okres oceny trwa zawsze 24 miesiące?'],
  indicators: ['Co zrobić przy remisie 5 lub 7?', 'Jak wyliczyć wynik oceny okresowej?'],
  interview: ['Jak przygotować rozmowę oceniającą?', 'Kiedy przeprowadzić rozmowę oceniającą?'],
  result: ['Czy wnioski do IPRZ są obowiązkowe?', 'Kiedy ocena jest negatywna?'],
  review: ['Średnia 4,00 – jaki to poziom?', 'Jak napisać uzasadnienie?'],
  ack: ['Do kogo oceniany składa sprzeciw?', 'Ile jest czasu na sprzeciw?'],
}
const PAGE_CHIPS: Record<string, string[]> = {
  dashboard: ['Co jest najpilniejsze w moim zespole?', 'Kto ma termin w tym tygodniu?'],
  team: ['Jakie etapy ocen czekają mój zespół?', 'Kto ma ocenę po terminie?'],
  evaluations: ['Na jakim etapie jest ta ocena?', 'Ile mam czasu na ten etap?'],
  profile: ['Jakie etapy oceny czekają tę osobę?', 'Kiedy ta osoba ma kolejną ocenę?'],
  my: ['Co mnie czeka w mojej ocenie?', 'Ile mam czasu na sprzeciw?'],
}
const DEFAULT_CHIPS = ['Czy średnia 4,0 to ocena pozytywna?', 'Ile dni ma pracownik na sprzeciw?']

const TILES: { icon: ReactNode; title: string; q: string; ai?: boolean }[] = [
  { title: 'Terminy', q: 'Ile dni na rozmowę rozpoczynającą?', icon: <path d="M4 6h16v14H4zM4 10h16M8 3v5M16 3v5" /> },
  { title: 'Arkusze', q: 'Kiedy arkusz B, a kiedy C?', icon: <path d="M7 3h7l4 4v14H7zM14 3v4h4M10 12h5M10 16h5" /> },
  { title: 'Skala', q: 'Czy 4,0 to ocena pozytywna?', icon: <path d="M6 20v-5M10 20v-8M14 20v-11M18 20V5" /> },
  { title: 'Sprzeciw', q: 'Ile dni ma pracownik na sprzeciw?', icon: <path d="M4 20h10M7 15l7-7M11 4l6 6M9 6l6 6-3 3-6-6z" /> },
  { title: 'Pierwsza ocena', q: 'Kiedy pierwsza ocena jest pozytywna?', icon: <path d="M5 19l1-4L16 5l3 3L9 18zM14 7l3 3" /> },
]
const KNOWLEDGE = ['Rozp. 2016', 'Rozp. 2015', 'Poradnik 2016', 'Poradnik pierwszej oceny', 'Model kompetencji']

/** Wołacz dla powitania („Anno”); dla imion spoza wzorca bez imienia. */
function vocative(fullName: string): string | null {
  const first = fullName.trim().split(/\s+/)[0] ?? ''
  if (/a$/.test(first) && first.length > 2) return `${first.slice(0, -1)}o`
  return null
}

function inline(text: string, onFn?: (n: number) => void, active?: number | null): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|⟦\d+⟧)/g).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>
    const fn = part.match(/^⟦(\d+)⟧$/)
    if (fn) {
      const n = Number(fn[1])
      return (
        <sup key={i} className="asst-fn">
          {onFn
            ? <button type="button" className={active === n ? 'active' : undefined} aria-label={`Źródło ${n}`} onClick={() => onFn(n)}>{n}</button>
            : n}
        </sup>
      )
    }
    return <Fragment key={i}>{part}</Fragment>
  })
}

/** Akapity i listy „- ” / „1. ” (podzbiór Markdownu, bez HTML-a z modelu). */
function Rich({ text, onFn, active }: { text: string; onFn?: (n: number) => void; active?: number | null }) {
  const blocks: ReactNode[] = []
  let list: string[] = []
  const flush = () => {
    if (list.length) blocks.push(<ul key={blocks.length}>{list.map((l, i) => <li key={i}>{inline(l, onFn, active)}</li>)}</ul>)
    list = []
  }
  for (const line of text.split('\n')) {
    const item = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/)
    if (item) list.push(item[1])
    else {
      flush()
      if (line.trim()) blocks.push(<p key={blocks.length}>{inline(line.replace(/^#+\s*/, ''), onFn, active)}</p>)
    }
  }
  flush()
  return <>{blocks}</>
}

function DocIcon() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" className="asst-docicon">
      <path d="M4 1.8h5.2L12.2 5v9.2H4z M9 2v3.2h3.2 M6 8.2h4 M6 10.8h4" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  )
}

/** Ilustracja „lupa nad półką” (brak w bazie, karta 09): półka, dokumenty po kolei, lawendowa lupa (AI). Potem statycznie. */
function ShelfIllustration() {
  return (
    <svg viewBox="0 0 150 116" width="104" height="80" aria-hidden="true" className="ma-empty-art">
      <g className="ma-empty-shelf">
        <rect x="6" y="98" width="138" height="6" rx="3" fill="#33437F" />
        <rect x="16" y="104" width="5" height="8" rx="1.5" fill="#33437F" />
        <rect x="129" y="104" width="5" height="8" rx="1.5" fill="#33437F" />
      </g>
      <rect className="ma-empty-doc" style={{ '--d': 0 } as CSSProperties} x="18" y="54" width="18" height="44" rx="3" fill="#5AA9E6" />
      <rect className="ma-empty-doc" style={{ '--d': 1 } as CSSProperties} x="39" y="62" width="15" height="36" rx="3" fill="#1F2A5A" />
      <rect className="ma-empty-doc" style={{ '--d': 2 } as CSSProperties} x="57" y="50" width="20" height="48" rx="3" fill="#8CC4EE" />
      <g className="ma-empty-doc" style={{ '--d': 3 } as CSSProperties}>
        <rect x="84" y="64" width="16" height="34" rx="3" fill="#DCEEFB" stroke="#8CC4EE" strokeWidth="1.5" transform="rotate(14 92 98)" />
      </g>
      <g className="ma-empty-lens">
        <circle cx="104" cy="34" r="20" fill="#E7E2FA" fillOpacity=".7" stroke="#8E7CE0" strokeWidth="6" />
        <line x1="118.5" y1="48.5" x2="132" y2="62" stroke="#8E7CE0" strokeWidth="8" strokeLinecap="round" />
        <path d="M96 30h16" stroke="#6A55C8" strokeWidth="3" strokeLinecap="round" opacity=".5" />
      </g>
    </svg>
  )
}

function SourceChips({ sources, active, onPick, secondary = false }: {
  sources: SourceRef[]; active: number | null; onPick: (n: number) => void; secondary?: boolean
}) {
  if (!sources.length) return null
  return (
    <div className="asst-sources">
      {sources.map((s, i) => (
        <button key={s.n} type="button" style={{ '--ma-i': i } as CSSProperties} className={`asst-src${active === s.n ? ' active' : ''}${secondary ? ' secondary' : ''}`}
          aria-expanded={active === s.n} onClick={() => onPick(s.n)}>
          <DocIcon />
          {!secondary && <sup>{s.n}</sup>}
          {s.label}
        </button>
      ))}
    </div>
  )
}

/** Podgląd źródła: dokument, przepis, zdanie odpowiedzi oparte na nim. Pełny tekst przepisu — pytaniem do asystenta. */
export function SourcePreview({ parsed, n, onClose, onPick, mode }: {
  parsed: Parsed; n: number; onClose?: () => void; onPick: (n: number) => void; mode: Mode
}) {
  const s = parsed.sources.find((x) => x.n === n)
  const box = useRef<HTMLElement>(null)
  // W wąskim panelu podgląd otwiera się pod kartą — przewijamy go do widoku (płynnie, gdy ruch jest dozwolony).
  useEffect(() => {
    const smooth = !matchMedia('(prefers-reduced-motion: reduce)').matches
    box.current?.scrollIntoView({ block: 'nearest', behavior: smooth ? 'smooth' : 'auto' })
  }, [])
  if (!s) return null
  const sentences = parsed.text.split(/(?<=[.!?])\s+/).filter((t) => t.includes(`⟦${n}⟧`))
  return (
    <aside ref={box} className="asst-preview ma-enter" aria-label={`Źródło ${n}: ${s.label}`}>
      <header className="asst-preview-head">
        <span className="asst-preview-icon"><DocIcon /></span>
        <div>
          <strong>{DOCS[s.doc].title}</strong>
          {s.ref && <span>{s.ref}</span>}
        </div>
        {onClose && <button type="button" className="asst-x" aria-label="Zamknij podgląd źródła" onClick={onClose}>×</button>}
      </header>
      <div className="asst-preview-nav">
        <span className="asst-src active"><sup>{s.n}</sup>{s.ref || DOCS[s.doc].short}</span>
        <span className="grow" />
        {parsed.sources.length > 1 && (
          <span className="asst-preview-count">
            <button type="button" className="asst-x" aria-label="Poprzednie źródło" disabled={n <= 1} onClick={() => onPick(n - 1)}>‹</button>
            {n} z {parsed.sources.length}
            <button type="button" className="asst-x" aria-label="Następne źródło" disabled={n >= parsed.sources.length} onClick={() => onPick(n + 1)}>›</button>
          </span>
        )}
      </div>
      <div className="asst-docpage" aria-hidden={sentences.length === 0 || undefined}>
        <span className="asst-line" /><span className="asst-line short" />
        {sentences.map((t, i) => <p key={i} className="asst-quote">{inline(t.replace(/⟦\d+⟧/g, ''))}</p>)}
        <span className="asst-line" /><span className="asst-line short" />
      </div>
      <button type="button" className="secondary" onClick={() => ask(`Zacytuj dosłownie ${s.label.replace(' · ', ', ')}.`, mode)}>
        Pokaż pełny przepis
      </button>
    </aside>
  )
}

/** Prowadzenie ułożone przez asystenta pod pytanie: klik przyciemnia ekran i prowadzi krok po kroku. */
function GuideButton({ steps }: { steps: GuideStep[] }) {
  if (!steps.length) return null
  return (
    <div className="asst-tours">
      <button type="button" className="secondary" onClick={() => startGuide(steps)}>
        <span aria-hidden="true">➜</span> Pokaż mi na ekranie{steps.length > 1 ? ` (${steps.length} kroki)` : ''}
      </button>
    </div>
  )
}

function Answer({ msg, last, mode, active, onPick, inlinePreview, fresh }: {
  msg: Msg; last: boolean; mode: Mode; active: number | null; onPick: (n: number | null) => void; inlinePreview: boolean; fresh: boolean
}) {
  const card = `asst-card${fresh ? ' ma-new' : ''}`
  if (msg.error) {
    return (
      <div className={`${card} asst-error`}>
        <ErrorState title="Asystent jest chwilowo niedostępny" detail={msg.content} />
      </div>
    )
  }
  const { text: replyText, steps: guide } = extractGuide(msg.content)
  const p = parseReply(replyText)
  const tourButtons = <GuideButton steps={guide} />
  const pick = (n: number) => onPick(active === n ? null : n)
  // Odwołania spoza materiału (sprawdza backend) — osobno od źródeł, żeby nie wyglądały na potwierdzone.
  const unverified = msg.unverified?.length ? (
    <Warn title="Tych odwołań nie potwierdziłem w bazie wiedzy">
      <p>{msg.unverified.join(', ')}. Sprawdź je w tekście przepisu, zanim oprzesz na nich decyzję.</p>
    </Warn>
  ) : null
  const avg = p.kind === 'answer' ? msg.content.match(/(?:średni\p{L}*|wynik\p{L}*)\s+(?:wynosi\s+|to\s+)?(\d)[,.](\d{1,2})/u) : null

  if (p.kind === 'notFound' || p.kind === 'unresolved') {
    const firstLine = p.text.split(/\n+/).map((l) => l.trim()).filter(Boolean)
    const body = firstLine.filter((l) => !/^nie znalaz/i.test(l)).join(' ') || firstLine.join(' ')
    return (
      <AiFrame className={`${card} asst-missing`}>
        <div className="asst-missing-row">
          <ShelfIllustration />
          <div>
            <h3>{p.kind === 'notFound' ? 'Nie znalazłem tego w bazie wiedzy' : 'Baza tego nie rozstrzyga'}</h3>
            <Rich text={body.replace(/^Nie znalazłem[^.]*\.\s*/i, '')} />
            {tourButtons}
            {p.sources.length > 0 && (
              <div className="asst-see">
                <span>Zobacz też</span>
                <SourceChips sources={p.sources} active={active} onPick={pick} secondary />
              </div>
            )}
          </div>
        </div>
        {inlinePreview && active && <SourcePreview key={active} parsed={p} n={active} mode={mode} onPick={onPick} onClose={() => onPick(null)} />}
      </AiFrame>
    )
  }

  if (p.kind === 'clarify') {
    return (
      <AiFrame className={card}>
        <h3 className="asst-q">{p.text}</h3>
        {last && (
          <div className="asst-choices">
            <button type="button" className="secondary" onClick={() => ask('Ocena okresowa', mode)}>Ocena okresowa</button>
            <button type="button" className="secondary" onClick={() => ask('Pierwsza ocena', mode)}>Pierwsza ocena</button>
          </div>
        )}
      </AiFrame>
    )
  }

  return (
    <AiFrame className={card} aside={p.scope && <span className="asst-scope">{p.scope}</span>}>
      {(p.verdict || avg) && (
        <div className="asst-verdict">
          {p.verdict && <strong>{p.verdict}</strong>}
          {avg && <ScaleBar value={Number(`${avg[1]}.${avg[2]}`)} />}
        </div>
      )}
      <Rich text={p.text} onFn={pick} active={active} />
      <SourceChips sources={p.sources} active={active} onPick={pick} />
      {tourButtons}
      {unverified}
      {inlinePreview && active && <SourcePreview key={active} parsed={p} n={active} mode={mode} onPick={onPick} onClose={() => onPick(null)} />}
    </AiFrame>
  )
}

/** Ile trwa faza „szukam” (igła), zanim przejdzie w „piszę” (kropki). Backend nie strumieniuje, więc fazę wyznacza czas. */
const SEEK_MS = 1400

/** 02 + 16: najpierw igła „szuka” i „Szukam w bazie wiedzy…”, potem lawendowy dymek z kropkami. Pętla tylko w trakcie odpowiedzi. */
function BusyLine({ big, onPhase }: { big: boolean; onPhase: (p: 'seek' | 'type') => void }) {
  const [phase, setPhase] = useState<'seek' | 'type'>('seek')
  useEffect(() => {
    onPhase('seek')
    const t = setTimeout(() => { setPhase('type'); onPhase('type') }, SEEK_MS)
    return () => clearTimeout(t)
  }, [onPhase])
  return (
    <div className="ma-busy" aria-hidden="true">
      {phase === 'seek' ? (
        <span className="ma-seek"><Needle size={big ? 32 : 20} motion="seek" />Szukam w bazie wiedzy…</span>
      ) : (
        <span className="ma-typing"><TypingDots /></span>
      )}
    </div>
  )
}

/** Tekst odpowiedzi do ogłoszenia czytnikowi ekranu (bez znaczników przypisów i prowadzenia). */
function spoken(m: Msg): string {
  if (m.error) return `Asystent jest chwilowo niedostępny. ${m.content}`
  const p = parseReply(extractGuide(m.content).text)
  const head = p.kind === 'notFound' ? 'Nie znalazłem tego w bazie wiedzy. ' : p.kind === 'unresolved' ? 'Baza tego nie rozstrzyga. ' : ''
  const body = p.text.replace(/^\s*Nie znalazłem[^.]*\.\s*/i, '').replace(/⟦\d+⟧/g, '').replace(/\*\*/g, '').replace(/\s+/g, ' ').trim()
  const src = p.sources.length ? ` Źródła: ${p.sources.map((x) => x.label).join('; ')}.` : ''
  return `Asystent odpowiedział. ${head}${body}${src}`
}

function Composer({ mode, setMode, big = false, autoFocus = false, contextLabel }: {
  mode: Mode; setMode: (m: Mode) => void; big?: boolean; autoFocus?: boolean; contextLabel: string
}) {
  const { busy, screen } = useAssistant()
  const [draft, setDraft] = useState('')
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => { if (autoFocus) input.current?.focus() }, [autoFocus])
  const submit = () => {
    if (!draft.trim() || busy) return
    void ask(draft, mode)
    setDraft('')
  }
  return (
    <form className={big ? 'asst-ask big' : 'asst-ask'} onSubmit={(e) => { e.preventDefault(); submit() }}>
      <label className="sr-only" htmlFor={`asst-q-${big ? 'big' : 'small'}`}>Pytanie do asystenta</label>
      <input id={`asst-q-${big ? 'big' : 'small'}`} ref={input} value={draft} onChange={(e) => setDraft(e.target.value)}
        placeholder={mode === 'context' && hasEntity(screen) ? 'Zapytaj o to, co widzisz, albo o zasady…' : 'Zapytaj o zasady oceny…'} autoComplete="off" />
      {mode === 'context' && hasEntity(screen) ? (
        <span className="asst-ctx">
          <span className="asst-ctx-label">{contextLabel || 'Ten ekran'}</span>
          <Info label="Co trafia do modelu" align="end">Do modelu trafia to, co widzisz w tej ocenie, w zakresie Twoich uprawnień.</Info>
          <button type="button" className="asst-x" aria-label="Pytaj bez kontekstu ekranu" onClick={() => setMode('rules')}>×</button>
        </span>
      ) : hasEntity(screen) && (
        <span className="asst-shield">
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
            <path d="M8 1.6l5 2v4.1c0 3.1-2.1 5.4-5 6.7-2.9-1.3-5-3.6-5-6.7V3.6z M5.6 8l1.7 1.7 3.2-3.4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round" />
          </svg>
          bez danych z ekranu
          <Info label="Prywatność pytania" align="end">Pytanie idzie do modelu bez danych osoby i oceny, które masz na ekranie.</Info>
        </span>
      )}
      <button type="submit" className="asst-send" aria-label="Wyślij" disabled={!draft.trim() || busy}>
        <svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true"><path d="M8 13V3M3.5 7.5L8 3l4.5 4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
    </form>
  )
}

/**
 * Rozmowa z asystentem: karty odpowiedzi z przypisami i chipami źródeł, stany „szukam…”, „nie znalazłem”, dopytanie.
 * `page` = strona Asystent (H13, podgląd źródła z prawej), `panel` = zakładka kreatora, `pop` = okno w rogu.
 */
export function AssistantChat({ variant, autoFocus = false }: { variant: Variant; autoFocus?: boolean }) {
  const { msgs, busy, screen, step, userName } = useAssistant()
  const entity = hasEntity(screen)
  const [mode, setMode] = useState<Mode>(variant !== 'page' && entity ? 'context' : 'rules')
  const [label, setLabel] = useState('')
  const [active, setActive] = useState<{ id: number; n: number } | null>(null)
  const end = useRef<HTMLDivElement>(null)
  const reduced = usePrefersReducedMotion()
  // Animujemy tylko wiadomości, które przyszły po zamontowaniu (przełączenie zakładki nie odtwarza całej rozmowy).
  const mountedMax = useRef(msgs.reduce((a, m) => Math.max(a, m.id), 0))
  const isFresh = (m: Msg) => m.id > mountedMax.current
  // Jeden region aria-live: ogłasza fazę pracy i gotową odpowiedź, nie każdą klatkę animacji.
  const [phase, setPhase] = useState<'seek' | 'type' | null>(null)
  const onPhase = useRef((p: 'seek' | 'type') => setPhase(p)).current
  const effectiveMode: Mode = entity ? mode : 'rules'
  const ctxKey = JSON.stringify(contextFor(effectiveMode))

  // Etykieta kontekstu dzieli limit zapytań z czatem: pamiętamy ją per kontekst i pytamy dopiero po 600 ms bez zmian.
  useEffect(() => {
    if (effectiveMode !== 'context') return
    const cached = CONTEXT_LABELS.get(ctxKey)
    if (cached !== undefined) { setLabel(cached); return }
    let on = true
    const t = setTimeout(() => {
      api<{ label: string }>('agent/context', 'POST', JSON.parse(ctxKey))
        .then((r) => { CONTEXT_LABELS.set(ctxKey, r.label); if (on) setLabel(r.label) }, () => on && setLabel(''))
    }, 600)
    return () => { on = false; clearTimeout(t) }
  }, [effectiveMode, ctxKey])

  useEffect(() => { end.current?.scrollIntoView({ block: 'end', behavior: reduced ? 'auto' : 'smooth' }) }, [msgs.length, busy, reduced])

  const lastAssistant = [...msgs].reverse().find((m) => m.role === 'assistant')
  const announce = busy
    ? (phase === 'type' ? 'Asystent pisze odpowiedź…' : 'Szukam w bazie wiedzy…')
    : lastAssistant && isFresh(lastAssistant) && msgs[msgs.length - 1] === lastAssistant ? spoken(lastAssistant) : ''
  const activeMsg = active ? msgs.find((m) => m.id === active.id) : null
  const preview = variant === 'page' && activeMsg && active ? parseReply(activeMsg.content) : null
  const chips = (step && STEP_CHIPS[step.id]) ?? PAGE_CHIPS[screen.evaluationId ? 'evaluations' : screen.page] ?? DEFAULT_CHIPS
  const hello = vocative(userName)
  // Zachęta do prowadzenia: pytanie o ten ekran — asystent złoży prowadzenie z tego, co tu widać.
  const guideTry = step ? `Pokaż mi, co zrobić w kroku „${step.title}”` : 'Pokaż mi, od czego zacząć na tym ekranie'

  const toggle = entity && (
    <div className="asst-mode" role="group" aria-label="Tryb pytania">
      <button type="button" aria-pressed={effectiveMode === 'rules'} onClick={() => setMode('rules')}>Zasady</button>
      <button type="button" aria-pressed={effectiveMode === 'context'} onClick={() => setMode('context')}>Ten ekran</button>
    </div>
  )

  if (msgs.length === 0 && variant === 'page') {
    return (
      <div className="asst asst-page-start">
        {toggle}
        <h2 className="asst-hello">W czym pomóc{hello ? `, ${hello}` : ''}?</h2>
        <Composer mode={effectiveMode} setMode={setMode} big autoFocus={autoFocus} contextLabel={label} />
        <div className="asst-tiles">
          {TILES.map((t, i) => (
            <button key={t.title} type="button" style={{ '--ma-i': i } as CSSProperties} className="asst-tile" onClick={() => ask(t.q, effectiveMode)}>
              <span className="asst-tile-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{t.icon}</svg>
              </span>
              <strong>{t.title}</strong>
              <span>{t.q}</span>
            </button>
          ))}
        </div>
        <ul className="asst-kb" aria-label="Baza wiedzy">
          {KNOWLEDGE.map((k) => <li key={k}><DocIcon />{k}</li>)}
        </ul>
      </div>
    )
  }

  return (
    <div className={`asst asst-${variant}${preview ? ' with-preview' : ''}`}>
      <div className="asst-main">
        {(toggle || msgs.length > 0) && (
          <div className="asst-top">
            {toggle}
            <span className="grow" />
            {msgs.length > 0 && <button type="button" className="link" onClick={() => { resetChat(); setActive(null) }}>Nowa rozmowa</button>}
          </div>
        )}
        <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{announce}</p>
        <div className="asst-feed">
          {msgs.length === 0 && (
            <div className="asst-start">
              <Compass size={56} state="still" />
              <p className="asst-start-title">W czym pomóc{hello ? `, ${hello}` : ''}?</p>
              <div className="asst-chips">
                <button type="button" style={{ '--ma-i': 0 } as CSSProperties} className={guideTried() ? 'asst-chip' : 'asst-chip asst-chip-new'} onClick={() => ask(guideTry, effectiveMode)}>
                  {!guideTried() && <span className="asst-new">Nowe</span>}➜ {guideTry}
                </button>
                {chips.map((c, i) => <button key={c} type="button" style={{ '--ma-i': i + 1 } as CSSProperties} className="asst-chip" onClick={() => { if (entity) setMode('context'); void ask(c, entity ? 'context' : effectiveMode) }}>{c}</button>)}
              </div>
            </div>
          )}
          {msgs.map((m) => m.role === 'user' ? (
            <div key={m.id} className={`asst-user${isFresh(m) ? ' ma-new' : ''}`}>
              <p className="asst-bubble">{m.content}</p>
              {variant === 'page' && <Avatar path="account/avatar" name={userName || 'Ty'} size={32} decorative />}
            </div>
          ) : (
            <Answer key={m.id} msg={m} last={m === lastAssistant && !busy} mode={effectiveMode}
              active={active?.id === m.id ? active.n : null} inlinePreview={variant !== 'page'} fresh={isFresh(m)}
              onPick={(n) => setActive(n == null ? null : { id: m.id, n })} />
          ))}
          {busy && <BusyLine big={variant === 'page'} onPhase={onPhase} />}
          <div ref={end} />
        </div>
        <Composer mode={effectiveMode} setMode={setMode} autoFocus={autoFocus} contextLabel={label} />
        {variant !== 'page' && <p className="asst-note"><Spark /> Asystent może się mylić — sprawdzaj ważne informacje.</p>}
      </div>
      {preview && active && (
        <div className="asst-side ma-enter">
          <SourcePreview key={`${active.id}-${active.n}`} parsed={preview} n={active.n} mode={effectiveMode} onPick={(n) => setActive({ id: active.id, n })} onClose={() => setActive(null)} />
        </div>
      )}
    </div>
  )
}
