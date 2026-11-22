using System.Security.Claims;
using System.Text;
using Busola.Api.Authorization;
using Busola.Api.Evaluations;
using Busola.Database;
using Busola.Database.Authorization;
using Busola.Database.Entities;
using Microsoft.EntityFrameworkCore;

namespace Busola.Api.Agent;

/// <summary>
/// Co użytkownik ma na ekranie: strona, krok kreatora i identyfikatory encji. Front przysyła tylko identyfikatory —
/// dane dociąga backend z tymi samymi zakresami uprawnień co kontrolery, więc asystent nie widzi więcej niż użytkownik.
/// </summary>
public sealed record ScreenContext(string? Page = null, int? EvaluationId = null, int? EmployeeId = null, string? Step = null);

/// <param name="Label">Krótko dla użytkownika: „Ocena · Anna Nowak”.</param>
/// <param name="Prompt">Opis dla modelu (dane, nie polecenia).</param>
public sealed record ScreenDescription(string Label, string Prompt);

public sealed class ScreenContextService(
    BusolaDbContext db, AccessScopeService access, IHttpContextAccessor httpContextAccessor, TimeProvider time)
{
    private static readonly Dictionary<string, string> Pages = new()
    {
        ["dashboard"] = "Pulpit przełożonego (najbliższe terminy zespołu)",
        ["team"] = "Mój zespół (podwładni i ich oceny)",
        ["hr"] = "Panel HR (oceny w urzędzie, zagrożone terminy)",
        ["my"] = "Moja ocena (ocena zalogowanego pracownika)",
        ["deadlines"] = "Terminy (kalendarz etapów ocen)",
        ["evaluations"] = "Oceny (lista ocen)",
        ["employees"] = "Pracownicy (kartoteka)",
        ["absences"] = "Nieobecności",
        ["departments"] = "Wydziały",
        ["positions"] = "Stanowiska",
        ["locations"] = "Lokalizacje",
        ["services"] = "Służby",
        ["users"] = "Konta użytkowników",
        ["profile"] = "Profil pracownika",
        ["my-profile"] = "Mój profil",
    };

    private ClaimsPrincipal User => httpContextAccessor.HttpContext!.User;

    public async Task<ScreenDescription> DescribeAsync(ScreenContext? screen, CancellationToken ct)
    {
        var page = screen?.EvaluationId is not null ? "Ocena pracownika (kreator oceny)"
            : screen?.Page is { } key ? Pages.GetValueOrDefault(key, key) : "nieznany ekran";
        var label = page.Split(" (")[0];
        var prompt = new StringBuilder($"Ekran: {page}.");
        if (screen?.Step is { Length: > 0 } step)
        {
            prompt.Append($" Krok kreatora oceny: {step}.");
        }

        var myEmployeeId = await db.Users
            .Where(u => u.Id == User.FindFirstValue(BusolaClaims.UserId))
            .Select(u => u.EmployeeId)
            .SingleOrDefaultAsync(ct);

        if (screen?.EvaluationId is { } evaluationId)
        {
            var (name, text) = await DescribeEvaluationAsync(evaluationId, myEmployeeId, ct);
            label = name is null ? "Ocena" : $"Ocena · {name}";
            prompt.Append('\n').Append(text);
        }
        else if (screen?.EmployeeId is { } employeeId)
        {
            var (name, text) = await DescribeEmployeeAsync(employeeId, myEmployeeId, ct);
            label = name is null ? label : $"{label} · {name}";
            prompt.Append('\n').Append(text);
        }
        else if (screen?.Page == "my-profile" && myEmployeeId is { } me)
        {
            prompt.Append('\n').Append((await DescribeEmployeeAsync(me, myEmployeeId, ct)).Text);
        }

        prompt.Append('\n').Append(Tours.Describe(screen));
        return new ScreenDescription(label, prompt.ToString());
    }

    private async Task<(string? Name, string Text)> DescribeEvaluationAsync(int id, int? myEmployeeId, CancellationToken ct)
    {
        if (!User.HasPermission(Permissions.ReadEvaluations))
        {
            return (null, "Na ekranie jest ocena, ale użytkownik nie ma uprawnienia do odczytu ocen.");
        }

        var scope = await access.ResolveAsync(Permissions.ReadEvaluations, ct);
        var query = scope.All
            ? db.Evaluations
            : db.Evaluations.Where(e => db.Employees.InScope(scope).Select(x => x.Id).Contains(e.EmployeeId));
        var row = (await EvaluationProgress.LoadAsync(db, query.Where(e => e.Id == id), Today, ct)).SingleOrDefault();
        if (row is null)
        {
            return (null, "Na ekranie jest ocena, do której użytkownik nie ma dostępu — nie podawaj o niej szczegółów.");
        }

        var info = await db.Evaluations
            .Where(e => e.Id == id)
            .Select(e => new
            {
                e.Employee.FirstName,
                e.Employee.LastName,
                Position = e.Employee.Position != null ? e.Employee.Position.Name : null,
                Department = e.Employee.Department.Name,
                e.Employee.HireDate,
                Evaluator = e.Evaluator != null ? e.Evaluator.FirstName + " " + e.Evaluator.LastName : null,
                Stages = e.Stages.OrderBy(s => s.DueTo).Select(s => new { s.StageKey, s.Status, s.DueFrom, s.DueTo, s.CompletedOn }).ToList(),
            })
            .SingleAsync(ct);
        var schema = (await EvaluationWorkflow.LoadSchemasAsync(db, [row.TemplateId], ct))[row.TemplateId];
        var titles = schema.Stages.ToDictionary(s => s.Key, s => s.Title);
        var p = row.Progress;
        var name = $"{info.FirstName} {info.LastName}";
        var who = row.EmployeeId == myEmployeeId ? " (to ocena samego użytkownika)" : "";

        var text = new StringBuilder()
            .AppendLine($"Oceniany: {name}{who}; stanowisko: {info.Position ?? "brak"}; komórka: {info.Department}; zatrudniony od {info.HireDate:dd.MM.yyyy}.")
            .AppendLine($"Ocena: {row.TemplateTitle}; początek cyklu {row.StartDate:dd.MM.yyyy}; oceniający: {info.Evaluator ?? "bezpośredni przełożony"}.")
            .AppendLine($"Faza: {p.Phase}{(p.IsFinal ? " (zamknięta)" : "")}; bieżący etap: {p.StageTitle ?? "—"}"
                + (p.DueTo is { } due ? $", termin {due:dd.MM.yyyy} ({(p.Overdue ? $"{-p.DaysLeft} dni po terminie" : $"zostało {p.DaysLeft} dni")})" : "") + ".")
            .AppendLine("Etapy:");
        foreach (var s in info.Stages)
        {
            var range = s.DueTo is null ? "termin wyznaczy poprzedni etap"
                : s.DueFrom is { } from ? $"{from:dd.MM.yyyy}–{s.DueTo:dd.MM.yyyy}" : $"do {s.DueTo:dd.MM.yyyy}";
            var done = s.CompletedOn is { } c ? $", zakończony {c:dd.MM.yyyy}" : "";
            text.AppendLine($"- {titles.GetValueOrDefault(s.StageKey, s.StageKey)}: {StageLabel(s.Status)}, {range}{done}");
        }

        return (name, text.ToString().TrimEnd());
    }

    private async Task<(string? Name, string Text)> DescribeEmployeeAsync(int id, int? myEmployeeId, CancellationToken ct)
    {
        var employees = db.Employees.Where(e => e.Id == id);
        if (id != myEmployeeId)
        {
            if (!User.HasPermission(Permissions.ReadEmployees))
            {
                return (null, "Na ekranie jest pracownik, ale użytkownik nie ma uprawnienia do kartoteki.");
            }

            employees = employees.InScope(await access.ResolveAsync(Permissions.ReadEmployees, ct));
        }

        // Tylko dane służbowe: bez adresu, rodziny, PESEL — asystentowi wystarczy, kim ktoś jest w strukturze.
        var e = await employees
            .Select(x => new
            {
                x.FirstName,
                x.LastName,
                Position = x.Position != null ? x.Position.Name : null,
                Department = x.Department.Name,
                Service = x.Department.Location.Service.Name,
                x.HireDate,
                x.SubjectToFirstEvaluation,
                Supervisor = x.Supervisor != null ? x.Supervisor.FirstName + " " + x.Supervisor.LastName : null,
                Subordinates = x.Subordinates.Count,
            })
            .SingleOrDefaultAsync(ct);
        if (e is null)
        {
            return (null, "Na ekranie jest pracownik spoza zakresu uprawnień użytkownika — nie podawaj o nim szczegółów.");
        }

        var name = $"{e.FirstName} {e.LastName}";
        var text = new StringBuilder()
            .AppendLine($"Pracownik: {name}{(id == myEmployeeId ? " (sam użytkownik)" : "")}; stanowisko: {e.Position ?? "brak"}; komórka: {e.Department}; służba: {e.Service}.")
            .AppendLine($"Zatrudniony od {e.HireDate:dd.MM.yyyy}{(e.SubjectToFirstEvaluation ? ", podlega pierwszej ocenie" : "")}; przełożony: {e.Supervisor ?? "brak"}; podwładnych: {e.Subordinates}.");

        if (User.HasPermission(Permissions.ReadEvaluations))
        {
            var scope = await access.ResolveAsync(Permissions.ReadEvaluations, ct);
            var visible = scope.All ? db.Evaluations : db.Evaluations.Where(x => db.Employees.InScope(scope).Select(y => y.Id).Contains(x.EmployeeId));
            foreach (var r in (await EvaluationProgress.LoadAsync(db, visible.Where(x => x.EmployeeId == id), Today, ct)).OrderByDescending(r => r.StartDate))
            {
                var p = r.Progress;
                text.AppendLine($"Ocena: {r.TemplateTitle} od {r.StartDate:dd.MM.yyyy} — {p.Phase}"
                    + (p.StageTitle is null ? "" : $", etap: {p.StageTitle}")
                    + (p.DueTo is { } due ? $", termin {due:dd.MM.yyyy}{(p.Overdue ? " (po terminie)" : "")}" : "") + ".");
            }
        }

        return (name, text.ToString().TrimEnd());
    }

    private DateOnly Today => DateOnly.FromDateTime(time.GetLocalNow().DateTime);

    private static string StageLabel(StageStatus status) => status switch
    {
        StageStatus.Pending => "do zrobienia",
        StageStatus.Completed => "zrobiony",
        _ => "pominięty",
    };
}
