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

Terminy:

| Szablon | Etap | Termin |
|---|---|---|
| `first` | rozmowa wstępna | do 21 dni od `start` (data zatrudnienia) |
| | sprawozdanie | do 7 miesięcy od `start` |
| | pierwsza ocena | od 8 do 11 miesięcy od `start` |
| `periodic-b`/`-c` | kryteria i zapoznanie z nimi | do 30 dni od `start` (sporządzenie poprzedniej oceny na piśmie albo zatrudnienie na czas nieokreślony) |
| | ocena | do 24 miesięcy od `start`; data sporządzenia oceny na piśmie jest `start` kolejnego cyklu |
| | sprzeciw (opcjonalny) | do 7 dni od zapoznania z oceną |

Okres podlegania ocenie (od zapoznania z kryteriami do sporządzenia oceny) to co innego niż 24-miesięczny cykl, więc zwykle jest krótszy, np. 23 miesiące. W arkuszu to pole `evaluationPeriod`, a nie termin etapu.

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
| `GET/POST /api/employees`, `GET/PUT/DELETE /api/employees/{id}` | `GET` przyjmuje `page`, `pageSize` |
| `GET /api/employees/{id}/avatar` | zdjęcie widzi ten, kto widzi pracownika |
| `GET/POST /api/locations`, `GET/PUT/DELETE /api/locations/{id}` | |
| `GET/POST /api/departments`, `GET/PUT/DELETE /api/departments/{id}` | `GET` przyjmuje `locationId` |
| `GET/POST /api/users`, `PUT /api/users/{id}/roles` | konta i role |
| `DELETE /api/users/{id}/two-factor` | reset 2FA, gdy ktoś zgubi telefon i kody odzyskiwania |

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

## Agent AI (harness)

`Busola.Api/Agent`: szkielet agenta, bez gotowej logiki biznesowej. LLM przez OpenRouter (`OpenRouter__ApiKey`, `OpenRouter__Model`, slug z openrouter.ai/models). Bez klucza endpoint zwraca 503.

- `POST /api/agent/chat` `{ messages: [{ role: "user"|"assistant", content }] }` zwraca `{ reply }`. Bezstanowy: klient przysyła całą rozmowę.
- **Uprawnienia**: agent działa w żądaniu zalogowanego użytkownika. Narzędzie z `RequiredPermission` jest pokazywane modelowi tylko, gdy użytkownik ma to uprawnienie, a dane filtruje tak jak kontrolery (`AccessScopeService` + `InScope`). Wzór: `Tools/ListEmployeesTool.cs`.
- **Nowe narzędzie**: klasa implementująca `IAgentTool` (nazwa, opis, JSON Schema argumentów, uprawnienie, `ExecuteAsync`) i jedna linia `AddScoped<IAgentTool, ...>()` w `AgentServiceCollectionExtensions`.
- **Baza wiedzy (RAG)**: pliki `*.md` w `Busola.Api/Agent/Knowledge` (np. opis flow raportów), cięte po nagłówkach i przeszukiwane narzędziem `search_knowledge`. Wyszukiwanie po słowach. Na embeddingi podmienia się implementację `IKnowledgeBase`.
- **Inny dostawca LLM**: implementacja `ILlmClient` i podmiana rejestracji w `AddAgent`.
- **Prompt systemowy**: `AgentPrompt.cs`.

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
