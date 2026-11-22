// Drobne części pulpitu i panelu HR v2: mini-stepper etapów, odznaka arkusza, dzwonek przypomnienia.
import { Avatar } from './Avatar'
import { sheetOf, stagePos } from './dash-model'
import type { Progress } from './evaluation/types'

/** 5 kropek etapów v5 (4 przy pierwszej ocenie, romb na końcu); podpis tylko pod bieżącą. */
export function MiniStepper({ progress, caption = 'label', size = 'md' }: {
  progress: Progress
  /** 'label' = „Start cyklu”, 'count' = „Start cyklu · 1/5”, 'none' = bez podpisu. */
  caption?: 'label' | 'count' | 'none'
  size?: 'md' | 'lg'
}) {
  const s = stagePos(progress)
  const total = s.labels.length
  const now = s.done ? null : s.labels[s.index]
  const text = s.done ? 'Zakończona' : caption === 'count' ? `${now} · ${s.index + 1}/${total}` : now
  return (
    <span className={`dash-steps dash-steps-${size}${s.first ? ' first' : ''}`}
      role="img" aria-label={s.done ? 'Ocena zakończona' : `Etap ${s.index + 1} z ${total}: ${now}`}>
      <span className="dash-steps-dots" aria-hidden="true">
        {s.labels.map((l, i) => (
          <span key={l} className={i < s.index ? 'done' : i === s.index ? 'now' : undefined} />
        ))}
      </span>
      {caption !== 'none' && <span className="dash-steps-caption" aria-hidden="true">{text}</span>}
    </span>
  )
}

/** Arkusz jako odznaka „B”/„C”; pierwsza ocena jako granatowy romb ◆ (lawenda tylko dla AI). */
export function SheetMark({ code }: { code: string }) {
  const sheet = sheetOf(code)
  return sheet
    ? <span className="dash-sheet" title={`Arkusz ${sheet}`}><span aria-hidden="true">{sheet}</span><span className="sr-only">arkusz {sheet}</span></span>
    : <span className="dash-first" title="Pierwsza ocena"><span aria-hidden="true">◆</span><span className="sr-only">pierwsza ocena</span></span>
}

/** Dzwonek z mini-awatarem adresata przypomnienia. */
export function BellButton({ name, avatarPath, disabled, busy, sentAt, onClick }: {
  name: string
  avatarPath: string | null
  disabled?: boolean
  busy?: boolean
  sentAt?: string | null
  onClick: () => void
}) {
  const label = `Przypomnij: ${name}${sentAt ? ` (ostatnio ${sentAt})` : ''}`
  return (
    <button type="button" className={`dash-bell${sentAt ? ' sent' : ''}`} disabled={disabled} aria-label={label} title={label}
      aria-busy={busy || undefined} onClick={onClick}>
      <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
        <path d="M10 2.5a5 5 0 0 0-5 5v3.2L3.6 13.4a.8.8 0 0 0 .7 1.2h11.4a.8.8 0 0 0 .7-1.2L15 10.7V7.5a5 5 0 0 0-5-5Z"
          fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M8 16.6a2 2 0 0 0 4 0" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      <Avatar path={avatarPath} name={name} size={26} decorative />
    </button>
  )
}
