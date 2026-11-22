# Backend

.NET 10, EF Core 10, PostgreSQL (Npgsql).

- `Busola.Database` — encje, DbContext, migracje, definicje ról i uprawnień,
- `Busola.Api` — REST API (kontrolery), logowanie JWT, CRUD pracowników, lokalizacji, wydziałów i kont.

## Model danych

```mermaid
erDiagram
    services ||--o{ locations : ""
    locations ||--o{ departments : ""
    departments ||--o{ employees : ""
    employees |o--o{ employees : "supervisor_id"
    employees ||--o{ absences : ""
    absence_reasons ||--o{ absences : ""

    services { int id PK  varchar name UK }
    locations { int id PK  varchar name  int service_id FK }
    departments { int id PK  varchar name  int location_id FK }
    employees {
        int id PK
        varchar first_name
        varchar last_name
        date date_of_birth
        date hire_date
        int department_id FK
        int supervisor_id FK "nullable"
    }
    absences { int id PK  date start_date  date end_date  int reason_id FK  int employee_id FK }
    absence_reasons { int id PK  varchar name UK }
```

| Encja (C#) | Tabela | Znaczenie |
|---|---|---|
| `Service` | `services` | służba |
| `Location` | `locations` | lokalizacja |
| `Department` | `departments` | wydział |
| `Position` | `positions` | stanowisko ze słownika urzędu (służby), unikalne w służbie; pracownik ma `employees.position_id`, HR wybiera je w profilu (Zatrudnienie), a arkusz bierze stąd „Stanowisko pracy”; nie da się usunąć stanowiska, które ktoś ma |
| `Employee` | `employees` | pracownik (lokalizacja i służba wynikają z wydziału) |
| `Absence` | `absences` | dni wolne (zakres `start_date`–`end_date`, obie daty włącznie) |
| `AbsenceReason` | `absence_reasons` | powód dnia wolnego |

Reguły w bazie:
- nazwy w `snake_case` (`EFCore.NamingConventions`), klucze `int` jako identity,
- unikalne: nazwa służby, nazwa powodu, nazwa lokalizacji w obrębie służby, nazwa wydziału w obrębie lokalizacji,
- `CHECK`: `end_date >= start_date`, pracownik nie może być swoim przełożonym,
- usunięcie pracownika usuwa jego nieobecności. Wszystkie pozostałe usunięcia są blokowane, jeśli coś na rekord wskazuje (np. przełożonego z podwładnymi trzeba najpierw przepiąć).

## Oceny: szablony arkuszy (JSONB)

`evaluation_templates.schema` (jsonb) trzyma **tylko strukturę** arkusza. Dane konkretnej oceny są w zwykłych kolumnach:

| Tabela | Co trzyma |
|---|---|
| `evaluation_templates` | `code` + `version`, `kind` (`First`/`Periodic`), `schema` jsonb. Seed: `first` (arkusz pierwszej oceny), `periodic-b` (arkusz B, stanowiska kierownicze), `periodic-c` (arkusz C, pozostałe) |
| `evaluations` | pracownik, wersja szablonu, bieżący `status` (klucz ze słownika szablonu), `start_date` (punkt odniesienia terminów), oceniający |
| `evaluation_stages` | etap oceny: `stage_key`, `status` (`Pending`/`Completed`/`Skipped`), `due_from`/`due_to` (policzone z szablonu, można przesunąć indywidualnie), `completed_on` |
| `evaluation_answers` | wartości pól arkusza, jeden wiersz na wartość: `field_key` (klucz pola ze szablonu), `item_key` (pozycja w polu, opis niżej), wartość w `value_text` / `value_number` / `value_date` (+ `value_date_to` dla zakresu dat), kto i kiedy zmienił |
| `evaluation_signatures` | potwierdzenia z pól `signature`: `field_key`, rola, konto, które podpisało, imię i nazwisko z chwili podpisu, data, miejscowość oraz opcjonalny obraz podpisu (`image_content`, `image_content_type`, `image_sha256`) |
| `evaluation_self_assessments` | samoocena ocenianego (1:1 z oceną): pozycje per kryterium w jsonb (`criterion_key`, `level` = klucz stopnia skali, `comment`), potrzeby rozwojowe, `submitted_at` (po przekazaniu tylko do odczytu; przełożony widzi treść dopiero wtedy) |
| `evaluation_notes` | notatki oceniającego z obserwacji: data zdarzenia, sytuacja / działanie / rezultat, opcjonalnie wskaźnik i jego kryterium, prywatna (tylko autor), omówiona z pracownikiem; oceniany ich nie widzi |
| `evaluation_indicator_contexts` | per wskaźnik: przykład oczekiwania z rozmowy rozpoczynającej (widzi go oceniany) |
| `evaluation_criterion_contexts` | per kryterium: dlaczego ocena cząstkowa różni się od sugestii ze wskaźników |
| `evaluation_reminders` | przypomnienia HR o etapie w toku: etap, adresat (oceniający), treść, kto i kiedy |

Notatki, samoocena, kontekst i przypomnienia to materiał roboczy poza arkuszem, więc mają własne tabele i nie wymuszają nowych wersji szablonu. Wydział ma opcjonalnego kierującego komórką (`departments.head_id`): dostaje rolę `Supervisor` i zakres obejmujący pracowników wydziału, a pola podpisu z rolą `unitHead` podpisuje tylko on.

Obraz podpisu jest opcjonalny; bez niego podpis to samo potwierdzenie w systemie. Jeśli jest, to w komplecie: tylko PNG albo WebP (bez SVG, bo może zawierać skrypt), do 512 KB, z SHA-256 treści, który pozwala wykryć późniejszą podmianę obrazu. Przy listach podpisów warto pomijać kolumny `image_*`, żeby nie ciągnąć bajtów.

Jak pola szablonu trafiają do `evaluation_answers`:

| Typ pola | Wiersze |
|---|---|
| `text`, `longText`, `choice` | `item_key = null`, `value_text` (dla `choice` klucz opcji, np. `positive`) |
| `date` / `dateRange` | `value_date` / `value_date` + `value_date_to` |
| `year`, `average` | `value_number` |
| `level` | `value_text` = klucz poziomu, np. `above` |
| `person` | wiersze z `item_key` = `firstName`, `lastName`, `department`, `position`, czyli kopia z dnia wypełnienia, nie odwołanie do pracownika |
| `criteriaSelection` | wiersz na wybrane kryterium: `item_key` = klucz, `value_text` = nazwa (dodatkowe dostają własne klucze) |
| `scores` | wiersz na pozycję: `item_key` = klucz elementu/kryterium, `value_number` = ocena cząstkowa |

Średnia i poziom są zapisywane przy sporządzeniu oceny, mimo że da się je wyliczyć, żeby dokument nie zmienił się po ewentualnej zmianie reguł. Jedna wartość na `(ocena, pole, pozycja)` i jeden podpis na pole. Usunięcie oceny usuwa jej wartości i podpisy.

Szablon (`Busola.Database/EvaluationTemplates/<kod>.v<wersja>.json`, kontrakt i walidacja w `TemplateSchema.cs`):

- `statuses`: słownik statusów oceny, `initialStatus`; `final: true` = ocena zamknięta.
- `stages`: etapy w kolejności. `deadline.anchor` to `start` albo `stage:<wcześniejszy etap>` (data jego wykonania), `earliest`/`latest` to `{ "months": n }` / `{ "days": n }`, a `completesTo` to status po wykonaniu etapu.
- `sections` → `fields`: sekcje arkusza przypisane do etapów. Typy pól: `text`, `longText`, `date`, `dateRange`, `year`, `choice`, `person` (imię, nazwisko, komórka, stanowisko dla roli `evaluated`/`supervisor`/`unitHead`/`evaluator`), `signature`, `scores`, `average`, `level`, `criteriaSelection`, `notice`. Warunki: `visibleWhen`/`requiredWhen` (`{ field, in }`), podpowiedzi wartości: `prefill`.
- `scales` i `scoring`: skale ocen cząstkowych, progi poziomów i reguły oceny pozytywnej z przypisów do arkuszy.
- `competencyModel` (od v2): model kompetencji z Kompasu Kompetencji (`Model_kompetencji.xlsx`): 14 kompetencji = kryteria, 49 wskaźników behawioralnych = pytania, każdy z opisem zachowania dla każdego stopnia skali, plus wskazówki do oceniania.
  - **Pierwsza ocena:** skala 3/5/7, więc ma tylko trzy środkowe opisy i swoje 5 kompetencji.
  - **Ocena okresowa:** skala 1/3/5/7/9 i wszystkie 14 kompetencji; kryteria dodatkowe (max 3) wybiera się z modelu.
  - **Zapis:** wskaźniki trafiają do pola `indicatorScores` (np. `elementsIndicators` / `scoresIndicators`, `item_key` = klucz wskaźnika, np. `reliability_1`), jako punkty — każdy wskaźnik wybranego kryterium wymaga odpowiedzi ze skali (bez „brak okazji”); brak odpowiedzi blokuje zamknięcie etapu.
  - **Ocena cząstkowa kryterium** zostaje decyzją oceniającego; formularz podpowiada średnią wskaźników zaokrągloną do najbliższego stopnia skali.
  - **Walidacja:** każde kryterium musi mieć kompetencję, a każdy wskaźnik opis dla każdego stopnia skali arkusza.
- Od v3: etap ma `phase` (krótka nazwa fazy na listy, np. „Obserwacja”), `selfAssessment` (w tym etapie oceniany wypełnia samoocenę: okresowa — `evaluation`, pierwsza — `report`), `completedBy: "evaluated"` (etap zamyka oceniany: przy pierwszej ocenie przekazanie samooceny = złożenie sprawozdania; oceniający go nie zamyka, a po terminie może go pominąć jako niezłożone, § 8 ust. 1) i `legalRef`; pole ma `legalRef` (paragraf pokazywany przy brakach) i `computed` (średnia, poziom, wynik). `prefill: "previous.result|level|date"` bierze dane z ostatniej sporządzonej oceny tego samego rodzaju. Uzasadnienie jest wymagane przy ocenie negatywnej (§ 11 ust. 3 / § 10 ust. 4), a wnioski rozwojowe pierwszej oceny są tylko przy pozytywnej (§ 10 ust. 6). Etap może mieć `topics`: zagadnienia rozmowy z przepisu (§ 5 ust. 1, § 10; przy pierwszej ocenie § 3 i § 2/§ 7 pkt 1), z `optional` dla „jeżeli dotyczy” — lista kontrolna na froncie, bez zapisu. `deadline.note` wyjaśnia termin, który nie wynika wprost z przepisu: zapoznanie z oceną ma termin organizacyjny 7 dni od sporządzenia, bo przepis mówi tylko „niezwłocznie” (§ 12 ust. 1 / § 11 ust. 1).

Przebieg oceny (`EvaluationsController`, `EvaluationCheck`, `EvaluationScoring`):

- **Sprawdzenie** (`GET /api/evaluations/{id}/check`): braki per sekcja i etap (pola wymagane i `requiredWhen`, oceny cząstkowe, podpisy, kolejność etapów) z `legalRef`, blokujące albo ostrzeżenia. Zamknięcie etapu z brakami blokującymi zwraca 400 z listą `issues`.
- **Blokada:** sekcje etapu zamkniętego (i podpisy w nich) są tylko do odczytu, np. część I po podpisach.
- **Liczenie:** sugestia oceny cząstkowej = średnia ocenionych wskaźników zaokrąglona do najbliższego stopnia skali; ocenę cząstkową wpisuje oceniający. Średnią, poziom i wynik (`positiveWhen`) liczy backend i zapisuje przy zamknięciu etapu z ocenami cząstkowymi.
- **Terminy z arkusza:** pole z `prefill: "stage:x"` wypełnione w zamykanym etapie ustala termin etapu `x` (termin sporządzenia oceny z części I, termin sprawozdania i okres pierwszej oceny z rozmowy wstępnej).
- **Faza** na listach i pulpitach: status końcowy, „Oczekuje na start” (pierwszy etap bez żadnych wpisów, też nowy cykl) albo `phase` etapu w toku.
- **Robocza ocena:** oceniany nie widzi sekcji etapu z ocenami cząstkowymi (punkty, wynik, uzasadnienie, wnioski), dopóki ocena nie jest sporządzona — ani w szczegółach, ani w sprawdzeniu, ani w PDF.
- **Podpisy w terminie:** pole podpisu można podpisać tylko w etapie w toku (wcześniejsze etapy obowiązkowe zamknięte), nie przed początkiem okna etapu (np. pierwsza ocena od 8. miesiąca), z datą nie z przyszłości i nie sprzed tego początku — w aplikacji i przy linku/QR. Po upływie terminu podpis zostaje możliwy (spóźnioną ocenę trzeba dokończyć). Szczegóły oceny mają `signatureSlots` (czy można podpisać i dlaczego nie).
- **Termin samooceny:** sprawozdanie (pierwsza ocena) — termin etapu ustalony na rozmowie wstępnej; samoocena przy okresowej — 30 dni przed terminem sporządzenia oceny (`EvaluationWorkflow.SelfAssessmentLeadDays`, organizacyjny). Po terminie nadal można przekazać, do zamknięcia etapu.
- **Sprawozdanie** (pierwsza ocena, `first` v4, `SelfAssessmentController`): formularz z zał. nr 3 do rozporządzenia z 2015 r. — nagłówek z arkusza (urząd, dane ocenianego, termin z rozmowy wstępnej), treść wpisana przez ocenianego (`report`), pod nią samoocena elementów i potrzeby rozwojowe jako tekst, podpis ocenianego (`reportEvaluatedSignature`); podpis i przekazanie = złożenie. Złożyć można dopiero po rozmowie wstępnej i od początku terminu wyznaczonego przez przełożonego; po końcu terminu nadal, ale wtedy „sprawozdanie złożone w wyznaczonym terminie” = nie. PDF formularza: `GET /api/evaluations/{id}/self-assessment/pdf` (oceniany zawsze, inni po złożeniu).
- **Sprawozdanie w terminie** (`prefill: "report.onTime"`, pole liczone): tak — etap sprawozdania zamknięty złożeniem w terminie od–do; nie — po terminie albo oznaczone jako niezłożone; zapisuje się przy sporządzeniu oceny i wchodzi do wyniku (§ 10 ust. 1 pkt 2).
- **Termin sprawozdania w arkuszu:** zakres z `prefill: "stage:x"` nie może zaczynać się przed najwcześniejszym terminem etapu `x` z szablonu (sprawozdanie: po 8 mies., § 4 ust. 1 rozporządzenia; ocena: po 8 mies., art. 38 ust. 1 ustawy) ani kończyć po końcu okresu następnego etapu wpisanego w arkuszu (sprawozdanie przed końcem okresu pierwszej oceny — poradnik, pkt 4.1).
- **Nieobecności** (`AbsencesController`, profil → Nieobecności; `AbsenceDeadlines`): słownik powodów z rodzajem (usprawiedliwiona, obowiązki służbowe poza miejscem pracy, nieusprawiedliwiona), nieobecność bez końca = trwa. Wpisy łączą się w nieprzerwaną nieobecność, gdy dzielą je tylko dni wolne (zmiana powodu nie przerywa).
  - **Ocena okresowa, art. 81 ust. 7:** usprawiedliwiona nieobecność trwająca nieprzerwanie dłużej niż miesiąc (trwa po dniu, który datą odpowiada jej pierwszemu dniowi) przedłuża termin oceny o cały swój czas, z mocy prawa i do skutku (przedłużony termin może objąć kolejną). Termin bazowy w `evaluation_stages.base_due_to`, opis w `due_note`; przeliczenie po każdej zmianie nieobecności i terminu bazowego. Nie dotyczy oceny po zmianie terminu decyzją (art. 81 ust. 8).
  - **Decyzje** (`EvaluationTermsController`, panel „Terminy i nieobecności” w ocenie, historia w `evaluation_term_changes`): pierwsza ocena — nowy termin sprawozdania przedłużający dotychczasowy (§ 5 ust. 1–2 rozporządzenia z 2015 r.; podpowiedź: koniec + dni nieobecności w terminie; najpóźniej do końca okresu oceny, § 5 ust. 3) i przedłużenie umowy o czas nieobecności (art. 35 ust. 4; próg: ciągła ponad 3 mies. albo łącznie ponad 90 dni w pierwszych 12 mies. — art. 114 KC), które przesuwa okres oceny na miesiąc przed nowym końcem umowy; ocena okresowa — zmiana terminu z art. 81 ust. 8 (ponad 6 mies. od początku okresu). Zawiadomienia PDF: `GET /api/evaluations/{id}/terms/changes/{changeId}/pdf` (§ 5 ust. 4 / § 8 rozporządzenia z 2016 r.).
- **PDF** (`GET /api/evaluations/{id}/pdf`, `Pdf/EvaluationSheetPdf.cs`): układ urzędowych wzorów — arkusz B/C (zał. nr 3 i 4 do rozporządzenia z 2016 r.) i arkusz pierwszej oceny (zał. nr 2 do rozporządzenia z 2015 r.): te same części i tabele, „X” w polach wyboru, bloki podpisów (miejscowość, data, podpis albo „podpisano w systemie”), pouczenie i przypisy. Część III tylko przy wniosku o kolejny stopień. Wskaźniki, notatki, samoocena i kontekst nie trafiają do PDF.

Terminy:

| Szablon | Etap | Termin |
|---|---|---|
| `first` | rozmowa wstępna | do 21 dni od `start` (data zatrudnienia) |
| | sprawozdanie | od 8 do 10 miesięcy od `start` (v5, § 4 ust. 1; v4: od 7; v1–v3: do 7 miesięcy) — domyślnie, ostatecznie termin wyznacza przełożony na rozmowie wstępnej |
| | pierwsza ocena | od 8 do 11 miesięcy od `start` |
| `periodic-b`/`-c` | kryteria i zapoznanie z nimi | do 30 dni od `start` (sporządzenie poprzedniej oceny na piśmie albo zatrudnienie na czas nieokreślony) |
| | ocena | do 24 miesięcy od `start`; data sporządzenia oceny na piśmie jest `start` kolejnego cyklu |
| | sprzeciw (opcjonalny) | do 7 dni od zapoznania z oceną |

Okres podlegania ocenie (od zapoznania z kryteriami do sporządzenia oceny) to co innego niż 24-miesięczny cykl, więc zwykle jest krótszy, np. 23 miesiące. W arkuszu to pole `evaluationPeriod`, a nie termin etapu.

Liczenie terminów (`EvaluationWorkflow` / `PolishCalendar`):

- **Dni:** bieg od dnia następnego, koniec z upływem ostatniego dnia. 4.09 + 30 dni = 4.10.
- **Miesiące:** ten sam dzień miesiąca, a gdy go brak, ostatni dzień miesiąca (art. 112 KC). 31.07 + 7 mies. = 28/29.02.
- **Koniec terminu w sobotę, niedzielę albo święto** przesuwa się na najbliższy dzień roboczy (art. 115 KC). Święta: 1.01, 6.01, Wielkanoc z poniedziałkiem, 1.05, 3.05, Zielone Świątki, Boże Ciało, 15.08, 1.11, 11.11, 24.12 (od 2025), 25–26.12. Początek okna (np. „od 8. miesiąca”) nie jest przesuwany.
- Terminów nie przedłużają jeszcze nieobecności pracownika.

**Nowe pole w arkuszu** (tabele się nie zmieniają, bo wartości są w `evaluation_answers` po kluczu pola):

1. Skopiuj ostatnią wersję, np. `periodic-c.v1.json` jako `periodic-c.v2.json`, i dopisz pole.
2. W `EvaluationTemplateSeed.cs` dodaj `Load(4, "periodic-c", 2, …, active: true)`, a przy v1 ustaw `active: false`.
3. `dotnet ef migrations add <Nazwa> --project Busola.Database --output-dir Migrations`.

Nie edytuj opublikowanej wersji: trwające oceny wskazują wersję, według której je prowadzono, i zostają na niej. Baza pozwala na najwyżej jedną aktywną wersję na kod. Seed ma Id 1–3, a wiersze dodawane z aplikacji dostają Id od 1000. Błędny szablon wywala budowanie modelu, więc nie trafi do migracji.

## Uprawnienia

Model jak w PIM: ASP.NET Identity + JWT, tabele `permissions` i `role_permissions`, klucze w `Busola.Database/Authorization/Permissions.cs`, a każdy klucz to polityka (`[Authorize(Policy = Permissions.ReadEmployees)]`). Uprawnienia lecą w tokenie jako claim `permission`. Ponad PIM każda rola ma **poziom widoku** (`roles.scope`), który mówi, *czyje* dane obejmują jej uprawnienia.

| Rola | Zakres (`scope`) | Skąd się bierze | Uprawnienia |
|---|---|---|---|
| `Employee` | `Own`: własny rekord | automatycznie, gdy konto ma pracownika | podgląd pracowników |
| `Supervisor` | `Subordinates`: podwładni bezpośredni i pośredni | automatycznie, gdy pracownik ma podwładnych | podgląd pracowników |
| `Hr` | `Service`: służba użytkownika | przypisana | CRUD pracowników, podgląd lokalizacji i wydziałów |
| `ServiceAdmin` | `Service`: służba użytkownika | przypisana | wszystko w swojej służbie, w tym konta i role |
| `SuperAdmin` | `All` | przypisana | omija sprawdzenia (jak `Admin` w PIM) |

- Uprawnienia użytkownika to suma ról, a zakres liczy się per rola. Np. przełożony, który jest też w HR, widzi całą służbę.
- Służba użytkownika wynika z jego wydziału (pracownik → wydział → lokalizacja → służba).
- Struktura organizacyjna (lokalizacje, wydziały) jest widoczna tylko w zakresie `Service` albo `All`.
- Token zawiera role z chwili logowania (ważny 12 h) i `SecurityStamp` konta. API sprawdza stamp przy każdym żądaniu, więc zmiana ról, zmiana hasła i włączenie/wyłączenie/reset 2FA natychmiast unieważniają stare tokeny (użytkownik loguje się ponownie, a przy własnych zmianach API od razu odsyła nowy token).
- `ServiceAdmin` nie może nadać ani odebrać roli o zakresie `All`, a konta bez pracownika zakłada tylko `SuperAdmin`.

Nowe uprawnienie: stała w `Permissions.cs`, wiersz w `PermissionSeed.cs` (kolejne Id), przypisanie do ról, nowa migracja.

## Uruchomienie API

Lokalna baza: `docker compose up -d` w katalogu głównym repo. `appsettings.Development.json` ma pasujący connection string, więc nic nie trzeba ustawiać. Inną bazę ustawisz w user secrets albo w zmiennej `ConnectionStrings__Busola` (działa też format URL `postgresql://user:hasło@host:port/baza`). Migracje wykonują się same przy starcie API.

Sekrety nie są w repo. Lokalnie trzymaj je w user secrets:

```powershell
dotnet user-secrets set "Jwt:Secret" "<losowy ciąg, min. 32 znaki>" --project Busola.Api
```

Pierwsze konto SuperAdmin zakłada się przy starcie, jeśli jest w konfiguracji (hasło: min. 6 znaków, duża i mała litera, cyfra, znak specjalny):

```powershell
dotnet user-secrets set "Seed:SuperAdmin:Email" "admin@example.com" --project Busola.Api
```

```powershell
dotnet user-secrets set "Seed:SuperAdmin:Password" "<hasło>" --project Busola.Api
```

```powershell
dotnet run --project Busola.Api
```

Endpointy (wszystkie poza logowaniem wymagają `Authorization: Bearer <token>`):

| | |
|---|---|
| `POST /api/auth/login` | `{ email, password }` → `{ token }`, przy 2FA `{ requiresTwoFactor: true }` i ponownie z `twoFactorCode` albo `recoveryCode` |
| `GET /api/account` | własne konto: e-mail, pracownik, avatar, stan 2FA |
| `POST /api/account/password` | `{ currentPassword, newPassword }` → nowy token |
| `GET/PUT/DELETE /api/account/avatar` | `PUT` jako multipart z polem `file` |
| `POST /api/account/two-factor/setup`, `…/enable`, `…/disable`, `…/recovery-codes` | konfiguracja 2FA (TOTP) |
| `GET/POST /api/employees`, `GET/PUT/DELETE /api/employees/{id}` | `GET` przyjmuje `page`, `pageSize`. `POST` wymaga `email` i zakłada pracownika razem z kontem i pierwszym cyklem oceny (w jednej transakcji), a odpowiedź zawiera jednorazowo `temporaryPassword` oraz `evaluationId`. `subjectToFirstEvaluation: true` oznacza arkusz pierwszej oceny, `false` ocenę okresową (arkusz B, gdy pracownik ma podwładnych, inaczej C); w obu przypadkach od daty zatrudnienia. `DELETE` usuwa pracownika razem z kontem; jeśli coś na nie wskazuje (oceny, wypełnione pola, podpisy), zwraca 409 i nic nie usuwa |
| `GET /api/employees/{id}/avatar` | zdjęcie widzi ten, kto widzi pracownika |
| `GET/POST /api/locations`, `GET/PUT/DELETE /api/locations/{id}` | |
| `GET/POST /api/departments`, `GET/PUT/DELETE /api/departments/{id}` | `GET` przyjmuje `locationId` |
| `GET/POST /api/users`, `PUT /api/users/{id}/roles` | konta i role |
| `DELETE /api/users/{id}/two-factor` | reset 2FA, gdy ktoś zgubi telefon i kody odzyskiwania |
| `GET /api/evaluation-templates` | aktywne szablony arkuszy |
| `GET/POST /api/evaluations`, `GET /api/evaluations/{id}` | lista / założenie oceny (`{ employeeId, templateCode, startDate? }`, etapy i terminy liczone z szablonu) / karta oceny ze szablonem, etapami, wartościami i podpisami |
| `PUT /api/evaluations/{id}/answers` | `{ answers: [{ fieldKey, itemKey?, valueText?, valueNumber?, valueDate?, valueDateTo? }] }`; wpis bez wartości jest usuwany |
| `POST /api/evaluations/{id}/stages/{stageKey}/complete`, `…/skip` | zamknięcie etapu (`{ completedOn }`): status oceny zmienia się na `completesTo`, a etapy zależne dostają terminy. `skip` tylko dla opcjonalnych |
| `POST /api/evaluations/{id}/signatures`, `GET …/signatures/{signatureId}/image` | podpis pola (`{ fieldKey, signedOn, place?, image? }`, obraz jako PNG/WebP w base64 albo data URL) / obraz podpisu |
| `GET /api/dashboard/deadlines?days=60` | otwarte etapy z terminem w ciągu `days` dni albo po terminie |
| `GET /api/dashboard/without-evaluation` | pracownicy w zakresie bez żadnej otwartej oceny (ich terminów nic nie pilnuje) |

Ciągłość cykli: zamknięcie etapu „Rozmowa oceniająca i sporządzenie oceny” w ocenie okresowej zakłada kolejny cykl od dnia sporządzenia oceny (arkusz B albo C jak wyżej), bez dubli. Po pierwszej ocenie następny cykl zakłada się ręcznie.

Oceny: `read_evaluations` (pracownik: własne, przełożony: podwładni, HR: służba), `add_evaluation` (HR, admin służby), `edit_evaluation` (przełożony, HR, admin służby). Nikt nie zakłada ani nie wypełnia własnej oceny. Pola podpisu ocenianego podpisuje wyłącznie oceniany, a pozostałe osoba z `edit_evaluation` w swoim zakresie. Zamkniętej oceny nie da się edytować; wyjątkiem jest etap opcjonalny (sprzeciw).

## Konto: avatar, hasło, 2FA

- **Avatar** jest w bazie (`user_avatars`), bo dysk kontenera na Renderze jest ulotny. Upload do 2 MB (JPG, PNG, WebP, GIF). Obraz jest dekodowany, obracany według EXIF, zmniejszany do 256 px i kodowany od nowa do WebP. Nie zapisujemy więc nic, co przysłał użytkownik (np. SVG ze skryptem), i znikają metadane, np. GPS ze zdjęć z telefonu. `<img>` nie wysyła tokenu, więc frontend pobiera zdjęcia przez `fetch` i pokazuje jako blob URL.
- **Zmiana hasła** wymaga obecnego hasła i wylogowuje pozostałe sesje.
- **2FA** to TOTP z aplikacji (Microsoft/Google Authenticator) plus 10 jednorazowych kodów odzyskiwania. Kod jest zawsze sprawdzany razem z hasłem w jednym żądaniu: nie ma osobnego kroku „sam kod dla userId”, którym dałoby się pominąć hasło. Wyłączenie 2FA i nowe kody wymagają hasła.
- **Blokada**: 5 nieudanych prób (hasło albo kod) blokuje konto na 5 minut. Poprawne hasło nie zeruje licznika, dopóki nie przejdzie też kod, inaczej kod dałoby się zgadywać bez końca.

Rekord spoza zakresu zwraca 404, a operacja na danych spoza zakresu 403. Naruszenie ograniczeń bazy (duplikat, usuwanie rekordu, na który coś wskazuje) zwraca 409.

Frontend (`npm run dev` w `src/frontend`) przekierowuje `/api` na `http://localhost:5283`.

## Hosting (Render)

`render.yaml` w katalogu głównym: jeden serwis Docker (API serwuje też zbudowany frontend z `wwwroot`) i Postgres, oba w darmowym planie. Na Renderze: **New → Blueprint** → to repo. Render pyta o `Seed__SuperAdmin__Email` i `Seed__SuperAdmin__Password`, a `Jwt__Secret` generuje sam. Darmowy serwis usypia się po ~15 min bez ruchu, a darmowa baza wygasa po 30 dniach.

## PDF

QuestPDF (licencja Community). `Busola.Api/Pdf/PdfReport.cs` daje wspólny układ (A4, nagłówek, numeracja stron) i tabelę. Nowy raport: `PdfReport.Render("Tytuł", c => PdfReport.Table(c, nagłówki, wiersze))` i `File(bytes, "application/pdf", "nazwa.pdf")`.

## Asystent AI

Pływający asystent w prawym dolnym rogu każdego ekranu (front: `src/frontend/src/assistant/AssistantWidget.tsx`), backend: `Busola.Api/Agent`. Model przez OpenRouter: `OpenRouter__ApiKey`, `OpenRouter__Model` (slug z openrouter.ai/models), opcjonalnie `OpenRouter__EmbeddingModel` (domyślnie `openai/text-embedding-3-small`) i `OpenRouter__BaseUrl` (tylko do testów z atrapą). Bez klucza czat zwraca 503, a baza wiedzy działa po słowach.

- `POST /api/agent/chat` `{ messages: [{ role, content }], context: { page, evaluationId?, employeeId?, step? } }` → `{ reply, contextLabel }`. Bezstanowy: klient przysyła rozmowę i to, na co patrzy. `POST /api/agent/context` zwraca samą etykietę („Ocena · Anna Nowak”) do nagłówka okna.
- **Kontekst ekranu** (`ScreenContext.cs`): front przysyła tylko identyfikatory, a backend dociąga dane encji tymi samymi zakresami uprawnień co kontrolery (`AccessScopeService` + `InScope`). Encja spoza zakresu = informacja „brak dostępu, nie podawaj szczegółów”. Z kartoteki idą tylko dane służbowe (stanowisko, komórka, przełożony, oceny), bez adresu, rodziny itd. Uwaga: ten kontekst trafia do dostawcy modelu (OpenRouter).
- **Baza wiedzy (RAG)**: pliki `*.md` w `Busola.Api/Agent/Knowledge`: rozporządzenia o ocenie okresowej (2016) i pierwszej ocenie (2015), ustawa o służbie cywilnej (tekst jednolity z ELI Sejmu) i Q&A zespołu. Cięte po nagłówkach (`## Rozdział`, `### § 5` / `### Art. 81`, długie artykuły na okna ~2000 znaków). `KnowledgeIndexer` po starcie liczy embeddingi tylko dla nowych/zmienionych fragmentów (klucz: SHA-256 treści + model) i trzyma je w tabeli `knowledge_embeddings`; wyszukiwanie: podobieństwo cosinusowe w pamięci. Nowy dokument = nowy plik `.md` + restart.
- **Narzędzia**: `search_knowledge` (przepisy), `team_overview` (podwładni i najbliższe etapy ocen), `list_employees`. Narzędzie z `RequiredPermission` model dostaje tylko, gdy użytkownik ma to uprawnienie. Nowe narzędzie: klasa `IAgentTool` + linia `AddScoped<IAgentTool, ...>()` w `AgentServiceCollectionExtensions`.
- **Prompt systemowy**: `AgentPrompt.cs`. **Inny dostawca**: implementacje `ILlmClient` / `IEmbeddingClient`.
- **Przeciw halucynacjom**: przed każdą odpowiedzią backend sam dobiera 6 fragmentów przepisów do pytania i dokłada je modelowi jako `<przepisy>` (nie czeka, aż model zechce szukać); temperatura 0; prompt każe odpowiadać tylko z materiału, cytować § / art. i mówić „nie znajduję tego”. Po odpowiedzi `AgentGuard.FlagUnverifiedCitations` sprawdza każdy cytowany § / art. z tym, co model dostał, i dopisuje ostrzeżenie przy numerach spoza materiału.
- **Przeciw obchodzeniu zasad (jailbreak)**: dane i uprawnienia egzekwuje serwer, nie model (kontekst ekranu i narzędzia filtrują zakresem użytkownika). Odpowiedzi asystenta są podpisane HMAC-em (sekret JWT + id użytkownika), a historia z niepodpisaną albo zmienioną odpowiedzią jest odrzucana — nie da się podrzucić modelowi „już się zgodziłem”. Klient nie wysyła roli `system`; pytanie ≤ 2000 znaków, rozmowa ≤ 20 wiadomości; limit 20 zapytań/min na użytkownika (429). Treść przepisów, ekranu i narzędzi jest oznaczona jako dane, nie polecenia. Odpowiedź z fragmentem promptu systemowego (znacznik `AgentGuard.Canary`) jest zamieniana na odmowę. Front renderuje odpowiedź jako tekst (bez HTML-a, linków i obrazków), więc model nie wyniesie danych przez URL.

## Podpisy odręczne (demo)

Podpis jest częścią flow oceny, bez osobnej zakładki. Na karcie oceny przy polu podpisu: „Podpisz na telefonie lub tablecie” pokazuje kod QR (telefon) i link „Podpisz na tym urządzeniu” (ekran dotykowy). Sygnatariusz otwiera `/podpis/{token}` bez logowania i podpisuje palcem, rysikiem albo myszą; karta oceny odświeża się sama po podpisaniu. Docelowo zastąpione dostawcą (np. Autenti).

- `POST /api/signatures` `{ title, signerName, evaluationId, evaluationFieldKey }`, `GET /api/signatures/{id}` (status), `GET /api/signatures/{id}/image` (PNG). Ponowne zlecenie tego samego pola daje nowy link do czekającej prośby (stary przestaje działać).
- Publiczne, tylko z tokenem: `GET /api/sign/{token}`, `POST /api/sign/{token}` `{ image: "data:image/png;base64,..." }`, `POST /api/sign/{token}/decline`.
- Po podpisaniu w tej samej transakcji powstaje wiersz `evaluation_signatures` z obrazem PNG i SHA-256; konto potwierdzające (`signed_by_id`) to zlecający, czyli osoba, która zebrała podpis. Zasady jak przy podpisie w systemie (`EvaluationsController.Sign`): pole ocenianego zleca tylko sam oceniany, pozostałe osoba z `edit_evaluation` w swoim zakresie, ale nie oceniany. Odrzucane: pole spoza szablonu (400), zamknięta ocena albo pole już podpisane (409); zamknięcie oceny unieważnia czekające linki.
- Link ważny 24 h, w bazie jest tylko hash tokenu. Podpis jest dekodowany i kodowany od nowa (SkiaSharp), zapisujemy IP i User-Agent podpisującego.
- **Zakładka Dev** (tylko SuperAdmin): ten sam flow w pamięci serwera, bez zapisu w bazie. API `api/dev/signatures` i publiczne `api/dev/sign/{token}`, strona `/podpis-test/{token}` z oznaczeniem trybu testowego. Testy znikają po godzinie albo po restarcie (najwyżej 200 naraz).

## Profil pracownika

Układ jak w OrangeHRM: zdjęcie i zakładki po lewej, sekcja po prawej. Zakładki: dane osobowe, kontakt, kontakty alarmowe, członkowie rodziny, zatrudnienie, struktura (drzewko przełożonych), oceny (historia z `GET /api/evaluations?employeeId=`, w zakresie `read_evaluations`, więc przełożony widzi oceny podwładnych), kwalifikacje; we własnym profilu także konto (zdjęcie, hasło, 2FA). Menu pod loginem: „Mój profil”, „Struktura” (własny profil na zakładce Struktura), „Wyloguj”. Konto bez pracownika (np. SuperAdmin) zamiast profilu widzi same ustawienia konta (doświadczenie, wykształcenie, umiejętności, języki). Bez wynagrodzenia i danych imigracyjnych.

- Dane w `employee_profiles` (1:1 z `employees`), listy w jsonb. Imię, nazwisko, daty, wydział i przełożony zostają w `employees`.
- `GET /api/employees/{id}/profile`, `GET /api/employees/me/profile`, `PUT /api/employees/{id}/profile/{personal|contact|job|emergency-contacts|dependents|qualifications}`.
- Odczyt: `read_employees` w zakresie albo własny rekord. Edycja: `edit_employee` w zakresie — wszystko; pracownik u siebie — wszystko poza zatrudnieniem, imieniem, nazwiskiem, datą urodzenia i nr. ewidencyjnym.

## Drzewko przełożonych

Zakładka **Struktura** w profilu (własna: menu pod loginem → „Struktura”): łańcuch przełożonych w górę, wybrana osoba i jej podwładni; kliknięcie karty przenosi widok na tę osobę. `GET /api/org?employeeId=` (domyślnie ja), `GET /api/org/{id}/avatar`. Każdy widzi tylko osoby ze swojej służby (SuperAdmin wszystkich), a karta ma tylko imię i nazwisko, stanowisko i komórkę.

## Migracje

Narzędzie `dotnet-ef` jest w lokalnym manifeście, więc najpierw (jednorazowo):

```powershell
dotnet tool restore
```

Connection string bierzemy ze zmiennej `BUSOLA_CONNECTION_STRING`. Domyślnie: `Host=localhost;Port=5432;Database=busola;Username=postgres;Password=postgres`.

```powershell
dotnet ef database update --project Busola.Database
```

```powershell
dotnet ef migrations add <Nazwa> --project Busola.Database --output-dir Migrations
```
