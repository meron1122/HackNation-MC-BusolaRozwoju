import { useId } from 'react'

const fmt = (v: number, digits = 2) => v.toFixed(digits).replace('.', ',')

/* ------------------------------------------------------------------ Segments */

/**
 * Postęp jako segmenty z liczbą „2/6” (nie tylko kolorem). `current` liczony od 1; segmenty przed nim są wypełnione.
 * `done` (opcjonalnie) = ile ukończonych, gdy nie wynika z pozycji.
 */
export function Segments({ current, total, done, label, size = 'md' }: {
  current: number
  total: number
  done?: number
  /** Dostępny opis, np. „Kryterium 2 z 6”. Domyślnie „Krok X z Y”. */
  label?: string
  size?: 'sm' | 'md'
}) {
  if (total <= 0) return null
  const filled = done ?? current - 1
  return (
    <span className={`v2-seg v2-seg-${size}`} role="img" aria-label={label ?? `Krok ${current} z ${total}`}>
      {Array.from({ length: total }, (_, i) => i + 1).map((n) => n === current
        ? <span key={n} className="v2-seg-now">{current}/{total}</span>
        : <span key={n} className={n <= filled ? 'v2-seg-bar done' : 'v2-seg-bar'} />)}
    </span>
  )
}

/* ------------------------------------------------------------------ Ring */

/**
 * Licznik dni jako pierścień: `value` w środku, łuk = value / max (np. dni do terminu / długość etapu).
 * `overdue` = łuk pełny, obrys przerywany i słowo „po terminie” (nie tylko kolor).
 */
