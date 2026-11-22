// Historia demo (fikcyjne osoby) przez API, ułożona względem dnia 22.11.2026. Uruchamiać po demo-seed.mjs.
// Użycie: node scripts/demo-story.mjs <email SuperAdmin> <hasło> [plik_kont z demo-seed]
//
// Na czystej bazie: docker compose down -v → start API → demo-seed.mjs → demo-story.mjs.
// Skrypt jest idempotentny: rozpoznaje ocenę po dacie startu cyklu i pomija kroki już wykonane
// (zamknięte etapy, złożone podpisy, istniejące notatki). Haseł nie wypisuje.
//
// Stan po uruchomieniu (dziś = 22.11.2026):
//  - Katarzyna Nowak (arkusz C): cykl od 09.12.2024, część I podpisana 19.12.2024, termin sporządzenia 09.12.2026.
//    Etap oceny: wskaźniki i oceny cząstkowe dla 4 kryteriów, „Kryzysy” w połowie, „Rzetelność” bez ocen (na żywo).
//    Notatki S/D/R od 02.2025 do 11.2026, oczekiwania z rozmowy rozpoczynającej, samoocena przekazana.
//  - Piotr Zieliński (arkusz C): cykl od 27.11.2024, ocena sporządzona 18.11.2026, czeka na zapoznanie (do 25.11.2026).
//    Sporządzenie oceny samo otwiera nowy cykl od 18.11.2026 (backend).
//  - Ewa Sowa (arkusz C): nowy cykl od 27.10.2026, rozmowa rozpoczynająca do 26.11.2026.
//  - Jan Bąk: pierwsza ocena od 02.11.2026 (data zatrudnienia), bez zmian.
//  - Anna Kowalczyk (arkusz B, bo kieruje zespołem) i Magdalena Lis (C): cykle przesunięte z 2012/2016 na 11.2026,
//    żeby pulpit HR nie pokazywał terminów sprzed lat.
import { readFileSync } from 'node:fs';

const [adminEmail, adminPassword, accountsFile = 'demo-accounts.local.txt'] = process.argv.slice(2);
if (!adminEmail || !adminPassword) {
  console.error('Użycie: node scripts/demo-story.mjs <email SuperAdmin> <hasło> [plik_kont]');
  process.exit(1);
}
const BASE = process.env.API ?? 'http://localhost:5283/api';
// Fikcyjna nazwa urzędu w arkuszach (dane słownikowe służb w bazie to realne formacje — nie wpisujemy ich do arkusza).
const OFFICE = process.env.DEMO_OFFICE ?? 'Urząd Wojewódzki w Przykładowie';
const PLACE = 'Warszawa';

const accounts = { admin: { email: adminEmail, password: adminPassword } };
for (const line of readFileSync(accountsFile, 'utf8').split('\n')) {
  const m = line.match(/^(.+?): (\S+) \/ (\S+)/);
  if (m) accounts[m[1]] = { email: m[2], password: m[3] };
}

