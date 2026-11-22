// Podpowiedź przy notatce: opinia zamiast opisu zachowania (reguła, bez modelu). Kopia z piaskownicy Kompas/app/src/domain/notes.ts.
const OPINION = /\b(sumienn|super|swietn|dobr[ayoe]|zl[ayoe]|leniw|ambitn|zaangazowan|fajn|slab[ayoe]|bardzo|zawsze|nigdy)/
const ACTION = /\b(\w+(il|ila|ilo|al|ala|ywal|ywala|owal|owala|ul|ula)|zrobil|oddal|zglosil|przygotowal|sprawdzil)\b/

export function noteHint(text: string): string | null {
  const t = text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l')
  if (t.trim().length < 12) return null
  if (OPINION.test(t) && !ACTION.test(t)) return 'To brzmi jak opinia. Opisz zachowanie: co zrobił(a), w jakiej sytuacji i z jakim skutkiem.'
  if (/\b(zawsze|nigdy)\b/.test(t)) return '„Zawsze” i „nigdy” trudno obronić. Podaj konkretną sytuację z datą.'
  return null
}
