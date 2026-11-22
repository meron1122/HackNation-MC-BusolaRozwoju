# v2 — wspólne komponenty makiet v2

`import { Info, Source, AiFrame, Segments, Ring, Radar, ScaleBar, useStepHeader } from '../v2'`
(style ładuje `v2/index.ts`, prefiks klas `v2-`). Właściciel: agent „Fundament”.

| Komponent | Do czego | API |
|---|---|---|
| `Info` | ⓘ przy regule systemu / zasadzie Busoli. Dymek na hover i focus, Escape zamyka, `aria-describedby`. | `<Info label?="Wyjaśnienie" align?="center\|start\|end">treść dymku</Info>` |
| `Source` | ↗ tylko przy tym, co reguluje przepis. Dymek z podstawą. Klik: `href` → nowa karta, `onOpen`, albo domyślnie pyta asystenta o przepis. | `<Source refText="Rozp. 2016 · § 11 ust. 1 pkt 1" href? onOpen? align?>{opcjonalny tekst}</Source>` |
| `askAssistant(q)` | Otwiera zakładkę ✦ Asystent (w kreatorze) albo okno asystenta i wysyła pytanie. | `askAssistant('Ile dni na sprzeciw?')` |
| `AiFrame` | Treść AI: ✦ + przerywana lawendowa ramka. Akcje pojawiają się, gdy podasz handler. Nic nie wstawia się samo. | `<AiFrame label?="Asystent"\|null aside? onInsert? onEdit? onReject? insertLabel?="Wstaw" busy? actions? compact? live?>…</AiFrame>` |
| `Spark` | Sam znak ✦ (lawenda). | `<Spark />` |
| `Segments` | Postęp z liczbą „2/6” (nie tylko kolor). `current` od 1. | `<Segments current={2} total={6} done? label?="Kryterium 2 z 6" size?="md\|sm" />` |
| `Ring` | Licznik dni (pierścień). `overdue` = przerywany łuk + „po terminie”. | `<Ring value={30} max={30} caption?="dni" size?={88} overdue? label? />` |
| `ScaleBar` | Skala 1–9 z przedziałami, granica należy do niższego (4,00 → „poniżej”). | `<ScaleBar value={4} bands?={PERIODIC_BANDS} labels?="active\|all\|none" digits?={2} label? />` |
| `PERIODIC_BANDS`, `bandOf(v, bands)`, `bandsFromLevels(schema.scoring.levels)` | Przedziały oceny okresowej; z poziomów szablonu, jeśli są. | |
| `Radar` | Radar jednej osoby w czasie albo anonimowej mediany (n ≥ 5). Osie w kolejności arkusza, pierścienie 1/5/9 (5 przerywany), seria A `#2B6CB0` z wypełnieniem, seria B przerywana, wartości przy wierzchołkach A, przerwa przy `null`. | `<Radar axes={['Rzetelność', …]} series={[{ name: '2027', values: [5, 7, null, …] }, { name: '2025', kind: 'b', values }]} size?={320} title? />` |
| `StepHeader` | Wiersz nagłówka treści: awatar, imię · temat, segmenty. Kreator renderuje go sam. | `<StepHeader personId name topic? progress?={{ current, total, label? }} aside? />` |
| `useStepHeader(topic, progress)` | Krok w kreatorze podmienia temat i postęp nagłówka (np. „Rzetelność”, 2/6). Bez wywołania nagłówek pokazuje tytuł kroku. | `useStepHeader(criterion.label, { current: 2, total: 6, label: 'Kryterium 2 z 6' })` |
| `Warn` | Ostrzeżenie / brak: ikona ! i granatowy obrys na `#DCEEFB`. | `<Warn title? alert?>treść</Warn>` |
| `Compass` | Busola z igłą: `search` (waha się), `settle` (ustawia się raz), `still`. Respektuje `prefers-reduced-motion`. | `<Compass size={48} state="search" halo? />` |

## Kreator (Wizard.tsx) — układ v2
- Lewa kolumna 272 px: „ARKUSZ C”, 5 etapów (Start cyklu · Obserwacja · Przygotowanie oceny · Czeka na zapoznanie · Okno sprzeciwu), pod-kroki tylko pod bieżącym etapem, karta terminu na dole.
- Treść: `StepHeader` + krok. Max szerokość treści 820 px.
- Prawy panel 384 px: zakładki „Notatki · N” i „✦ Asystent”. Poniżej 1366 px panel zwija się do wąskiej szyny i otwiera jako szuflada.

## Role kolorów (busola-hifi.css)
- `--ai` / `--ai-text` / `--ai-soft` — lawenda, wyłącznie AI.
- `--state` `#2B6CB0` — obrysy i linie stanu. Ostrzeżenie: klasa `.v2-warn` (ikona ! + granatowy obrys na `#DCEEFB`).
- Najmniejszy tekst 14 px, podstawowy 16 px.
