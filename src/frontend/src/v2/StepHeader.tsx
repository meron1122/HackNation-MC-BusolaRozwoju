import { createContext, useContext, useEffect, type ReactNode } from 'react'
import { Avatar } from '../Avatar'
import { Segments } from './charts'

export type StepProgress = { current: number; total: number; label?: string }

/**
 * Wiersz nagłówka treści kreatora (H07/H08): awatar, imię, „·”, temat kroku, po prawej segmenty postępu.
 * Kreator renderuje go sam; krok zmienia temat i postęp hookiem `useStepHeader`.
 */
export function StepHeader({ personId, name, topic, progress, aside }: {
  personId: number
  name: string
  topic?: ReactNode
  progress?: StepProgress | null
  aside?: ReactNode
}) {
  return (
    <div className="v2-stephead">
      <Avatar path={`org/${personId}/avatar`} name={name} size={48} decorative />
      <p className="v2-stephead-title">
        <strong>{name}</strong>
        {topic && <><span className="v2-stephead-dot" aria-hidden="true">·</span><span>{topic}</span></>}
      </p>
      <span className="grow" />
      {aside}
      {progress && progress.total > 1 && <Segments current={progress.current} total={progress.total} label={progress.label} />}
    </div>
  )
}

type HeaderState = { topic?: ReactNode; progress?: StepProgress | null }
type Setter = (next: HeaderState | null) => void

export const StepHeaderContext = createContext<Setter | null>(null)

/**
 * Krok ustawia temat i postęp nagłówka kreatora (np. „Rzetelność”, 2/6). Bez argumentów = tytuł kroku.
 * Działa tylko wewnątrz kreatora; poza nim nic nie robi. Topic jako string — porównywany między renderami.
 */
export function useStepHeader(topic?: string | null, progress?: StepProgress | null) {
  const set = useContext(StepHeaderContext)
  const cur = progress?.current
  const total = progress?.total
  const label = progress?.label
  useEffect(() => {
    if (!set) return
    set({ topic: topic ?? undefined, progress: cur != null && total != null ? { current: cur, total, label } : null })
  }, [set, topic, cur, total, label])
  useEffect(() => () => set?.(null), [set])
}
