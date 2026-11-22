// Ikony v2 kroków startu i notatek: 14 kompetencji (każda tylko w tym znaczeniu) i kilka ikon interfejsu.
// 24×24, obrys 1.8, kolor z tekstu. Zawsze stoją obok słowa albo mają nazwę dostępną u rodzica, więc są ukryte dla czytników.
import type { ReactNode } from 'react'

const p = (d: string) => <path d={d} />

const COMPETENCY: Record<string, ReactNode> = {
  // otwarta książka
  knowledge: <>{p('M12 6.5C10 5 7 4.6 3.5 5v13c3.5-.4 6.5 0 8.5 1.5 2-1.5 5-1.9 8.5-1.5V5C17 4.6 14 5 12 6.5z')}{p('M12 6.5v13')}</>,
  // tarcza z ptaszkiem
  reliability: <>{p('M12 3l7 3v5.5c0 4.4-3 7.8-7 9.5-4-1.7-7-5.1-7-9.5V6z')}{p('M8.8 12l2.2 2.2 4.2-4.4')}</>,
  // tarcza strzelnicza
  organization: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.6" /></>,
  // dwie osoby
  cooperation: <><circle cx="9" cy="8" r="3.2" />{p('M3 19.5c.4-3.4 2.8-5.5 6-5.5s5.6 2.1 6 5.5')}<circle cx="16.5" cy="9" r="2.6" />{p('M16.5 14c2.6 0 4.2 1.7 4.6 4.6')}</>,
  // dymek rozmowy
  communication: p('M4 11.5C4 7.4 7.6 4.5 12 4.5s8 2.9 8 7-3.6 7-8 7c-1.2 0-2.3-.2-3.3-.6L4.5 19.5l1.2-3.6C4.6 14.7 4 13.2 4 11.5z'),
  // koło ratunkowe
  crisis_management: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="3.8" />{p('M9.3 9.3L6 6M14.7 9.3L18 6M9.3 14.7L6 18M14.7 14.7L18 18')}</>,
  // sieć (węzły)
  analytical_thinking: <><rect x="9.5" y="3.5" width="5" height="4.5" rx="1" /><rect x="3.5" y="16" width="5" height="4.5" rx="1" /><rect x="15.5" y="16" width="5" height="4.5" rx="1" />{p('M12 8v4M6 16v-2.2h12V16M12 12v1.8')}</>,
  // żarówka
  creativity: <>{p('M9 17.5h6M10 20.5h4')}{p('M12 3.5a5.8 5.8 0 0 0-3.5 10.4c.6.5 1 1.2 1 2v1.6h5v-1.6c0-.8.4-1.5 1-2A5.8 5.8 0 0 0 12 3.5z')}</>,
  // uścisk dłoni (uproszczony)
  negotiation: <>{p('M2.5 11l3.5-3.5 3 1.2 3-1.7 3 1.7 3-1.2 3.5 3.5')}{p('M6 13.5l4.2 4.2c.6.6 1.4.6 2 0l5.8-5.8')}{p('M9 8.7l-2.2 2.6c-.5.6-.4 1.4.3 1.8.6.3 1.3.2 1.7-.3L11 10.5')}</>,
  // megafon
  public_speaking: <>{p('M4 10v4h3l8 4.5v-13L7 10z')}{p('M7 14l1.2 5h2.3L9.6 14.6')}{p('M18 9.5c1 .7 1.5 1.5 1.5 2.5s-.5 1.8-1.5 2.5')}</>,
  // osoba (interesant)
  customer_orientation: <><circle cx="12" cy="8" r="3.6" />{p('M4.5 20c.6-4 3.6-6.4 7.5-6.4s6.9 2.4 7.5 6.4')}</>,
  // trzy osoby: zespół
  people_management: <><circle cx="12" cy="6.8" r="2.6" />{p('M8 13.5c.5-2.2 2-3.3 4-3.3s3.5 1.1 4 3.3')}<circle cx="6" cy="14.5" r="2.2" /><circle cx="18" cy="14.5" r="2.2" />{p('M2.5 21c.4-1.9 1.7-3 3.5-3s3.1 1.1 3.5 3M14.5 21c.4-1.9 1.7-3 3.5-3s3.1 1.1 3.5 3')}</>,
  // drogowskaz: decyzja
  decisions: <>{p('M12 21V3')}{p('M12 5h6.5l2 2.2-2 2.3H12')}{p('M12 11.5H5.5l-2 2.2 2 2.3H12')}</>,
  // flaga na szczycie: strategia
  strategic_management: <>{p('M3 20.5l6.5-10 4 6 2.5-3.5 5 7.5z')}{p('M9.5 10.5V3.5l4 1.6-4 1.6')}</>,
}

