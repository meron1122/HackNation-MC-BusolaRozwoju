import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react'
import { api } from '../api'
import { Avatar } from '../Avatar'
import { AiFrame, Compass, Info, ScaleBar, Spark, Warn } from '../v2'
import { DOCS, parseReply, type Parsed, type SourceRef } from './parse'
import { ask, contextFor, hasEntity, resetChat, useAssistant, type Mode, type Msg } from './store'
import './assistant.css'

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

/** Ilustracja „lupa nad półką” (brak w bazie). */
function ShelfIllustration() {
  return (
    <svg viewBox="0 0 72 56" width="72" height="56" aria-hidden="true" className="asst-shelf">
      <rect x="6" y="20" width="9" height="24" rx="2" fill="#DCEEFB" stroke="#5D6680" strokeWidth="1.5" />
      <rect x="17" y="26" width="8" height="18" rx="2" fill="#E4E7EF" stroke="#5D6680" strokeWidth="1.5" />
      <rect x="27" y="30" width="7" height="14" rx="2" fill="#fff" stroke="#5D6680" strokeWidth="1.5" strokeDasharray="2 2" />
      <path d="M2 46h60" stroke="#5D6680" strokeWidth="2" strokeLinecap="round" />
      <path d="M38 40h22" stroke="#5D6680" strokeWidth="1.5" strokeDasharray="2 3" />
      <circle cx="48" cy="16" r="9" fill="#fff" stroke="#1F2A5A" strokeWidth="3" />
      <path d="M54.5 22.5l7 7" stroke="#1F2A5A" strokeWidth="3.5" strokeLinecap="round" />
    </svg>
  )
}

