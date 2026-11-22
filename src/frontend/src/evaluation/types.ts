// Kształty z API ocen i szablonów arkuszy (backend: EvaluationModels.cs, DashboardModels.cs, EvaluationTemplates/*.json).

export type Cond = { field: string; in: string[] }
export type Field = {
  key: string; type: string; label?: string; required?: boolean; visibleWhen?: Cond; requiredWhen?: Cond
  /** Średnią, poziom i wynik liczy backend — pole tylko do odczytu. */
  computed?: boolean; legalRef?: string; hint?: string; prefill?: string
} & Record<string, any>
export type Section = { key: string; title: string; part?: string; stage: string; visibleWhen?: Cond; fields: Field[] }
export type ScaleOption = { value: number; key: string; label: string }
export type Level = { key: string; label: string; min?: number; minExclusive?: number; max: number }
export type Indicator = { key: string; text: string; levels: Record<string, string> }
export type Competency = { name: string; indicators: Indicator[] }
/** Model kompetencji: kryteria (kompetencje) ze wskaźnikami behawioralnymi i opisami poziomów. */
export type CompetencyModel = { source: string; guidance: string[]; competencies: Record<string, Competency> }
/** Temat rozmowy z rozporządzenia (statyczna lista „do omówienia”, nic nie zapisuje). */
export type Topic = { text: string; legalRef?: string; optional?: boolean }
export type StageDef = {
  key: string; title: string; phase?: string; optional?: boolean; selfAssessment?: boolean; legalRef?: string
  /** note: np. „7 dni to termin organizacyjny” przy zapoznaniu (przepis mówi „niezwłocznie”). */
  deadline?: { note?: string }
  /** Kto zamyka etap: "evaluated" = oceniany (np. sprawozdanie zamyka przekazanie samooceny), przełożony nie. */
  completedBy?: 'evaluated'
  topics?: Topic[]
}
export type PositiveRule = { rule: string; field?: string; values?: string[]; score?: number; count?: number; value?: number }
export type Schema = {
  title: string; appliesTo?: string; legalBasis?: string; stages?: StageDef[]; sections: Section[]; scales: Record<string, ScaleOption[]>
  scoring?: { scores?: string; average?: string; level?: string; result?: string; levels?: Level[]; positiveWhen?: PositiveRule[] }
  competencyModel?: CompetencyModel
}


export type Answer = { fieldKey: string; itemKey: string | null; valueText: string | null; valueNumber: number | null; valueDate: string | null; valueDateTo: string | null }
export type Stage = { key: string; title: string; status: string; optional: boolean; dueFrom: string | null; dueTo: string | null; completedOn: string | null; overdue: boolean }
export type Signature = { id: number; fieldKey: string; role: string; signerName: string; signedOn: string; place: string | null; hasImage: boolean }
export type CriterionScoring = {
  key: string; label: string; ratedIndicators: number; totalIndicators: number
  indicatorMean: number | null; suggested: number | null; score: number | null
}
export type Scoring = { scoresField: string; criteria: CriterionScoring[]; average: number | null; level: string | null; levelLabel: string | null; result: string | null }
export type Previous = { id: number; templateTitle: string; date: string; result: string | null; level: string | null; levelLabel: string | null; average: number | null }
export type Detail = {
  id: number; employeeId: number; employeeName: string; evaluatorName: string | null; templateTitle: string
  status: string; statusLabel: string; isFinal: boolean; startDate: string; schema: Schema
  stages: Stage[]; answers: Answer[]; signatures: Signature[]; canEdit: boolean; isOwn: boolean
  templateCode: string; phase: string; currentStageKey: string | null; lockedSections: string[]
  scoring: Scoring | null; previous: Previous | null; unitHeadName: string | null; canEditSelfAssessment: boolean
  /**
   * Podpowiedzi z kartoteki dla pól bez zapisu (osoby: imię, nazwisko, wydział, stanowisko; nazwa urzędu; data zatrudnienia).
   * Backend traktuje je w /check jako wypełnione i zapisuje przy zamknięciu etapu. Brak pola = starsze API.
   */
  prefill?: Answer[]
  /** Czy pole podpisu można podpisać teraz (termin etapu, kolejność etapów); reason = dlaczego nie. Nie uwzględnia roli. */
  signatureSlots?: SignatureSlot[]
}
export type SignatureSlot = { fieldKey: string; role: string; signed: boolean; canSign: boolean; reason: string | null }