/** Krótkie nazwy na chipy i kafle (pełna nazwa z zał. 1 zawsze w nazwie dostępnej, slocie i części I). */
export const SHORT_NAMES: Record<string, string> = {
  knowledge: 'Wiedza i doskonalenie', reliability: 'Rzetelność', organization: 'Organizacja pracy', cooperation: 'Współpraca',
  communication: 'Komunikacja', crisis_management: 'Sytuacje kryzysowe', analytical_thinking: 'Myślenie analityczne',
  creativity: 'Kreatywność', negotiation: 'Negocjowanie', public_speaking: 'Wystąpienia publiczne',
  customer_orientation: 'Orientacja na klienta', people_management: 'Zarządzanie ludźmi', decisions: 'Decyzje i odpowiedzialność',
  strategic_management: 'Zarządzanie strategiczne',
}
export const shortName = (key: string, label: string) => SHORT_NAMES[key] ?? label

export function CompetencyIcon({ id, size = 22 }: { id: string; size?: number }) {
  return (
    <svg className="sv2-icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false"
      fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {COMPETENCY[id] ?? <circle cx="12" cy="12" r="7" />}
    </svg>
  )
}

const UI = {
  plus: p('M12 5v14M5 12h14'),
  close: p('M6 6l12 12M18 6L6 18'),
  check: p('M5 12.5l4.5 4.5L19 7.5'),
  lock: <><rect x="5" y="10.5" width="14" height="10" rx="2" />{p('M8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3')}</>,
  up: p('M12 19V5M6 11l6-6 6 6'),
  cycle: <>{p('M19.5 9A8 8 0 0 0 5 7.5M4.5 15A8 8 0 0 0 19 16.5')}{p('M5 3.5v4h4M19 20.5v-4h-4')}</>,
  idcard: <><rect x="3" y="5.5" width="18" height="13" rx="2" /><circle cx="9" cy="11" r="2" />{p('M6 15.5c.5-1.3 1.6-2 3-2s2.5.7 3 2M14.5 10h3.5M14.5 13.5h3.5')}</>,
  doc: <>{p('M6 3.5h8l4 4v13H6z')}{p('M14 3.5v4h4M9 12h6M9 15.5h6')}</>,
  personx: <><circle cx="9.5" cy="8" r="3.4" />{p('M3 20c.5-3.6 3.1-6 6.5-6s6 2.4 6.5 6')}{p('M17 7.5l4 4M21 7.5l-4 4')}</>,
  people: <><circle cx="9" cy="8" r="3.2" />{p('M3 19.5c.4-3.4 2.8-5.5 6-5.5s5.6 2.1 6 5.5')}<circle cx="16.5" cy="9" r="2.6" />{p('M16.5 14c2.6 0 4.2 1.7 4.6 4.6')}</>,
  flag: <>{p('M5 21V4')}{p('M5 4.5h11l-2 3.5 2 3.5H5')}</>,
  pin: <>{p('M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z')}<circle cx="12" cy="10" r="2.4" /></>,
  pen: <>{p('M4 20l1-4.5L15.5 5a2.1 2.1 0 0 1 3 3L8 18.5z')}{p('M13.5 7l3 3')}</>,
  clock: <><circle cx="12" cy="12" r="8.5" />{p('M12 7.5V12l3 2')}</>,
  archive: <><rect x="3.5" y="4.5" width="17" height="4.5" rx="1" />{p('M5 9v10.5h14V9M10 13h4')}</>,
  eye: <>{p('M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z')}<circle cx="12" cy="12" r="3" /></>,
  download: <>{p('M12 4v11M7.5 10.5L12 15l4.5-4.5')}{p('M5 19.5h14')}</>,
  arrow: p('M5 12h14M13 6l6 6-6 6'),
  chevron: p('M6 9l6 6 6-6'),
  calendar: <><rect x="3.5" y="5" width="17" height="15.5" rx="2" />{p('M3.5 10h17M8 3v4M16 3v4')}</>,
  list: p('M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01'),
}
export type UiIconName = keyof typeof UI

export function UiIcon({ name, size = 18 }: { name: UiIconName; size?: number }) {
  return (
    <svg className="sv2-icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false"
      fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      {UI[name]}
    </svg>
  )
}
