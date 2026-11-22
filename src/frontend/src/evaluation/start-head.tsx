// Nagłówek kroków startu i notatek: temat i postęp idą do StepHeader kreatora (useStepHeader). Dopóki kreator
// sam go nie rysuje (brak StepHeaderContext), krok rysuje go lokalnie — ten sam komponent, więc bez podwójnego nagłówka.
import { useContext, type ReactNode } from 'react'
import { Avatar } from '../Avatar'
import { StepHeader, StepHeaderContext, useStepHeader, type StepProgress } from '../v2'
import type { Detail } from './types'

export function StartHead({ detail, topic, progress, aside }: {
  detail: Detail
  topic: string
  progress?: StepProgress | null
  aside?: ReactNode
}) {
  const inWizard = useContext(StepHeaderContext)
  useStepHeader(topic, progress)
  return (
    <>
      {!inWizard && <StepHeader personId={detail.employeeId} name={detail.employeeName} topic={topic} progress={progress} aside={aside} />}
      {inWizard && aside && <div className="sv2-head-aside">{aside}</div>}
    </>
  )
}

/** Para twarzy: oceniająca (granatowa obwódka roli) i oceniana, z imionami pod awatarami. */
export function PersonPair({ a, b }: { a: { id: number | null; name: string; hasAvatar?: boolean }; b: { id: number; name: string } }) {
  return (
    <ul className="sv2-pair" aria-label="Rozmowa">
      <li className="sv2-pair-lead">
        <Avatar path={a.id != null && a.hasAvatar !== false ? `org/${a.id}/avatar` : null} name={a.name} size={44} decorative />
        <span>{a.name.split(/\s+/)[0]}</span>
      </li>
      <li>
        <Avatar path={`org/${b.id}/avatar`} name={b.name} size={44} decorative />
        <span>{b.name.split(/\s+/)[0]}</span>
      </li>
    </ul>
  )
}