export function Ring({ value, max, caption = 'dni', size = 88, overdue = false, label }: {
  value: number
  max: number
  caption?: string
  size?: number
  overdue?: boolean
  /** Dostępny opis; domyślnie „{value} {caption}”. */
  label?: string
}) {
  const stroke = Math.max(6, Math.round(size / 11))
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const share = overdue ? 1 : max > 0 ? Math.min(1, Math.max(0, value / max)) : 0
  return (
    <span className={`v2-ring${overdue ? ' overdue' : ''}`} style={{ width: size, height: size }} role="img"
      aria-label={label ?? `${overdue ? 'Po terminie: ' : ''}${Math.abs(value)} ${caption}`}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} className="v2-ring-track" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} className="v2-ring-arc" strokeWidth={stroke}
          strokeDasharray={overdue ? '6 5' : `${c * share} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <span className="v2-ring-text" aria-hidden="true">
        <strong style={{ fontSize: Math.max(18, size * 0.3) }}>{Math.abs(value)}</strong>
        <span>{overdue ? 'po terminie' : caption}</span>
      </span>
    </span>
  )
}

/* ------------------------------------------------------------------ ScaleBar */

/** Przedział skali: wartość należy do pierwszego przedziału, którego `max` jest ≥ wartości (granica → niższy). */
export type Band = { key: string; label: string; max: number }

/** Ocena okresowa (§ 11 ust. 1 pkt 2 rozp. 2016): 1–2 · >2–4 · >4–6 · >6–8 · >8. */
export const PERIODIC_BANDS: Band[] = [
  { key: 'much-below', label: 'znacznie poniżej', max: 2 },
  { key: 'below', label: 'poniżej', max: 4 },
  { key: 'meets', label: 'na poziomie', max: 6 },
  { key: 'above', label: 'powyżej', max: 8 },
  { key: 'much-above', label: 'znacznie powyżej', max: 9 },
]

/** Przedziały z `schema.scoring.levels` (backend), gdy są; inaczej PERIODIC_BANDS. */
export function bandsFromLevels(levels?: { key: string; label: string; max: number }[] | null): Band[] {
  if (!levels?.length) return PERIODIC_BANDS
  return [...levels].sort((a, b) => a.max - b.max).map((l) => ({
    key: l.key, max: l.max, label: l.label.replace(/\s*oczekiwań\s*$/i, '').trim() || l.label,
  }))
}

export function bandOf(value: number, bands: Band[] = PERIODIC_BANDS): Band {
  return bands.find((b) => value <= b.max + 1e-9) ?? bands[bands.length - 1]
}

/**
 * Skala 1–9 z przedziałami i znacznikiem wartości. Granica należy do niższego przedziału (4,00 → „poniżej”).
 * `labels`: 'active' (domyślnie: tylko przedział wartości), 'all', 'none'.
 */
export function ScaleBar({ value, bands = PERIODIC_BANDS, min = 1, labels = 'active', digits = 2, label }: {
  value: number | null
  bands?: Band[]
  min?: number
  labels?: 'active' | 'all' | 'none'
  digits?: number
  /** Dostępny opis; domyślnie „Średnia 4,00: poniżej”. */
  label?: string
}) {
  const max = bands[bands.length - 1].max
  const pos = (v: number) => ((Math.min(max, Math.max(min, v)) - min) / (max - min)) * 100
  const active = value == null ? null : bandOf(value, bands)
  const edges = [min, ...bands.map((b) => b.max)]
  const desc = label ?? (value == null ? 'Brak wartości' : `Średnia ${fmt(value, digits)}: ${active!.label}`)
  return (
    <div className="v2-scale" role="img" aria-label={desc}>
      <div className="v2-scale-value" aria-hidden="true">
        {value != null && <span style={{ left: `${pos(value)}%` }}>{fmt(value, digits)}</span>}
      </div>
      <div className="v2-scale-track" aria-hidden="true">
        {bands.map((b, i) => (
          <span key={b.key} className={b === active ? 'v2-scale-band active' : 'v2-scale-band'}
            style={{ left: `${pos(edges[i])}%`, width: `${pos(b.max) - pos(edges[i])}%` }} />
        ))}
        {value != null && <span className="v2-scale-dot" style={{ left: `${pos(value)}%` }} />}
      </div>
      {labels !== 'none' && (
        <div className="v2-scale-labels" aria-hidden="true">
          {bands.map((b, i) => (labels === 'all' || b === active) && (
            <span key={b.key} className={b === active ? 'active' : undefined}
              style={{ left: `${(pos(edges[i]) + pos(b.max)) / 2}%` }}>{b.label}</span>
          ))}
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ Radar */

export type RadarSeries = {
  name: string
  /** Wartości w kolejności osi; null = brak (przerwa w linii, bez wierzchołka). */
  values: (number | null)[]
  /** 'a' = bieżąca (błękit #2B6CB0 z wypełnieniem), 'b' = porównanie (przerywana). */
  kind?: 'a' | 'b'
}

/**
 * Radar ocen jednej osoby (albo anonimowej mediany, n ≥ 5). Osie w kolejności arkusza, pierścienie 1 / 5 / 9
 * (5 przerywany), wartości przy wierzchołkach serii A. Nigdy nie porównuje dwóch pracowników.
 */
export function Radar({ axes, series, size = 320, max = 9, rings = [1, 5, 9], showValues = true, title }: {
  axes: string[]
  series: RadarSeries[]
  size?: number
  max?: number
  rings?: number[]
  showValues?: boolean
  /** Dostępny tytuł wykresu (domyślnie lista osi i wartości serii A). */
  title?: string
}) {
  const titleId = useId()
  const n = axes.length
  if (n < 3) return null
  const pad = 92 // miejsce na etykiety osi
  const vb = size + pad * 2
  const cx = vb / 2
  const cy = vb / 2
  const R = size / 2
  const angle = (i: number) => -Math.PI / 2 + (2 * Math.PI * i) / n
  const pt = (i: number, v: number) => [cx + Math.cos(angle(i)) * (R * v) / max, cy + Math.sin(angle(i)) * (R * v) / max] as const
  const poly = (v: number) => axes.map((_, i) => pt(i, v).join(',')).join(' ')

  const primary = series.find((s) => (s.kind ?? 'a') === 'a') ?? series[0]
  const desc = title ?? axes.map((a, i) => `${a}: ${primary?.values[i] ?? 'brak'}`).join('; ')

  const paths = (s: RadarSeries) => {
    const full = s.values.length >= n && s.values.slice(0, n).every((v) => v != null)
    if (full) return { fill: s.values.slice(0, n).map((v, i) => pt(i, v!).join(',')).join(' '), lines: [] as string[] }
    const lines: string[] = []
    for (let i = 0; i < n; i++) {
      const a = s.values[i]
      const b = s.values[(i + 1) % n]
      if (a != null && b != null) lines.push(`M${pt(i, a).join(',')} L${pt((i + 1) % n, b).join(',')}`)
    }
    return { fill: null, lines }
  }

  return (
    <svg className="v2-radar" viewBox={`0 0 ${vb} ${vb}`} width="100%" style={{ maxWidth: vb }} role="img" aria-labelledby={titleId}>
      <title id={titleId}>{desc}</title>
      {rings.map((r) => <polygon key={r} points={poly(r)} className={r === 5 ? 'v2-radar-ring mid' : 'v2-radar-ring'} />)}
      {axes.map((_, i) => {
        const [x, y] = pt(i, max)
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} className="v2-radar-axis" />
      })}
      {[...series].sort((x, y) => ((x.kind ?? 'a') === 'b' ? 0 : 1) - ((y.kind ?? 'a') === 'b' ? 0 : 1)).map((s) => {
        const kind = s.kind ?? 'a'
        const { fill, lines } = paths(s)
        return (
          <g key={s.name} className={`v2-radar-series ${kind}`}>
            {fill && <polygon points={fill} />}
            {lines.map((d, i) => <path key={i} d={d} />)}
            {s.values.slice(0, n).map((v, i) => v != null && <circle key={i} cx={pt(i, v)[0]} cy={pt(i, v)[1]} r={kind === 'a' ? 4.5 : 3.5} />)}
          </g>
        )
      })}
      {showValues && primary && primary.values.slice(0, n).map((v, i) => {
        if (v == null) return null
        const [x, y] = pt(i, v)
        const dx = Math.cos(angle(i)) * 16
        const dy = Math.sin(angle(i)) * 16
        return <text key={i} x={x + dx} y={y + dy + 5} className="v2-radar-value" textAnchor="middle">{v}</text>
      })}
      {axes.map((a, i) => {
        const [x, y] = pt(i, max * 1.12)
        const cos = Math.cos(angle(i))
        const anchor = Math.abs(cos) < 0.2 ? 'middle' : cos > 0 ? 'start' : 'end'
        const words = wrap(a, 16)
        const y0 = y + 5 - ((words.length - 1) * 17) / 2 + (Math.sin(angle(i)) > 0.5 ? 8 : Math.sin(angle(i)) < -0.5 ? -8 : 0)
        return (
          <text key={a} x={x} y={y0} textAnchor={anchor} className="v2-radar-label">
            {words.map((w, j) => <tspan key={j} x={x} dy={j ? 17 : 0}>{w}</tspan>)}
          </text>
        )
      })}
    </svg>
  )
}

function wrap(text: string, width: number): string[] {
  const out: string[] = []
  let line = ''
  for (const w of text.split(/\s+/)) {
    if (line && (line + ' ' + w).length > width) { out.push(line); line = w } else line = line ? `${line} ${w}` : w
  }
  if (line) out.push(line)
  return out.slice(0, 3)
}
