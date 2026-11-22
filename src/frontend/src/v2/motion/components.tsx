import { useEffect, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { useDelayedFlag, type SaveState } from './hooks'

const REDUCED = '(prefers-reduced-motion: reduce)'
const reduced = () => typeof window !== 'undefined' && window.matchMedia(REDUCED).matches

/* ------------------------------------------------------------------ Igła */

export type NeedleMotion = 'none' | 'seek' | 'spin'

/**
 * Igła busoli (dwa płaskie groty: granat i błękit, biała oś), pozycja jak w znaku (45°).
 * `spin` = pętla obrotów 180° ze sprężyną i pauzą (tylko loadery), `seek` = wahanie (asystent szuka).
 * Bez `label` to dekoracja (aria-hidden); z `label` ma role="img".
 */
export function Needle({ size = 20, motion = 'none', label }: { size?: number; motion?: NeedleMotion; label?: string }) {
  return (
    <svg className={`m-needle m-needle--${motion}`} width={size} height={size} viewBox="0 0 1024 1024" focusable="false"
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}>
      <g className="m-needle-g">
        <polygon fill="#5AA9E6" points="380,380 116,908 644,644 524,500" />
        <polygon fill="#1F2A5A" points="380,380 908,116 644,644" />
        <circle fill="#FFFFFF" cx="512" cy="512" r="46" />
      </g>
    </svg>
  )
}

/* ------------------------------------------------------------------ Loader strony */

/** Wyśrodkowana igła + tekst. Pokazuje się po 300 ms (bez migania), po 10 s dopisuje „To trwa dłużej niż zwykle”. */
export function PageLoader({ active = true, label = 'Wczytuję…' }: { active?: boolean; label?: string }) {
  const shown = useDelayedFlag(active)
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    if (!active) { setSlow(false); return }
    const t = window.setTimeout(() => setSlow(true), 10000)
    return () => window.clearTimeout(t)
  }, [active])
  if (!active && !shown) return null
  return (
    <div className="m-page-loader" role="status" aria-live="polite" aria-busy={active}>
      {shown && (
        <div className="m-page-loader-box">
          <Needle size={56} motion="spin" />
          <span className="m-page-loader-text">{label}</span>
          {slow && <span className="m-page-loader-sub">To trwa dłużej niż zwykle. Nadal wczytuję.</span>}
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ Szkielet */

export type SkeletonVariant = 'wizard' | 'list' | 'cards' | 'text' | 'detail'

const W = ['92%', '78%', '85%', '64%', '88%', '70%', '81%', '58%']
const bar = (w: string, cls = '', h?: number) => <span className={`m-skel ${cls}`} style={{ width: w, height: h }} />

function lines(n: number, offset = 0) {
  return Array.from({ length: n }, (_, i) => <span key={i} className="m-skel" style={{ width: W[(i + offset) % W.length] }} />)
}

/** Szkielet ekranu: spokojny shimmer z pauzą. Przy ograniczonym ruchu statyczny, z widocznym „Wczytuję…”. */
export function Skeleton({ variant, rows }: { variant: SkeletonVariant; rows?: number }) {
  let body: ReactNode
  switch (variant) {
    case 'text':
      body = lines(rows ?? 3)
      break
    case 'list':
      body = Array.from({ length: rows ?? 5 }, (_, i) => (
        <div key={i} className="m-skel-row">
          <span className="m-skel m-skel--circle" style={{ width: 32, height: 32 }} />
          <div className="m-skel-stack">{bar(['48%', '62%', '40%', '55%', '45%'][i % 5])}{bar('30%', '', 10)}</div>
          {bar('88px', 'm-skel--pill', 24)}
        </div>
      ))
      break
    case 'cards':
      body = Array.from({ length: rows ?? 3 }, (_, i) => (
        <div key={i} className="m-skel-panel">
          {bar('55%', 'm-skel--title', 20)}
          {lines(2, i)}
          {bar('40%', 'm-skel--pill', 28)}
        </div>
      ))
      break
    case 'detail':
      body = (
        <>
          <div className="m-skel-stack" style={{ flex: 'none' }}>{bar('42%', 'm-skel--title', 30)}{bar('28%')}</div>
          <div className="m-skel-cols">
            <div className="m-skel-panel">{bar('35%', 'm-skel--title', 20)}{lines(rows ?? 5)}</div>
            <div className="m-skel-panel">{bar('50%', 'm-skel--title', 20)}{lines(3, 2)}</div>
          </div>
        </>
      )
      break
    case 'wizard':
      body = (
        <>
          <div className="m-skel-panel m-skel-rail">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="m-skel-row" style={{ padding: '4px 0' }}>
                <span className="m-skel m-skel--circle" style={{ width: 24, height: 24 }} />
                {bar(W[(i + 3) % W.length])}
              </div>
            ))}
          </div>
          <div className="m-skel-panel" style={{ gap: 16 }}>
            {bar('20%', '', 10)}
            {bar('48%', 'm-skel--title', 28)}
            {lines(rows ?? 3)}
            <div className="m-skel-tiles">
              {Array.from({ length: 5 }, (_, i) => <span key={i} className="m-skel m-skel--block" style={{ height: 72 }} />)}
            </div>
          </div>
        </>
      )
      break
  }
  return (
    <div className={`m-skeleton m-skeleton--${variant}`} aria-busy="true" role="status">
      <span className="m-skel-note m-sr">Wczytuję…</span>
      {body}
    </div>
  )
}