function SourceChips({ sources, active, onPick, secondary = false }: {
  sources: SourceRef[]; active: number | null; onPick: (n: number) => void; secondary?: boolean
}) {
  if (!sources.length) return null
  return (
    <div className="asst-sources">
      {sources.map((s) => (
        <button key={s.n} type="button" className={`asst-src${active === s.n ? ' active' : ''}${secondary ? ' secondary' : ''}`}
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
  if (!s) return null
  const sentences = parsed.text.split(/(?<=[.!?])\s+/).filter((t) => t.includes(`⟦${n}⟧`))
  return (
    <aside className="asst-preview" aria-label={`Źródło ${n}: ${s.label}`}>
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

function Answer({ msg, last, mode, active, onPick, inlinePreview }: {
  msg: Msg; last: boolean; mode: Mode; active: number | null; onPick: (n: number | null) => void; inlinePreview: boolean
}) {
  if (msg.error) return <Warn title="Asystent jest chwilowo niedostępny"><p>{msg.content}</p></Warn>
  const p = parseReply(msg.content)
  const pick = (n: number) => onPick(active === n ? null : n)
  const avg = p.kind === 'answer' ? msg.content.match(/(?:średni\p{L}*|wynik\p{L}*)\s+(?:wynosi\s+|to\s+)?(\d)[,.](\d{1,2})/u) : null

  if (p.kind === 'notFound' || p.kind === 'unresolved') {
    const firstLine = p.text.split(/\n+/).map((l) => l.trim()).filter(Boolean)
    const body = firstLine.filter((l) => !/^nie znalaz/i.test(l)).join(' ') || firstLine.join(' ')
    return (
      <AiFrame className="asst-card asst-missing">
        <div className="asst-missing-row">
          <ShelfIllustration />
          <div>
            <h3>{p.kind === 'notFound' ? 'Nie znalazłem tego w bazie wiedzy' : 'Baza tego nie rozstrzyga'}</h3>
            <Rich text={body.replace(/^Nie znalazłem[^.]*\.\s*/i, '')} />
            {p.sources.length > 0 && (
              <div className="asst-see">
                <span>Zobacz też</span>
                <SourceChips sources={p.sources} active={active} onPick={pick} secondary />
              </div>
            )}
          </div>
        </div>
        {inlinePreview && active && <SourcePreview parsed={p} n={active} mode={mode} onPick={onPick} onClose={() => onPick(null)} />}
      </AiFrame>
    )
  }

  if (p.kind === 'clarify') {
    return (
      <AiFrame className="asst-card">
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
    <AiFrame className="asst-card" aside={p.scope && <span className="asst-scope">{p.scope}</span>}>
      {(p.verdict || avg) && (
        <div className="asst-verdict">
          {p.verdict && <strong>{p.verdict}</strong>}
          {avg && <ScaleBar value={Number(`${avg[1]}.${avg[2]}`)} />}
        </div>
      )}
      <Rich text={p.text} onFn={pick} active={active} />
      <SourceChips sources={p.sources} active={active} onPick={pick} />
      {inlinePreview && active && <SourcePreview parsed={p} n={active} mode={mode} onPick={onPick} onClose={() => onPick(null)} />}
    </AiFrame>
  )
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
        placeholder="Zapytaj o zasady oceny…" autoComplete="off" />
      {mode === 'context' && hasEntity(screen) ? (
        <span className="asst-ctx">
          <span className="asst-ctx-label">{contextLabel || 'Ten ekran'}</span>
          <Info label="Co trafia do modelu" align="end">Do modelu trafia to, co widzisz w tej ocenie, w zakresie Twoich uprawnień.</Info>
          <button type="button" className="asst-x" aria-label="Pytaj bez kontekstu ekranu" onClick={() => setMode('rules')}>×</button>
        </span>
      ) : (
        <span className="asst-shield">
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
            <path d="M8 1.6l5 2v4.1c0 3.1-2.1 5.4-5 6.7-2.9-1.3-5-3.6-5-6.7V3.6z M5.6 8l1.7 1.7 3.2-3.4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round" />
          </svg>
          bez nazwisk
          <Info label="Prywatność pytania" align="end">Pytanie idzie do modelu bez danych osób z ekranu.</Info>
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
  const effectiveMode: Mode = entity ? mode : 'rules'
  const ctxKey = JSON.stringify(contextFor(effectiveMode))

  useEffect(() => {
    if (effectiveMode !== 'context') return
    let on = true
    api<{ label: string }>('agent/context', 'POST', JSON.parse(ctxKey)).then((r) => on && setLabel(r.label), () => on && setLabel(''))
    return () => { on = false }
  }, [effectiveMode, ctxKey])

  useEffect(() => { end.current?.scrollIntoView({ block: 'end', behavior: 'auto' }) }, [msgs.length, busy])

  const lastAssistant = [...msgs].reverse().find((m) => m.role === 'assistant')
  const activeMsg = active ? msgs.find((m) => m.id === active.id) : null
  const preview = variant === 'page' && activeMsg && active ? parseReply(activeMsg.content) : null
  const chips = (step && STEP_CHIPS[step.id]) ?? PAGE_CHIPS[screen.evaluationId ? 'evaluations' : screen.page] ?? DEFAULT_CHIPS
  const hello = vocative(userName)

  const toggle = entity && (
    <div className="asst-mode" role="group" aria-label="Tryb pytania">
      <button type="button" aria-pressed={effectiveMode === 'rules'} onClick={() => setMode('rules')}>Zasady</button>
      <button type="button" aria-pressed={effectiveMode === 'context'} onClick={() => setMode('context')}>Rozmowa</button>
    </div>
  )

  if (msgs.length === 0 && variant === 'page') {
    return (
      <div className="asst asst-page-start">
        {toggle}
        <Compass size={120} state="settle" halo />
        <h2 className="asst-hello">W czym pomóc{hello ? `, ${hello}` : ''}?</h2>
        <Composer mode={effectiveMode} setMode={setMode} big autoFocus={autoFocus} contextLabel={label} />
        <div className="asst-tiles">
          {TILES.map((t) => (
            <button key={t.title} type="button" className="asst-tile" onClick={() => ask(t.q, effectiveMode)}>
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
        <div className="asst-feed" aria-live="polite">
          {msgs.length === 0 && (
            <div className="asst-start">
              <Compass size={56} state="settle" />
              <p className="asst-start-title">W czym pomóc{hello ? `, ${hello}` : ''}?</p>
              <div className="asst-chips">
                {chips.map((c) => <button key={c} type="button" className="asst-chip" onClick={() => ask(c, effectiveMode)}>{c}</button>)}
              </div>
            </div>
          )}
          {msgs.map((m) => m.role === 'user' ? (
            <div key={m.id} className="asst-user">
              <p className="asst-bubble">{m.content}</p>
              {variant === 'page' && <Avatar path="account/avatar" name={userName || 'Ty'} size={32} decorative />}
            </div>
          ) : (
            <Answer key={m.id} msg={m} last={m === lastAssistant && !busy} mode={effectiveMode}
              active={active?.id === m.id ? active.n : null} inlinePreview={variant !== 'page'}
              onPick={(n) => setActive(n == null ? null : { id: m.id, n })} />
          ))}
          {busy && (
            <div className="v2-ai asst-card asst-busy" role="status">
              <Compass size={44} state="search" />
              <span>Szukam w bazie wiedzy…</span>
            </div>
          )}
          <div ref={end} />
        </div>
        <Composer mode={effectiveMode} setMode={setMode} autoFocus={autoFocus} contextLabel={label} />
        {variant !== 'page' && <p className="asst-note"><Spark /> Podpowiadam, decyzję podejmujesz Ty.</p>}
      </div>
      {preview && active && (
        <div className="asst-side">
          <SourcePreview parsed={preview} n={active.n} mode={effectiveMode} onPick={(n) => setActive({ id: active.id, n })} onClose={() => setActive(null)} />
        </div>
      )}
    </div>
  )
}
