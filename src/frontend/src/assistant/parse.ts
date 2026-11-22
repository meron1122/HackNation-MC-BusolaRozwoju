/**
 * Odpowiedź modelu to zwykły tekst z podstawą prawną w zdaniach („… (§ 11 ust. 1 rozporządzenia z 2016 r.)”).
 * Tu wyciągamy źródła jako przypisy ¹ ² i chipy, i rozpoznajemy stany: brak w bazie, dopytanie o rodzaj oceny.
 * Backend się nie zmienia; gdy model nie poda podstawy, odpowiedź zostaje bez chipów.
 */

export type DocKey = 'rozp2016' | 'rozp2015' | 'ustawa' | 'poradnik2016' | 'poradnik2015' | 'model' | 'other'
export type SourceRef = { n: number; doc: DocKey; ref: string; label: string }
export type Parsed = {
  /** Tekst z markerami przypisów ⟦n⟧. */
  text: string
  sources: SourceRef[]
  kind: 'answer' | 'notFound' | 'unresolved' | 'clarify'
  /** Zakres: ocena okresowa / pierwsza ocena (z dokumentów źródeł). */
  scope: string | null
  /** Pierwsze słowo-odpowiedź („Tak.” / „Nie.”) do wyróżnienia. */
  verdict: string | null
}

export const DOCS: Record<DocKey, { short: string; title: string }> = {
  rozp2016: { short: 'Rozp. 2016', title: 'Rozporządzenie z 2016 r. w sprawie ocen okresowych' },
  rozp2015: { short: 'Rozp. 2015', title: 'Rozporządzenie z 2015 r. w sprawie pierwszej oceny' },
  ustawa: { short: 'Ustawa o SC', title: 'Ustawa o służbie cywilnej' },
  poradnik2016: { short: 'Poradnik 2016', title: 'Poradnik: ocena okresowa w służbie cywilnej' },
  poradnik2015: { short: 'Poradnik pierwszej oceny', title: 'Poradnik: pierwsza ocena w służbie cywilnej' },
  model: { short: 'Model kompetencji', title: 'Model kompetencji' },
  other: { short: 'Źródło', title: 'Baza wiedzy' },
}

// § 11 ust. 1 pkt 2 lit. b · art. 81 ust. 1 · s. 26 · rozdz. 6.2.4
const REF = String.raw`(?:§\s*\d+[a-z]?|art\.\s*\d+[a-z]?)(?:\s*ust\.\s*\d+[a-z]?)?(?:\s*pkt\s*\d+(?:\s*[–-]\s*\d+)?)?(?:\s*lit\.\s*[a-z](?:\s*[–-]\s*[a-z])?)?`
const DOC_HINT = String.raw`(?:\s+(?:rozporządzenia|rozp\.|ustawy|Poradnika|poradnika)[^.;,()\n]{0,80}(?:\s*r\.)?)?`
const INLINE = new RegExp(`${REF}${DOC_HINT}`, 'g')
const PAREN = /\s*\(([^()]*?(?:§|art\.|[Pp]oradnik|[Mm]odel kompetencji|rozporządzen)[^()]*)\)/g
const SOURCE_LINE = /^\s*(?:\*\*)?(?:Źródło|Źródła|Podstawa(?: prawna)?)(?:\*\*)?\s*:?\s*(?:\*\*)?\s*(.+)$/i

function docOf(text: string, fallback: DocKey): DocKey {
  const t = text.toLowerCase()
  if (/model\p{L}* kompetencji/u.test(t)) return 'model'
  if (/poradnik/.test(t)) return /pierwsz|2015/.test(t) ? 'poradnik2015' : 'poradnik2016'
  if (/ustaw|art\./.test(t) && !/rozporz/.test(t)) return 'ustawa'
  if (/2015|pierwsz/.test(t)) return 'rozp2015'
  if (/2016|okresow/.test(t)) return 'rozp2016'
  return fallback
}

function refOf(text: string): string {
  const m = text.match(new RegExp(REF))
  if (m) return m[0].replace(/\s+/g, ' ').replace(/\s*[–-]\s*/g, '–')
  const page = text.match(/(?:s\.|str\.)\s*\d+|rozdz\.\s*[\d.]+/)
  return page ? page[0] : ''
}

export function parseReply(raw: string): Parsed {
  const sources: SourceRef[] = []
  const lower = raw.toLowerCase()
  const fallback: DocKey = /pierwsz\p{L}* ocen/u.test(lower) && !/okresow/.test(lower) ? 'rozp2015' : 'rozp2016'

  const add = (chunk: string): number[] => {
    const parts = chunk.split(/;|\s+oraz\s+|,\s*(?=§|art\.|[Pp]oradnik)/).map((p) => p.trim()).filter(Boolean)
    const ns: number[] = []
    for (const p of parts) {
      const ref = refOf(p)
      const doc = docOf(p, ref.startsWith('art.') ? 'ustawa' : fallback)
      if (!ref && doc === 'other') continue
      const label = `${DOCS[doc].short}${ref ? ` · ${ref}` : ''}`
      let s = sources.find((x) => x.label === label)
      if (!s) {
        s = { n: sources.length + 1, doc, ref, label }
        sources.push(s)
      }
      if (!ns.includes(s.n)) ns.push(s.n)
    }
    return ns
  }
  const marks = (ns: number[]) => ns.map((n) => `⟦${n}⟧`).join('')

  const lines = raw.split('\n').filter((line) => {
    const m = line.match(SOURCE_LINE)
    if (!m) return true
    add(m[1])
    return false
  })
  let text = lines.join('\n')
  text = text.replace(PAREN, (whole, inner: string) => {
    const ns = add(inner)
    return ns.length ? marks(ns) : whole
  })
  text = text.replace(INLINE, (m) => `${m}${marks(add(m))}`)
  text = text.replace(/ r((?:⟦\d+⟧)+)\./g, ' r.$1').trim()

  const notFound = /nie znalaz\p{L}*|nie mam (?:tej |takich )?informacji|baz\p{L}*(?: wiedzy)? nie (?:zawiera|obejmuje|ma)|brak (?:tego|informacji|danych) w bazie|poza zakresem/iu.test(raw)
  const unresolved = /nie rozstrzyga|nie precyzuj|nie określa(?:ją)? (?:wprost|formy)|przepisy (?:tego )?nie (?:regulują|opisują)/i.test(raw)
  const clarify = /\?\s*$/.test(raw.trim()) && /(?:któr|jak)\p{L}* ocen\p{L}*|okresow\p{L}* czy (?:o )?pierwsz|pierwsz\p{L}* czy (?:o )?okresow/iu.test(raw) && raw.length < 400
  const kind: Parsed['kind'] = clarify ? 'clarify' : notFound && sources.length === 0 ? 'notFound' : unresolved ? 'unresolved' : 'answer'

  const docs = new Set(sources.map((s) => s.doc))
  const scope = docs.has('rozp2015') || docs.has('poradnik2015')
    ? (docs.has('rozp2016') || docs.has('poradnik2016') ? null : 'Pierwsza ocena')
    : docs.has('rozp2016') || docs.has('poradnik2016') ? 'Ocena okresowa' : null
  const v = text.match(/^(?:\*\*)?(Tak|Nie)(?:\*\*)?[.,!—–-]\s*/)
  return { text: v ? text.slice(v[0].length) : text, sources, kind, scope, verdict: v ? `${v[1]}.` : null }
}