const tokens = {};
async function as(who) {
  if (!accounts[who]) throw new Error(`Brak konta „${who}” w ${accountsFile}`);
  if (!tokens[who]) {
    const r = await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(accounts[who]) });
    if (!r.ok) throw new Error(`Logowanie ${who}: ${r.status}`);
    tokens[who] = (await r.json()).token;
  }
  return async (path, method = 'GET', body) => {
    const r = await fetch(`${BASE}/${path}`, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens[who]}` }, body: body && JSON.stringify(body) });
    const t = await r.text();
    if (!r.ok) throw new Error(`${who}: ${method} ${path} → ${r.status} ${t.slice(0, 400)}`);
    return t ? JSON.parse(t) : null;
  };
}

const log = (...a) => console.log(...a);
const admin = await as('admin');
const anna = await as('Anna Kowalczyk');

const employees = (await admin('employees?pageSize=200')).items ?? await admin('employees?pageSize=200');
const emp = (first, last) => {
  const e = employees.find((x) => x.firstName === first && x.lastName === last);
  if (!e) throw new Error(`Brak pracownika ${first} ${last} — najpierw demo-seed.mjs`);
  return e;
};

/**
 * Ocena okresowa pracownika z cyklem od `start`. Gdy jej nie ma, przestawia najstarszą nierozpoczętą ocenę okresową
 * (PUT template ze StartDate — działa tylko przed pierwszym wpisem), a w ostateczności zakłada nową.
 */
async function cycle(call, employee, templateCode, start) {
  const list = await call(`evaluations?employeeId=${employee.id}`);
  const periodic = list.filter((e) => e.templateCode.startsWith('periodic'));
  const found = periodic.find((e) => e.startDate === start);
  if (found) return call(`evaluations/${found.id}`);
  for (const candidate of periodic.filter((e) => !e.isFinal).sort((a, b) => a.startDate.localeCompare(b.startDate))) {
    const d = await call(`evaluations/${candidate.id}`);
    const fresh = d.answers.length === 0 && d.signatures.length === 0 && d.stages.every((s) => s.status === 'Pending');
    if (fresh) {
      log(`  ${employee.firstName} ${employee.lastName}: ocena ${d.id} → ${templateCode}, start ${start} (było ${d.startDate})`);
      return call(`evaluations/${d.id}/template`, 'PUT', { templateCode, startDate: start });
    }
  }
  log(`  ${employee.firstName} ${employee.lastName}: nowa ocena ${templateCode} od ${start}`);
  return call('evaluations', 'POST', { employeeId: employee.id, templateCode, startDate: start });
}

const stageOf = (d, key) => d.stages.find((s) => s.key === key);
const pending = (d, key) => stageOf(d, key)?.status === 'Pending';
const signed = (d, field) => d.signatures.some((s) => s.fieldKey === field);

async function sign(call, d, fieldKey, signedOn) {
  if (signed(d, fieldKey)) return;
  await call(`evaluations/${d.id}/signatures`, 'POST', { fieldKey, signedOn, place: PLACE });
}

async function complete(call, d, stageKey, completedOn) {
  if (!pending(d, stageKey)) return;
  await call(`evaluations/${d.id}/stages/${stageKey}/complete`, 'POST', { completedOn });
}

const competencyName = (d, key) => d.schema.competencyModel.competencies[key].name;
const indicatorsOf = (d, key) => d.schema.competencyModel.competencies[key].indicators.map((i) => i.key);

/** Odpowiedzi części I: urząd, stanowiska, kryteria (obowiązkowe + dodatkowe), termin sporządzenia oceny. */
function part1Answers(d, { additional, dueDate, evaluatedPosition, evaluatorPosition }) {
  const selection = d.schema.sections.flatMap((s) => s.fields).find((f) => f.type === 'criteriaSelection');
  return [
    { fieldKey: 'office', valueText: OFFICE },
    { fieldKey: 'evaluated', itemKey: 'position', valueText: evaluatedPosition },
    { fieldKey: 'evaluator', itemKey: 'position', valueText: evaluatorPosition },
    ...selection.mandatory.map((m) => ({ fieldKey: 'criteria', itemKey: m.key, valueText: m.label })),
    ...additional.map((key) => ({ fieldKey: 'criteria', itemKey: key, valueText: competencyName(d, key) })),
    { fieldKey: 'evaluationDueDate', valueDate: dueDate },
  ];
}

/** Wskaźniki (wartości po kolei) i ewentualnie ocena cząstkowa kryterium. */
function scoreAnswers(d, criterion, indicatorValues, score) {
  const keys = indicatorsOf(d, criterion);
  const rows = indicatorValues.map((v, i) => ({ fieldKey: 'scoresIndicators', itemKey: keys[i], valueNumber: v }));
  if (score != null) rows.push({ fieldKey: 'scores', itemKey: criterion, valueNumber: score });
  return rows;
}

async function notes(call, d, list) {
  const existing = (await call(`evaluations/${d.id}/notes`)).notes;
  for (const n of list) {
    if (existing.some((e) => e.situation === n.situation && e.observedOn === n.observedOn)) continue;
    await call(`evaluations/${d.id}/notes`, 'POST', n);
  }
}

const ANNA_POSITION = 'Naczelnik Wydziału Zarządzania Kryzysowego';

// ---------- Katarzyna Nowak: etap oceny w toku ----------
{
  const k = emp('Katarzyna', 'Nowak');
  const katarzyna = await as('Katarzyna Nowak');
  let d = await cycle(anna, k, 'periodic-c', '2024-12-09');
  log(`Katarzyna Nowak: ocena ${d.id}`);
  if (pending(d, 'criteria')) {
    await anna(`evaluations/${d.id}/answers`, 'PUT', {
      answers: part1Answers(d, {
        additional: ['crisis_management'], dueDate: '2026-12-09',
        evaluatedPosition: 'Starszy specjalista ds. zarządzania kryzysowego', evaluatorPosition: ANNA_POSITION,
      }),
    });
    // Oczekiwania ustalone na rozmowie rozpoczynającej (można je zmieniać tylko w pierwszym etapie).
    const expectations = {
      reliability_1: 'Raporty dobowe i meldunki do centrum wojewódzkiego zgodne z procedurą, bez poprawek merytorycznych.',
      reliability_2: 'Terminy z planu ćwiczeń i sprawozdań kwartalnych dotrzymane; o ryzyku opóźnienia informuje z wyprzedzeniem.',
      crisis_management_2: 'Podczas dyżuru samodzielnie uruchamia procedurę powiadamiania i koordynuje pierwsze działania.',
      communication_3: 'Komunikaty dla gmin pisane prostym językiem, zrozumiałe bez dodatkowych wyjaśnień.',
    };
    for (const [key, expectation] of Object.entries(expectations)) {
      await anna(`evaluations/${d.id}/context/indicators/${key}`, 'PUT', { expectation });
    }
    d = await anna(`evaluations/${d.id}`);
    await sign(anna, d, 'criteriaEvaluatorSignature', '2024-12-19');
    await sign(katarzyna, d, 'criteriaEvaluatedSignature', '2024-12-19');
    await complete(anna, d, 'criteria', '2024-12-19');
    d = await anna(`evaluations/${d.id}`);
  }

  if (pending(d, 'evaluation')) {
    await anna(`evaluations/${d.id}/answers`, 'PUT', {
      answers: [
        ...scoreAnswers(d, 'knowledge', [7, 7, 5], 7),
        ...scoreAnswers(d, 'organization', [5, 7, 5, 5, 7], 5),
        ...scoreAnswers(d, 'cooperation', [7, 7, 9, 7, 7, 5], 7),
        ...scoreAnswers(d, 'communication', [5, 5, 7, 5], 5),
        ...scoreAnswers(d, 'crisis_management', [7, 9], null), // w toku: 2 z 3 wskaźników, bez oceny cząstkowej
        // Rzetelność — celowo bez wpisów (ocena na żywo w demo).
        { fieldKey: 'finalEvaluator', itemKey: 'position', valueText: ANNA_POSITION },
      ],
    });
    await anna(`evaluations/${d.id}/context/criteria/organization`, 'PUT', {
      scoreReason: 'Sugestia 5,8 — zostawiam 5: priorytety ustala dobrze, ale przy zmianach planu potrzebuje jeszcze wsparcia.',
    });

    await notes(anna, d, [
      { observedOn: '2025-02-14', indicatorKey: 'knowledge_1', discussedWithEmployee: true,
        situation: 'Aktualizacja planu zarządzania kryzysowego po zmianie ustawy.',
        action: 'Samodzielnie zestawiła zmiany w przepisach z zapisami planu i przygotowała tabelę rozbieżności.',
        result: 'Plan zaktualizowano w terminie, bez uwag wydziału prawnego.' },
      { observedOn: '2025-05-22', indicatorKey: 'cooperation_2', discussedWithEmployee: true,
        situation: 'Ćwiczenia powiatowe „Powódź 2025”.',
        action: 'Prowadziła bieżącą wymianę informacji między sztabem a trzema gminami, codziennie rozsyłała podsumowanie.',
        result: 'Gminy dostawały ustalenia tego samego dnia; w ankiecie po ćwiczeniach komunikację oceniono najwyżej.' },
      { observedOn: '2025-09-08', indicatorKey: 'organization_4',
        situation: 'Nagła zmiana harmonogramu kontroli magazynów przeciwpowodziowych.',
        action: 'Przełożyła dwie kontrole, ale bez uzgodnienia z kierownikiem referatu.',
        result: 'Kontrole odbyły się, jedna z jednodniowym opóźnieniem. Omówione: zmiany planu uzgadniamy wcześniej.' },
      { observedOn: '2026-01-27', indicatorKey: 'reliability_2', discussedWithEmployee: true,
        situation: 'Sprawozdanie roczne z realizacji zadań obrony cywilnej.',
        action: 'Zebrała dane od 12 jednostek i przekazała sprawozdanie dwa dni przed terminem.',
        result: 'Sprawozdanie przyjęte bez korekt.' },
      { observedOn: '2026-04-16', indicatorKey: 'crisis_management_2',
        situation: 'Dyżur w centrum zarządzania kryzysowego — awaria wodociągu w gminie.',
        action: 'Uruchomiła procedurę powiadamiania i zorganizowała beczkowozy przed przyjazdem kierownika zmiany.',
        result: 'Dostawy wody ruszyły po 3 godzinach, mieszkańców poinformowano przez system alertów.' },
      { observedOn: '2026-07-03', indicatorKey: 'reliability_1',
        situation: 'Kontrola wewnętrzna raportów dobowych.',
        action: 'W dwóch raportach z czerwca pominęła wymagane pole o stanie łączności zapasowej.',
        result: 'Uzupełniła raporty po uwadze kontrolera; zaproponowała listę kontrolną do raportu.' },
      { observedOn: '2026-10-21', indicatorKey: 'communication_3', discussedWithEmployee: true,
        situation: 'Komunikat dla mieszkańców przed sezonem grzewczym.',
        action: 'Przygotowała komunikat prostym językiem i skonsultowała go z rzecznikiem.',
        result: 'Komunikat opublikowały wszystkie gminy bez zmian w treści.' },
      { observedOn: '2026-11-12', isPrivate: true,
        situation: 'Przygotowanie do rozmowy oceniającej.',
        action: 'Do omówienia: szkolenie z kierowania akcją (IPRZ) i samodzielne prowadzenie ćwiczeń w 2027 r.',
        result: null },
    ]);

    // Samoocena ocenianej (przekazanie ma dzisiejszą datę — API nie pozwala jej cofnąć).
    const self = await katarzyna(`evaluations/${d.id}/self-assessment`);
    if (self.canEdit) {
      await katarzyna(`evaluations/${d.id}/self-assessment`, 'PUT', {
        criteria: [
          { criterionKey: 'knowledge', level: 'above', comment: 'Aktualizacja planu po zmianie przepisów, szkolenie z systemu alertów.' },
          { criterionKey: 'reliability', level: 'meets', comment: 'Sprawozdania w terminie; poprawiłam raporty dobowe po kontroli.' },
          { criterionKey: 'organization', level: 'meets' },
          { criterionKey: 'cooperation', level: 'above', comment: 'Koordynacja informacji z gminami podczas ćwiczeń.' },
          { criterionKey: 'communication', level: 'meets' },
          { criterionKey: 'crisis_management', level: 'above', comment: 'Samodzielny dyżur przy awarii wodociągu.' },
        ],
        developmentNeeds: 'Szkolenie z kierowania akcją ratowniczą; chciałabym prowadzić ćwiczenia powiatowe w 2027 r.',
      });
      await katarzyna(`evaluations/${d.id}/self-assessment/submit`, 'POST');
    }
  }
}

// ---------- Piotr Zieliński: ocena sporządzona 18.11.2026, czeka na zapoznanie ----------
{
  const p = emp('Piotr', 'Zieliński');
  const piotr = await as('Piotr Zieliński');
  let d = await cycle(anna, p, 'periodic-c', '2024-11-27');
  log(`Piotr Zieliński: ocena ${d.id}`);
  if (pending(d, 'criteria')) {
    await anna(`evaluations/${d.id}/answers`, 'PUT', {
      answers: part1Answers(d, {
        additional: ['analytical_thinking'], dueDate: '2026-11-27',
        evaluatedPosition: 'Główny specjalista ds. analiz zagrożeń', evaluatorPosition: ANNA_POSITION,
      }),
    });
    d = await anna(`evaluations/${d.id}`);
    await sign(anna, d, 'criteriaEvaluatorSignature', '2024-12-10');
    await sign(piotr, d, 'criteriaEvaluatedSignature', '2024-12-10');
    await complete(anna, d, 'criteria', '2024-12-10');
    d = await anna(`evaluations/${d.id}`);
  }

  if (pending(d, 'evaluation')) {
    await notes(anna, d, [
      { observedOn: '2025-03-11', indicatorKey: 'analytical_thinking_2', discussedWithEmployee: true,
        situation: 'Analiza ryzyka powodziowego dla raportu wojewódzkiego.',
        action: 'Połączył dane hydrologiczne z mapą infrastruktury krytycznej i wskazał trzy nowe punkty ryzyka.',
        result: 'Wnioski włączono do raportu o zagrożeniach.' },
      { observedOn: '2025-11-05', indicatorKey: 'reliability_2',
        situation: 'Kwartalne zestawienie zdarzeń.',
        action: 'Przekazał zestawienie z tygodniowym opóźnieniem, bez wcześniejszej informacji.',
        result: 'Omówione; kolejne zestawienia w terminie.' },
      { observedOn: '2026-06-18', indicatorKey: 'cooperation_6', discussedWithEmployee: true,
        situation: 'Wdrożenie nowej osoby w referacie.',
        action: 'Przygotował instrukcję do narzędzia analitycznego i przeprowadził dwa krótkie szkolenia.',
        result: 'Nowa osoba samodzielnie przygotowała pierwszą analizę po miesiącu.' },
    ]);
    await anna(`evaluations/${d.id}/answers`, 'PUT', {
      answers: [
        ...scoreAnswers(d, 'knowledge', [7, 7, 7], 7),
        ...scoreAnswers(d, 'reliability', [7, 5], 5),
        ...scoreAnswers(d, 'organization', [5, 5, 7, 5, 5], 5),
        ...scoreAnswers(d, 'cooperation', [7, 5, 7, 7, 7, 9], 7),
        ...scoreAnswers(d, 'communication', [5, 7, 7, 5], 7),
        ...scoreAnswers(d, 'analytical_thinking', [7, 9, 7], 7),
        { fieldKey: 'evaluationInterviewDate', valueDate: '2026-11-17' },
        { fieldKey: 'evaluationPeriod', valueDate: '2024-12-10', valueDateTo: '2026-11-18' },
        { fieldKey: 'developmentConclusions', valueText:
          'Szkolenie z wizualizacji danych przestrzennych (GIS) w I półroczu 2027 r. Udział jako analityk w ćwiczeniach wojewódzkich. '
          + 'Planowanie pracy przy zestawieniach kwartalnych: harmonogram z punktami kontrolnymi uzgadniany z przełożoną.' },
        { fieldKey: 'promotionRequest', valueText: 'no' },
        { fieldKey: 'finalEvaluator', itemKey: 'position', valueText: ANNA_POSITION },
      ],
    });
    d = await anna(`evaluations/${d.id}`);
    await sign(anna, d, 'evaluationEvaluatorSignature', '2026-11-18');
    await complete(anna, d, 'evaluation', '2026-11-18');
  }
}

// ---------- Ewa Sowa: świeży cykl, rozmowa rozpoczynająca do 26.11.2026 ----------
{
  const d = await cycle(anna, emp('Ewa', 'Sowa'), 'periodic-c', '2026-10-27');
  log(`Ewa Sowa: ocena ${d.id}`);
}

// ---------- Anna i Magdalena: bez terminów sprzed lat (arkusz B dla kierującej zespołem) ----------
{
  const a = await cycle(admin, emp('Anna', 'Kowalczyk'), 'periodic-b', '2026-11-16');
  log(`Anna Kowalczyk: ocena ${a.id}`);
  const m = await cycle(admin, emp('Magdalena', 'Lis'), 'periodic-c', '2026-11-09');
  log(`Magdalena Lis: ocena ${m.id}`);
}

// ---------- Podsumowanie ----------
for (const e of await admin('evaluations')) {
  log(`#${e.id} ${e.employeeName} · ${e.templateCode} · start ${e.startDate} · ${e.statusLabel} · ${e.phase} · następny: ${e.nextStageTitle ?? '—'} do ${e.nextDueTo ?? '—'}`);
}
