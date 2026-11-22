// H14 v2: „Mediana · arkusz C” — anonimowa mediana ocen kryteriów z zakończonych ocen (grupy od 5 osób, bez nazwisk).
import { useEffect, useMemo, useState } from 'react'
import { api } from './api'
import { Info, Radar } from './v2'
import { EmptyEnter, Reveal } from './v2/motion'
import './ml-motion.css'
import { criterionScores } from './evaluation/final-model'
import { sheetLetter, type Detail } from './evaluation/types'

/** Minimalna liczebność grupy: poniżej mediana mogłaby wskazać konkretną osobę. */
const MIN_N = 5

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/** `evaluationIds` — oceny z widocznego zakresu (wydział); liczą się tylko arkusze C z wynikiem. */
export function MedianCard({ evaluationIds, sheet = 'C' }: { evaluationIds: number[]; sheet?: string }) {
  const key = evaluationIds.join(',')
  const [details, setDetails] = useState<Detail[] | null>(null)
  useEffect(() => {
    let active = true
    const ids = key ? key.split(',').map(Number) : []
    Promise.all(ids.map((id) => api<Detail>(`evaluations/${id}`).then((d) => d, () => null)))
      .then((list) => active && setDetails(list.filter((d): d is Detail => !!d)))
    return () => { active = false }
  }, [key])

  const result = useMemo(() => {
    const scored = (details ?? []).filter((d) => sheetLetter(d.templateCode) === sheet && d.scoring?.result)
    const byKey = new Map<string, { label: string; values: number[] }>()
    for (const d of scored) {
      for (const c of criterionScores(d)) {
        if (c.additional || c.value == null) continue
        const e = byKey.get(c.key) ?? { label: c.short, values: [] }
        e.values.push(c.value)
        byKey.set(c.key, e)
      }
    }
    const axes = [...byKey.values()].filter((e) => e.values.length >= MIN_N)
    return { n: scored.length, axes: axes.map((e) => ({ label: e.label, value: median(e.values) })) }
  }, [details, sheet])

  const ready = result.n >= MIN_N && result.axes.length >= 3
  const weakest = ready ? [...result.axes].sort((a, b) => a.value - b.value)[0] : null
  return (
    <section className="card dash-median" aria-labelledby="dash-median-title">
      <div className="dash-median-head">
        <h2 id="dash-median-title">Mediana · arkusz {sheet}</h2>
        {details && <span className="dash-count">n = {result.n}</span>}
        <Info align="end" label="Jak liczona jest mediana">Mediana ocen kryteriów obowiązkowych z zakończonych ocen. Tylko grupy od {MIN_N} osób, bez nazwisk.</Info>
      </div>
      {!details ? (
        <div className="m-skeleton" aria-busy="true" role="status">
          <span className="m-sr">Wczytuję medianę…</span>
          <span className="m-skel m-skel--circle" style={{ width: 200, height: 200 }} />
          <span className="m-skel" style={{ width: '60%' }} />
        </div>
      ) : ready ? (
        <Reveal>
          <Radar axes={result.axes.map((a) => a.label)} size={220}
            series={[{ name: 'mediana', values: result.axes.map((a) => a.value) }]}
            title={result.axes.map((a) => `${a.label}: ${a.value}`).join('; ')} />
          {weakest && (
            <div className="dash-median-need">
              <span>{weakest.label}</span>
              <strong>{String(weakest.value).replace('.', ',')}</strong>
            </div>
          )}
        </Reveal>
      ) : (
        <EmptyEnter><p className="dash-median-empty">Mediana od {MIN_N} zakończonych ocen.</p></EmptyEnter>
      )}
    </section>
  )
}
