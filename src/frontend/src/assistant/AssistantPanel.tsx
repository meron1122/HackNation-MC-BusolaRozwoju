import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ask, type Answer } from './knowledge'

type Msg = { id: number; q: string; a?: Answer }

/** Odsłania tekst stopniowo (jak odpowiedź modelu); czytnik ekranu dostaje całość od razu. */
function Reveal({ text }: { text: string }) {
  const [n, setN] = useState(() => (matchMedia('(prefers-reduced-motion: reduce)').matches ? text.length : 0))
  useEffect(() => {
    if (n >= text.length) return
    const t = setTimeout(() => setN((x) => Math.min(text.length, x + 6)), 16)
    return () => clearTimeout(t)
  }, [n, text])
  return <p><span aria-hidden="true">{text.slice(0, n)}</span><span className="sr-only">{text}</span></p>
}

function AnswerView({ a, onAsk }: { a: Answer; onAsk: (q: string) => void }) {
  if (a.kind === 'unknown') {
    return (
      <div className="bubble-a">
        <span className="pill attention" style={{ justifySelf: 'start' }}>? Brak w bazie wiedzy</span>
        <p>Nie mam tego w bazie wiedzy. Baza obejmuje rozporządzenia o ocenach w służbie cywilnej, poradniki KPRM i model kompetencji. Zapytaj komórkę kadrową.</p>
        {a.related.length > 0 && (
          <div className="ai-source"><b>Może pomóc</b>
            {a.related.map((r) => <div key={r.id}><button type="button" className="link" onClick={() => onAsk(r.q)}>{r.q}</button></div>)}
          </div>
        )}
      </div>
    )
  }
  return (
    <div className="bubble-a">
      <span className="ai-tag">✦ Asystent · odpowiedź z bazy wiedzy</span>
      <Reveal text={a.item.a} />
      <div className="ai-source"><b>Źródło</b>{a.item.src}</div>
      {a.related.length > 0 && (
        <div className="assistant-chips">
          {a.related.slice(0, 2).map((r) => <button key={r.id} type="button" className="assistant-chip" onClick={() => onAsk(r.q)}>{r.q}</button>)}
        </div>
      )}
    </div>
  )
}

export function useChat() {
  const [msgs, setMsgs] = useState<Msg[]>([])
  const next = useRef(0)
  const send = (q: string) => {
    const id = ++next.current
    setMsgs((m) => [...m, { id, q }])
    setTimeout(() => setMsgs((m) => m.map((x) => (x.id === id ? { ...x, a: ask(q) } : x))), 450)
  }
  return { msgs, send }
}

export function ChatFeed({ msgs, onAsk }: { msgs: Msg[]; onAsk: (q: string) => void }) {
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [msgs])
  return (
    <div aria-live="polite" style={{ display: 'grid', gap: 12 }}>
      {msgs.map((m) => (
        <div key={m.id} style={{ display: 'grid', gap: 10 }}>
          <div className="bubble-q">{m.q}</div>
          {m.a ? <AnswerView a={m.a} onAsk={onAsk} /> : <div className="bubble-a" aria-label="Asystent szuka odpowiedzi"><span className="typing" aria-hidden="true"><span /><span /><span /></span></div>}
        </div>
      ))}
      <div ref={end} />
    </div>
  )
}

export function AskBox({ onAsk, placeholder = 'Zapytaj o zasady oceny…' }: { onAsk: (q: string) => void; placeholder?: string }) {
  const [v, setV] = useState('')
  return (
    <form className="assistant-ask" onSubmit={(e) => { e.preventDefault(); if (v.trim()) { onAsk(v.trim()); setV('') } }}>
      <label className="sr-only" htmlFor="assistant-q">Pytanie do asystenta</label>
      <input id="assistant-q" value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder} autoComplete="off" />
      <button type="submit" disabled={!v.trim()} style={{ padding: '8px 14px' }}>Wyślij</button>
    </form>
  )
}

/** Podpowiedzi pytań zależne od kroku kreatora (pytania, na które baza ma odpowiedź ze źródłem). */
const CHIPS: Record<string, string[]> = {
  start: ['Kto podlega ocenie okresowej i kto ją przeprowadza?', 'Który arkusz wybrać dla naczelnika wydziału?'],
  criteria: ['Ile kryteriów dodatkowych mogę wybrać?', 'Który arkusz wybrać dla naczelnika wydziału?'],
  kickoff: ['Co muszę omówić na rozmowie rozpoczynającej?', 'Ile mam czasu na rozmowę rozpoczynającą?'],
  part1: ['Co potwierdza podpis ocenianego w części I?', 'Czy mogę w części I wpisać dowolny termin sporządzenia oceny?'],
  notes: ['Czy okres oceny trwa zawsze równe 24 miesiące?', 'Pracownica była 2 miesiące na L4. Czy termin oceny się zmienia?'],
  indicators: ['Od czego zacząć wystawianie ocen cząstkowych?', 'Jak wyliczyć wynik oceny okresowej?'],
  interview: ['O czym rozmawiam na rozmowie oceniającej?', 'Kiedy przeprowadzić rozmowę oceniającą?'],
  result: ['Czy wnioski do IPRZ są obowiązkowe?', 'Czy muszę pisać uzasadnienie oceny?'],
  review: ['Kiedy mogę złożyć wniosek o kolejny stopień służbowy?', 'Średnia 4,00 – jaki to poziom?'],
  ack: ['Do kogo oceniany składa sprzeciw?', 'Ile jest czasu na sprzeciw i jego rozpatrzenie?'],
}
const MODE: Record<string, string> = { indicators: 'Notatki i zasady', interview: 'Przygotuj rozmowę', result: 'Asystent pisania' }

/** Panel boczny kreatora (H07–H11): kontekst kroku u góry, rozmowa, podpowiedzi i pole pytania. */
export function AssistantPanel({ stepId, context }: { stepId: string; context?: ReactNode }) {
  const { msgs, send } = useChat()
  const chips = CHIPS[stepId] ?? CHIPS.indicators
  return (
    <aside className="wizard-assistant" aria-label="Asystent">
      <header className="assistant-head">
        <span style={{ color: 'var(--link)', fontWeight: 700 }} aria-hidden="true">✦</span>
        <h2>Asystent</h2>
        <span className="grow" />
        <span className="pill info">{MODE[stepId] ?? 'Zasady'}</span>
      </header>
      <div className="assistant-feed">
        {context}
        {msgs.length === 0 && !context && (
          <p className="muted small">Pytaj o zasady oceny okresowej i pierwszej oceny. Odpowiadam tylko z bazy wiedzy i zawsze podaję źródło.</p>
        )}
        <ChatFeed msgs={msgs} onAsk={send} />
      </div>
      <footer className="assistant-foot">
        <div className="assistant-chips">{chips.map((c) => <button key={c} type="button" className="assistant-chip" onClick={() => send(c)}>{c}</button>)}</div>
        <AskBox onAsk={send} />
        <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>Asystent podpowiada. Decyzję podejmujesz Ty. Dane pracowników nie trafiają do asystenta.</p>
      </footer>
    </aside>
  )
}
