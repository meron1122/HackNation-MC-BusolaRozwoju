import { useState } from 'react'
import { AskBox, ChatFeed, useChat } from './assistant/AssistantPanel'
import { SUGGESTED } from './assistant/knowledge'
import './hifi-pages.css'

type Mode = 'rules' | 'interview'
const MODES: { key: Mode; label: string; intro: string; questions: string[]; placeholder: string }[] = [
  {
    key: 'rules',
    label: 'Zasady i procedury',
    intro: 'Terminy, arkusze, kryteria, skala ocen, sprzeciw. Odpowiedź zawsze ze wskazaniem przepisu albo strony poradnika.',
    questions: SUGGESTED,
    placeholder: 'Zapytaj o zasady oceny…',
  },
  {
    key: 'interview',
    label: 'Przygotuj rozmowę',
    intro: 'Co omówić na rozmowie rozpoczynającej i oceniającej, kiedy ją przeprowadzić i jak zakończyć. Bez danych konkretnych osób.',
    questions: [
      'Co muszę omówić na rozmowie rozpoczynającej?',
      'Ile mam czasu na rozmowę rozpoczynającą?',
      'O czym rozmawiam na rozmowie oceniającej?',
      'Kiedy przeprowadzić rozmowę oceniającą?',
    ],
    placeholder: 'Zapytaj, jak przygotować rozmowę…',
  },
]

/** W13: asystent w pełnym widoku. Odpowiada tylko z bazy wiedzy (assistant/knowledge.ts) i zawsze podaje źródło. */
export function AssistantPage() {
  const { msgs, send } = useChat()
  const [mode, setMode] = useState<Mode>('rules')
  const m = MODES.find((x) => x.key === mode)!
  return (
    <section className="hifi-page hifi-assistant">
      <div className="hifi-head">
        <div>
          <h1><span aria-hidden="true" className="hifi-spark">✦</span> Asystent zasad oceny</h1>
          <p className="hifi-sub">Ocena okresowa i pierwsza ocena w służbie cywilnej</p>
        </div>
      </div>
      <div className="hifi-modes" role="group" aria-label="Tryb asystenta">
        {MODES.map((x) => (
          <button key={x.key} type="button" className={x.key === mode ? 'hifi-chip active' : 'hifi-chip'} aria-pressed={x.key === mode} onClick={() => setMode(x.key)}>
            {x.label}
          </button>
        ))}
      </div>
      <div className="card hifi-card hifi-kb">
        <p>
          <strong>Baza wiedzy:</strong> rozporządzenia o ocenie okresowej (2016) i pierwszej ocenie (2015), poradniki KPRM
          oraz model kompetencji. Asystent odpowiada tylko na jej podstawie i zawsze wskazuje źródło.
          Gdy czegoś w niej nie ma, mówi to wprost.
        </p>
        <p className="muted">{m.intro}</p>
      </div>
      <div className="hifi-suggest">
        <p className="hifi-group-title">{msgs.length === 0 ? 'Możesz zacząć od pytania' : 'Inne pytania'}</p>
        <div className="assistant-chips">
          {m.questions.map((q) => <button key={q} type="button" className="assistant-chip" onClick={() => send(q)}>{q}</button>)}
        </div>
      </div>
      {msgs.length > 0 && <div className="hifi-feed"><ChatFeed msgs={msgs} onAsk={send} /></div>}
      <div className="hifi-ask-bar">
        <AskBox key={mode} onAsk={send} placeholder={m.placeholder} />
        <p className="muted small">
          Asystent podpowiada, nie decyduje. Dane pracowników nie trafiają do asystenta: pytaj o zasady, nie o konkretne osoby.
        </p>
      </div>
    </section>
  )
}
