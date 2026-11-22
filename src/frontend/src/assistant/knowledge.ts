// Asystent zasad: wyszukiwanie w bazie Q&A zbudowanej z rozporządzeń i poradników KPRM.
// Odpowiada wyłącznie treścią z bazy i zawsze podaje źródło. Gdy dopasowanie jest słabe, mówi „nie wiem”.
// Ten moduł można później zastąpić agentem (/api/agent/chat) z tą samą bazą – kontrakt (Answer) zostaje ten sam.
export type { QA }
import { QA_ITEMS, type QA } from './qa'

export type Answer =
  | { kind: 'answer'; item: QA; related: QA[]; confidence: number }
  | { kind: 'unknown'; related: QA[] };

const STOP = new Set('a i w z o na do od po za ze sie się czy jak jest to nie co ten ta te tego mnie mi mam moge mogę moze może ktory który ktora która jaki jaka jakie kiedy gdy albo lub oraz dla przy bo by be by sa są jej jego ich tez też juz już tylko trzeba musze muszę mozna można'.split(' '));

export function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l');
}
const ALIAS: [RegExp, string][] = [
  [/\bl4\b/g, 'zwolnienie lekarskie'],
  [/\bdg\b/g, 'dyrektor generalny'],
  [/\biprz\b/g, 'indywidualny program rozwoju iprz'],
];
function stems(s: string): string[] {
  let n = norm(s);
  for (const [re, rep] of ALIAS) n = n.replace(re, rep);
  return n
    .replace(/(\d),(\d)/g, '$1.$2')
    .split(/[^a-z0-9.§]+/)
    .filter((w) => w && !STOP.has(w))
    .map((w) => (/^\d/.test(w) ? w.replace(/\.0+$/, '') : w.slice(0, 5)));
}

const items = QA_ITEMS;
const docs = items.map((it) => ({ it, q: new Set(stems(it.q)), a: new Set(stems(it.a)) }));
const df = new Map<string, number>();
for (const d of docs) for (const t of new Set([...d.q, ...d.a])) df.set(t, (df.get(t) ?? 0) + 1);
const idf = (t: string) => Math.log(1 + docs.length / (df.get(t) ?? 0.5));

export function ask(question: string): Answer {
  const terms = [...new Set(stems(question))];
  if (terms.length === 0) return { kind: 'unknown', related: [] };
  const maxScore = terms.reduce((s, t) => s + idf(t) * 2, 0);
  // zakres: pytania o pierwszą ocenę kierujemy do części B bazy, pozostałe do części A
  const first = /pierwsz|rozmow\w* wstepn|sprawozdan|sluzb\w* przygotow/.test(norm(question));
  const scope = (id: string) => (id.startsWith('B') ? (first ? 1.25 : 0.7) : first ? 0.6 : 1);
  const scored = docs
    .map((d) => ({ it: d.it, s: scope(d.it.id) * terms.reduce((s, t) => s + (d.q.has(t) ? 2 * idf(t) : d.a.has(t) ? idf(t) : 0), 0) }))
    .sort((a, b) => b.s - a.s);
  const top = scored[0];
  const confidence = top.s / maxScore;
  const related = scored.slice(1, 4).filter((x) => x.s > 0).map((x) => x.it);
  if (confidence < 0.34) return { kind: 'unknown', related: scored.slice(0, 2).filter((x) => x.s > 0).map((x) => x.it) };
  return { kind: 'answer', item: top.it, related, confidence };
}

export const SUGGESTED = [
  'Czy średnia 4,0 to ocena pozytywna?',
  'Ile kryteriów dodatkowych mogę wybrać?',
  'Co muszę omówić na rozmowie rozpoczynającej?',
  'Ile dni ma pracownik na sprzeciw?',
];