export type CheckIssue = { stageKey: string; sectionKey: string | null; fieldKey: string | null; message: string; legalRef: string | null; blocking: boolean }
/** canSkip: etap opcjonalny albo sprawozdanie po terminie (oznaczenie jako niezłożone). */
export type StageCheck = { key: string; title: string; status: string; canComplete: boolean; canSkip?: boolean; issues: CheckIssue[] }
export type SectionCheck = { key: string; title: string; part: string | null; stageKey: string; visible: boolean; locked: boolean; complete: boolean; issues: CheckIssue[] }
export type Check = { stages: StageCheck[]; sections: SectionCheck[] }

export type Note = {
  id: number; observedOn: string; situation: string | null; action: string | null; result: string | null; indicatorKey: string | null; criterionKey: string | null
  isPrivate: boolean; discussedWithEmployee: boolean; authorName: string; createdAt: string; canEdit: boolean; inPeriod: boolean
}
export type Notes = {
  notes: Note[]
  /** recentShare: udział (0–1) notatek z ostatnich 4 miesięcy wśród notatek z okresu oceny. */
  evidence: {
    periodStart: string | null; indicators: { indicatorKey: string; criterionKey: string | null; count: number }[]
    inPeriod?: number; recentShare: number | null; outsidePeriod: number
  }
}
export type NoteRequest = {
  observedOn: string; situation: string; action: string; result: string; indicatorKey: string | null; isPrivate: boolean; discussedWithEmployee: boolean
}

/** Kontekst wskaźnika: tylko oczekiwanie ustalone w pierwszym etapie (bez częstotliwości i złożoności — decyzja W07). */
export type IndicatorContext = { indicatorKey: string; expectation: string | null }
export type WorkContext = { indicators: IndicatorContext[]; criteria: { criterionKey: string; scoreReason: string | null }[] }

export type SelfAssessment = {
  stageKey: string | null; stageOpen: boolean; canEdit: boolean; submitted: boolean; submittedAt: string | null; updatedAt: string | null
  scale: ScaleOption[]; criteria: { key: string; label: string; level: string | null; comment: string | null }[]; developmentNeeds: string | null
  /**
   * Termin samooceny: przy pierwszej ocenie termin sprawozdania, przy okresowej 30 dni przed terminem oceny (organizacyjny).
   * overdue: nieprzekazana po terminie — przekazać nadal można.
   */
  dueTo?: string | null
  overdue?: boolean
  /** Sprawozdanie pierwszej oceny (formularz z załącznika nr 3); null = zwykła samoocena (okresowa). */
  reportForm?: ReportForm | null
}

/**
 * Formularz sprawozdania: nagłówek z arkusza, treść ocenianego (`report`) i `text` — treść z doklejoną samooceną
 * elementów i potrzebami, tak jak w PDF. `submitBlockedReason`: przed rozmową wstępną albo przed początkiem terminu
 * wyznaczonego przez przełożonego złożyć się nie da.
 */
export type ReportForm = {
  office: string | null; firstName: string | null; lastName: string | null; department: string | null; position: string | null
  periodFrom: string | null; periodTo: string | null; report: string | null; text: string
  signatureFieldKey: string | null; signed: boolean; submitBlockedReason: string | null
}

export type Progress = {
  evaluationId: number; templateCode: string; kind: string; phase: string; started: boolean; isFinal: boolean
  stageKey: string | null; stageTitle: string | null; dueFrom: string | null; dueTo: string | null; daysLeft: number | null; overdue: boolean
  lastReminder: { sentAt: string; sentByName: string; message: string | null } | null
}

// --- pomocnicze ---

export const today = () => new Date().toISOString().slice(0, 10)
export const keyOf = (fieldKey: string, itemKey: string | null) => `${fieldKey}|${itemKey ?? ''}`
export const emptyAnswer = (fieldKey: string, itemKey: string | null): Answer =>
  ({ fieldKey, itemKey, valueText: null, valueNumber: null, valueDate: null, valueDateTo: null })

/** 2027-10-26 → 26.10.2027 */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const [y, m, d] = iso.slice(0, 10).split('-')
  return d ? `${d}.${m}.${y}` : iso
}

