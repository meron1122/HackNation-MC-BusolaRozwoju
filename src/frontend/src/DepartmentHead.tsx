import { useState } from 'react'
import { api } from './api'
import type { Row } from './Crud'

type Employee = { id: number; firstName: string; lastName: string; departmentId: number }

// Jedna lista pracowników na wszystkie wiersze tabeli wydziałów (pierwsze 200, jak w zakładce Pracownicy).
let employeesPromise: Promise<Employee[]> | null = null
const loadEmployees = () => (employeesPromise ??= api<Employee[]>('employees?pageSize=200').catch((e) => {
  employeesPromise = null
  throw e
}))

/**
 * Kierujący komórką organizacyjną (PUT /departments/{id}/head). Współtworzy pierwszą ocenę i podpisuje swoje pola arkusza;
 * w kreatorze oceny pojawia się jako unitHeadName.
 */
export function DepartmentHead({ department, canEdit }: { department: Row; canEdit: boolean }) {
  const [head, setHead] = useState<{ id: number | null; name: string | null }>({ id: department.headId ?? null, name: department.headName ?? null })
  const [employees, setEmployees] = useState<Employee[] | null>(null)
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState('')

  async function edit() {
    setEditing(true)
    try {
      setEmployees(await loadEmployees())
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function save(value: string) {
    const employeeId = value === '' ? null : Number(value)
    try {
      const updated = await api<Row>(`departments/${department.id}/head`, 'PUT', { employeeId })
      setHead({ id: updated.headId ?? null, name: updated.headName ?? null })
      setEditing(false)
      setError('')
    } catch (e) {
      setError((e as Error).message)
    }
  }

  if (!editing) {
    return (
      <span className="inline gap">
        {head.name ?? <span className="muted">—</span>}
        {canEdit && <button type="button" className="link" onClick={edit}>{head.name ? 'Zmień' : 'Wskaż'}</button>}
      </span>
    )
  }

  // Najpierw osoby z tego wydziału, potem reszta służby (backend sprawdza, że to ta sama służba).
  const sorted = [...(employees ?? [])].sort((a, b) =>
    Number(b.departmentId === department.id) - Number(a.departmentId === department.id) || a.lastName.localeCompare(b.lastName, 'pl'))
  return (
    <span className="inline gap">
      <select aria-label={`Kierujący komórką: ${department.name}`} defaultValue={head.id ?? ''} disabled={!employees}
        onChange={(e) => save(e.target.value)}>
        <option value="">— brak —</option>
        {sorted.map((e) => (
          <option key={e.id} value={e.id}>{e.lastName} {e.firstName}{e.departmentId === department.id ? '' : ' (inny wydział)'}</option>
        ))}
      </select>
      <button type="button" className="link" onClick={() => setEditing(false)}>Anuluj</button>
      {error && <span role="alert" className="error small">{error}</span>}
    </span>
  )
}
