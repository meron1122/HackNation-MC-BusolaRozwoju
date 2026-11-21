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