/** 5 → „5 dni”, 75 → „2 mies.”, 800 → „2 lata” (długie okresy w panelu HR i na pulpicie). */
function days(n: number): string {
  if (n >= 730) {
    const years = Math.floor(n / 365)
    return `${years} ${plural(years, 'rok', 'lata', 'lat')}`
  }
  if (n >= 60) return `${Math.floor(n / 30)} mies.`
  return `${n} ${n === 1 ? 'dzień' : 'dni'}`
}

/** Odmiana przez liczbę: plural(3, 'notatka', 'notatki', 'notatek') → „notatki”. */
export function plural(n: number, one: string, few: string, many: string): string {
  if (n === 1) return one
  const d = n % 10, t = n % 100
  return d >= 2 && d <= 4 && (t < 12 || t > 14) ? few : many
}

/** „zostało 5 dni”, „dziś”, „1 dzień po terminie”. */
export function daysLabel(daysLeft: number | null, overdue: boolean): string {
  if (daysLeft == null) return 'niezwłocznie'
  if (overdue || daysLeft < 0) return `${days(-daysLeft)} po terminie`
  if (daysLeft === 0) return 'termin dziś'
  return `zostało ${days(daysLeft)}`
}

export const isFirstTemplate = (code: string) => code === 'first'
/** Litera arkusza okresowego z kodu szablonu (periodic-c → C). */
export const sheetLetter = (code: string) => (code.startsWith('periodic-') ? code.slice('periodic-'.length).toUpperCase() : null)
export const pathLabel = (code: string) => (isFirstTemplate(code) ? 'Pierwsza' : `Okresowa · ${sheetLetter(code) ?? '?'}`)
export const kindLabel = (code: string) => (isFirstTemplate(code) ? 'Pierwsza ocena' : `Ocena okresowa · arkusz ${sheetLetter(code) ?? '?'}`)

export const RESULT_LABELS: Record<string, string> = { positive: 'Pozytywna', negative: 'Negatywna' }

/** Pole ocen cząstkowych (scores) i jego skala. */
export function scoresFieldOf(schema: Schema): { field: Field; section: Section; scale: ScaleOption[] } | null {
  for (const section of schema.sections) {
    const field = section.fields.find((f) => f.type === 'scores' && (!schema.scoring?.scores || f.key === schema.scoring.scores))
    if (field) return { field, section, scale: schema.scales[field.scale] ?? [] }
  }
  return null
}

export const indicatorFieldOf = (schema: Schema, scoresKey: string): Field | undefined =>
  schema.sections.flatMap((s) => s.fields).find((f) => f.type === 'indicatorScores' && f.of === scoresKey)

export const criteriaFieldOf = (schema: Schema): Field | undefined =>
  schema.sections.flatMap((s) => s.fields).find((f) => f.type === 'criteriaSelection')

/** Kryteria do oceny: z backendu (scoring) albo — gdy go nie ma — obowiązkowe/pozycje z szablonu. */
export function criteriaOf(detail: Detail): { key: string; label: string }[] {
  if (detail.scoring?.criteria.length) return detail.scoring.criteria.map((c) => ({ key: c.key, label: c.label }))
  const scores = scoresFieldOf(detail.schema)?.field
  if (scores?.items) return scores.items
  const source = criteriaFieldOf(detail.schema)
  if (!source) return []
  const mandatory: { key: string; label: string }[] = source.mandatory ?? []
  const extra = detail.answers
    .filter((a) => a.fieldKey === source.key && a.itemKey && a.valueText && !mandatory.some((m) => m.key === a.itemKey))
    .map((a) => ({ key: a.itemKey!, label: detail.schema.competencyModel?.competencies[a.itemKey!]?.name ?? a.valueText! }))
  return [...mandatory, ...extra]
}

export const answerOf = (detail: Detail, fieldKey: string, itemKey: string | null = null) =>
  detail.answers.find((a) => a.fieldKey === fieldKey && (a.itemKey ?? null) === itemKey)

/** Zapisana wartość, a gdy jej brak — podpowiedź backendu (np. „sprawozdanie w terminie” wyliczone z etapu). */
export const valueOf = (detail: Detail, fieldKey: string) =>
  answerOf(detail, fieldKey) ?? detail.prefill?.find((a) => a.fieldKey === fieldKey && !a.itemKey)

export const stageOf = (detail: Detail, key: string | null | undefined) => detail.stages.find((s) => s.key === key)

export const daysUntil = (iso: string | null | undefined) =>
  iso ? Math.round((Date.parse(iso) - Date.parse(today())) / 86_400_000) : null

export const initials = (name: string) => name.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase()