/* ------------------------------------------------------------------ Reveal */

/**
 * Crossfade 200 ms przy pierwszym renderze i przy każdej zmianie `k` (sama przezroczystość, bez przesunięcia układu).
 * Nie przemontowuje dzieci: zmiana `k` tylko odtwarza wejście, stan komponentów zostaje.
 */
export function Reveal({ children, k }: { children: ReactNode; k?: string | number | null }) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || reduced() || typeof el.animate !== 'function') return
    const a = el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'cubic-bezier(.2,.8,.2,1)' })
    return () => a.cancel()
  }, [k])
  return <div ref={ref} className="m-reveal">{children}</div>
}

/* ------------------------------------------------------------------ Błąd */

/** Spokojny błąd ładowania: czerwień tylko na ikonie, „Spróbuj ponownie” przechodzi w kropki podczas ponawiania. */
export function ErrorState({ title = 'Nie udało się wczytać danych', detail, onRetry, retrying = false }: {
  title?: string; detail?: ReactNode; onRetry?: () => void; retrying?: boolean
}) {
  const busy = useDelayedFlag(retrying, { delay: 0, min: 400 })
  return (
    <div className="m-error" role="status" aria-live="polite">
      <svg className="m-error-ico" viewBox="0 0 40 40" aria-hidden="true">
        <circle cx="20" cy="20" r="17" fill="none" stroke="#B42318" strokeWidth="2.5" />
        <path d="M20 11.5v10" stroke="#B42318" strokeWidth="3" strokeLinecap="round" />
        <circle cx="20" cy="27.5" r="2" fill="#B42318" />
      </svg>
      <div>
        <p className="m-error-title">{title}</p>
        {detail && <p className="m-error-detail">{detail}</p>}
        {onRetry && (
          <div className="m-error-actions">
            <button type="button" className="m-state-btn" aria-disabled={busy || retrying || undefined}
              onClick={() => { if (!retrying) onRetry() }}>
              <span className={`m-state-lbl${busy ? '' : ' is-on'}`} aria-hidden={busy}>Spróbuj ponownie</span>
              <span className={`m-state-lbl${busy ? ' is-on' : ''}`} aria-hidden={!busy}>
                <span className="m-dots" aria-hidden="true"><i /><i /><i /></span>Wczytuję
              </span>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ Pusty stan */

/** Wejście pustego stanu: każde dziecko wchodzi z dołu (6 px), co 40 ms. */
export function EmptyEnter({ children }: { children: ReactNode }) {
  return <div className="m-empty-enter m-stagger">{children}</div>
}

/* ------------------------------------------------------------------ Loadable */

function errorText(error: unknown): ReactNode | undefined {
  if (!error || error === true) return undefined
  if (typeof error === 'string') return error
  if (error instanceof Error) return error.message
  return undefined
}

/**
 * Szkielet (po 300 ms, min. 500 ms) → treść z crossfade’em; błąd → ErrorState z ponowieniem; pusta lista → emptyNode.
 * `skeleton`: wariant szkieletu albo własny węzeł. `children`: ReactNode albo funkcja (renderowana dopiero po wczytaniu).
 * Ponowienie: ustaw `loading` na true, a `error` zostaw do czasu odpowiedzi; przycisk pokaże wtedy kropki.
 */
export function Loadable({ loading, error, empty = false, skeleton, onRetry, emptyNode, children }: {
  loading: boolean
  error?: unknown
  empty?: boolean
  skeleton: SkeletonVariant | ReactNode
  onRetry?: () => void
  emptyNode?: ReactNode
  children: ReactNode | (() => ReactNode)
}) {
  const showSkel = useDelayedFlag(loading && !error)
  let phase: 'wait' | 'skel' | 'error' | 'empty' | 'ready'
  if (error) phase = 'error'
  else if (showSkel) phase = 'skel'
  else if (loading) phase = 'wait'
  else if (empty) phase = 'empty'
  else phase = 'ready'

  if (phase === 'wait') return <div className="m-loadable-wait" aria-busy="true" />

  let node: ReactNode
  if (phase === 'error') node = <ErrorState detail={errorText(error)} onRetry={onRetry} retrying={loading} />
  else if (phase === 'skel') node = typeof skeleton === 'string' ? <Skeleton variant={skeleton as SkeletonVariant} /> : skeleton
  else if (phase === 'empty') node = <EmptyEnter>{emptyNode ?? <p className="muted" style={{ margin: 0 }}>Nic tu jeszcze nie ma.</p>}</EmptyEnter>
  else node = typeof children === 'function' ? (children as () => ReactNode)() : children

  return <Reveal k={phase}>{node}</Reveal>
}

/* ------------------------------------------------------------------ Zapis */

/**
 * Przycisk zapisu o stałej szerokości: „Zapisz” → kropki (dopiero po 300 ms) → „Zapisano ✓”.
 * Stan podaje rodzic (np. z `useSaveState()`); podczas zapisu przycisk ma aria-disabled i ignoruje kliknięcia.
 */
export function SaveButton({ state, onClick, children = 'Zapisz', className, disabled, type = 'button' }: {
  state: SaveState
  onClick?: ButtonHTMLAttributes<HTMLButtonElement>['onClick']
  children?: ReactNode
  className?: string
  disabled?: boolean
  type?: 'button' | 'submit' | 'reset'
}) {
  const busy = useDelayedFlag(state === 'saving')
  const view = busy ? 'saving' : state === 'saved' ? 'saved' : 'idle'
  return (
    <button type={type} disabled={disabled} className={`m-state-btn${className ? ` ${className}` : ''}`}
      aria-disabled={state === 'saving' || undefined}
      onClick={(e) => { if (state === 'saving') { e.preventDefault(); return } onClick?.(e) }}>
      <span className={`m-state-lbl${view === 'idle' ? ' is-on' : ''}`} aria-hidden={view !== 'idle'}>{children}</span>
      <span className={`m-state-lbl${view === 'saving' ? ' is-on' : ''}`} aria-hidden={view !== 'saving'}>
        <span className="m-dots" aria-hidden="true"><i /><i /><i /></span>Zapisuję
      </span>
      <span className={`m-state-lbl${view === 'saved' ? ' is-on' : ''}`} aria-hidden={view !== 'saved'}>
        Zapisano <span className="m-check" aria-hidden="true">✓</span>
      </span>
      <span className="m-sr" role="status" aria-live="polite">{state === 'saved' ? 'Zapisano' : ''}</span>
    </button>
  )
}

const hhmm = (d: Date) => d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })

/** Autozapis w linii: „Zapisuję…” / „✓ Zapisano 12:04” / błąd. Czytnik ekranu słyszy tylko „Zapisano”. */
export function AutosaveStatus({ state, savedAt }: { state: 'idle' | 'saving' | 'saved' | 'error'; savedAt?: Date }) {
  const busy = useDelayedFlag(state === 'saving')
  let txt: ReactNode = null
  if (state === 'error') {
    txt = <><svg width="14" height="14" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="17" fill="none" stroke="#B42318" strokeWidth="4" /><path d="M20 11.5v10" stroke="#B42318" strokeWidth="4.5" strokeLinecap="round" /><circle cx="20" cy="28" r="2.6" fill="#B42318" /></svg>Nie udało się zapisać</>
  } else if (busy || state === 'saving') {
    txt = busy ? <><span className="m-dots" aria-hidden="true"><i /><i /><i /></span>Zapisuję…</> : null
  } else if (state === 'saved' || savedAt) {
    txt = <><span className="m-autosave-ok" aria-hidden="true">✓</span>Zapisano{savedAt ? ` ${hhmm(savedAt)}` : ''}</>
  }
  const key = busy ? 'saving' : state
  return (
    <span className="m-autosave" data-state={state}>
      {txt && <span key={key} className="m-autosave-txt">{txt}</span>}
      <span className="m-sr" role="status" aria-live="polite">{state === 'saved' ? 'Zapisano' : ''}</span>
    </span>
  )
}

/* ------------------------------------------------------------------ Przeładowanie fragmentu */

/** Odświeżanie fragmentu: aria-busy od razu, po 300 ms przygaszenie do 0,55 i chip „Wczytuję” w rogu. */
export function Refreshing({ busy, children }: { busy: boolean; children: ReactNode }) {
  const pending = useDelayedFlag(busy)
  return (
    <div className={`m-refresh${pending ? ' is-pending' : ''}`} aria-busy={busy}>
      <div className="m-refresh-body">{children}</div>
      <span className="m-refresh-chip" aria-hidden={!pending}><Spinner />Wczytuję</span>
    </div>
  )
}

function Spinner() {
  return (
    <svg className="m-spin" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="6" fill="none" stroke="#DCEEFB" strokeWidth="2" />
      <path d="M8 2a6 6 0 0 1 6 6" fill="none" stroke="#1F2A5A" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

/* ------------------------------------------------------------------ PDF */

/** Generowanie PDF: pasek nieokreślony (pełny po `done`) i lista etapów z bieżącym zaznaczonym. */
export function PdfProgress({ steps, current, done = false, fileName }: { steps: string[]; current: number; done?: boolean; fileName?: string }) {
  const live = done ? `Gotowe${fileName ? `: ${fileName}` : ''}` : steps[current] ?? ''
  return (
    <div className="m-pdf">
      {fileName && <p className="m-pdf-title">{fileName}</p>}
      <div className={`m-prog${done ? ' is-done' : ''}`} role="progressbar" aria-label="Generowanie PDF"
        aria-valuetext={done ? 'Gotowe' : `Etap ${Math.min(current + 1, steps.length)} z ${steps.length}`}>
        <span className="m-prog-seg" /><span className="m-prog-fill" />
      </div>
      <ol className="m-psteps">
        {steps.map((s, i) => {
          const st = done || i < current ? 'done' : i === current ? 'now' : 'todo'
          return (
            <li key={s} data-s={st} aria-current={st === 'now' ? 'step' : undefined}>
              <span className="m-psteps-m" aria-hidden="true">{st === 'now' ? <Spinner /> : st === 'done' ? '✓' : ''}</span>{s}
            </li>
          )
        })}
      </ol>
      <span className="m-sr" role="status" aria-live="polite">{live}</span>
    </div>
  )
}

/* ------------------------------------------------------------------ AI i potwierdzenia */

/** Trzy lawendowe kropki „asystent pisze” (wyłącznie kontekst AI). */
export function TypingDots() {
  return (
    <span className="m-typing" role="status">
      <span className="m-dots" aria-hidden="true"><i /><i /><i /></span>
      <span className="m-sr">Asystent pisze…</span>
    </span>
  )
}

/** Treść przycisku „Przypomnij” → „Wysłano ✓” o stałej szerokości. Użycie: <button><SentConfirm sent={x}>Przypomnij</SentConfirm></button>. */
export function SentConfirm({ sent, children, doneLabel = 'Wysłano' }: { sent: boolean; children: ReactNode; doneLabel?: string }) {
  return (
    <span className="m-sent">
      <span className={`m-state-lbl${sent ? '' : ' is-on'}`} aria-hidden={sent}>{children}</span>
      <span className={`m-state-lbl${sent ? ' is-on' : ''}`} aria-hidden={!sent}>{doneLabel} <span className="m-check" aria-hidden="true">✓</span></span>
      <span className="m-sr" role="status" aria-live="polite">{sent ? doneLabel : ''}</span>
    </span>
  )
}
