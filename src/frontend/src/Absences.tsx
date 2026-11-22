import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { api } from './api'
import { ConfirmButton } from './ConfirmButton'
import { DateInput } from './DateInput'
import { fmtDate, type Absence, type AbsenceReason } from './evaluation/types'
import { Loadable, SaveButton, Skeleton, useSaveState } from './v2/motion'
import './ml-motion.css'

const KIND_LABELS: Record<string, string> = {
  Justified: 'usprawiedliwiona',
  OfficialDuty: 'obowiązki poza miejscem pracy',
  Unjustified: 'nieusprawiedliwiona',
}

/** Dni od–do włącznie; dla trwającej — do dziś. */
function days(a: Absence): number {
  const end = a.endDate ? Date.parse(a.endDate) : Date.now()
  return Math.max(0, Math.floor((end - Date.parse(a.startDate)) / 86_400_000) + 1)
}

/**
 * Nieobecności pracownika (profil). Kadry dopisują i poprawiają, pracownik widzi swoje. Wpływają na terminy ocen:
 * okresowej — z mocy prawa (ponad miesiąc ciągłej usprawiedliwionej nieobecności, art. 81 ust. 7), pierwszej — przez
 * decyzję przełożonego o nowym terminie sprawozdania (§ 5) albo przedłużenie umowy (art. 35 ust. 4).
 */
export function AbsencesSection({ employeeId, editable }: { employeeId: number; editable: boolean }) {
  const [items, setItems] = useState<Absence[] | null>(null)
  const [reasons, setReasons] = useState<AbsenceReason[]>([])
  const [editing, setEditing] = useState<Absence | 'new' | null>(null)
  const [error, setError] = useState('')
  const save = useSaveState()

  const load = useCallback(() => api<Absence[]>(`employees/${employeeId}/absences`).then(setItems, (e: Error) => setError(e.message)), [employeeId])
  useEffect(() => {
    load()
    api<AbsenceReason[]>('absence-reasons').then(setReasons, () => undefined)
  }, [load])

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const body = {
      startDate: String(form.get('startDate')),
      endDate: String(form.get('endDate') ?? '') || null,
      reasonId: Number(form.get('reasonId')),
    }
    try {
      await save.run(() => api(editing === 'new' ? `employees/${employeeId}/absences` : `employees/${employeeId}/absences/${(editing as Absence).id}`,
        editing === 'new' ? 'POST' : 'PUT', body))
      setEditing(null)
      setError('')
      await load()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function remove(id: number) {
    try {
      await api(`employees/${employeeId}/absences/${id}`, 'DELETE')
      await load()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const current = editing && editing !== 'new' ? editing : null
  return (
    <section className="card profile-section">
      <div className="toolbar">
        <h3>Nieobecności</h3>
        {editable && editing === null && <button className="secondary" onClick={() => setEditing('new')}>+ Dodaj</button>}
      </div>
      <p className="muted small">
        Usprawiedliwiona nieobecność trwająca nieprzerwanie dłużej niż miesiąc sama przedłuża termin oceny okresowej o swój czas
        (art. 81 ust. 7 ustawy). Przy pierwszej ocenie przełożony może na jej podstawie wyznaczyć nowy termin sprawozdania (§ 5).
      </p>
      {editing !== null && (
        <form onSubmit={submit} className="list-editor" key={current?.id ?? 'new'}>
          <div className="field-grid">
            <label>Od<DateInput name="startDate" required defaultValue={current?.startDate ?? ''} /></label>
            <label>Do (puste — trwa)<DateInput name="endDate" defaultValue={current?.endDate ?? ''} /></label>
            <label>
              Powód
              <select name="reasonId" required defaultValue={current?.reasonId ?? ''}>
                <option value="">— wybierz —</option>
                {reasons.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </label>
          </div>
          <div className="buttons">
            <SaveButton type="submit" state={save.state}>Zapisz nieobecność</SaveButton>
            <button type="button" className="secondary" onClick={() => setEditing(null)}>Anuluj</button>
          </div>
        </form>
      )}
      {items && error && <p role="alert" className="error">{error}</p>}
      <Loadable loading={!items && !error} error={items ? '' : error} onRetry={() => { setError(''); load() }}
        skeleton={<Skeleton variant="text" rows={3} />} empty={items?.length === 0}
        emptyNode={<p className="muted small" style={{ margin: 0 }}>{editable ? 'Brak nieobecności. Dodaj przyciskiem „Dodaj”.' : 'Brak nieobecności.'}</p>}>
      {() => items && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Od</th><th>Do</th><th>Dni</th><th>Powód</th><th>Rodzaj</th>
                {editable && <th><span className="sr-only">Akcje</span></th>}
              </tr>
            </thead>
            <tbody className="ml-stagger">
              {items.map((a) => (
                <tr key={a.id}>
                  <td>{fmtDate(a.startDate)}</td>
                  <td>{a.endDate ? fmtDate(a.endDate) : <strong>trwa</strong>}</td>
                  <td className="num">{days(a)}</td>
                  <td>{a.reasonName}</td>
                  <td className="muted small">{KIND_LABELS[a.kind] ?? a.kind}</td>
                  {editable && (
                    <td className="actions">
                      <button className="link" onClick={() => setEditing(a)}>Edytuj</button>
                      <ConfirmButton compact question="Usunąć tę nieobecność?" confirmLabel="Usuń" onConfirm={() => remove(a.id)}>Usuń</ConfirmButton>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      </Loadable>
    </section>
  )
}
