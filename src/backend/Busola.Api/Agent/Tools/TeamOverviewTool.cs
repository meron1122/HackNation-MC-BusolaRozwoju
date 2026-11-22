using System.Security.Claims;
using System.Text.Json;
using Busola.Api.Authorization;
using Busola.Api.Evaluations;
using Busola.Database;
using Busola.Database.Authorization;
using Microsoft.EntityFrameworkCore;

namespace Busola.Api.Agent.Tools;

/// <summary>Podwładni użytkownika z bieżącym etapem oceny i terminem — do pytań „co mnie czeka w zespole”.</summary>
public sealed class TeamOverviewTool(BusolaDbContext db, AccessScopeService access, IHttpContextAccessor http, TimeProvider time) : IAgentTool
{
    public string Name => "team_overview";

    public string Description =>
        "Bezpośredni podwładni użytkownika: stanowisko, bieżąca ocena, etap, termin i czy jest po terminie. "
        + "Użyj przy pytaniach o zespół, najbliższe etapy i terminy podwładnych.";

    public string Parameters => """{ "type": "object", "properties": {} }""";

    public string? RequiredPermission => Permissions.ReadEvaluations;

    public async Task<string> ExecuteAsync(JsonElement arguments, CancellationToken ct)
    {
        var userId = http.HttpContext!.User.FindFirstValue(BusolaClaims.UserId);
        var me = await db.Users.Where(u => u.Id == userId).Select(u => u.EmployeeId).SingleOrDefaultAsync(ct);
        if (me is null)
        {
            return "Konto nie jest powiązane z pracownikiem, więc nie ma zespołu.";
        }

        var scope = await access.ResolveAsync(Permissions.ReadEvaluations, ct);
        var team = db.Employees.Where(e => e.SupervisorId == me).InScope(scope);
        var people = await team
            .OrderBy(e => e.LastName).ThenBy(e => e.FirstName)
            .Select(e => new { e.Id, Name = e.FirstName + " " + e.LastName, Position = e.Position != null ? e.Position.Name : null })
            .ToListAsync(ct);
        var ids = people.Select(p => p.Id).ToList();
        var today = DateOnly.FromDateTime(time.GetLocalNow().DateTime);
        var evaluations = (await EvaluationProgress.LoadAsync(db, db.Evaluations.Where(e => ids.Contains(e.EmployeeId)), today, ct))
            .Where(r => !r.Progress.IsFinal)
            .ToLookup(r => r.EmployeeId);

        return JsonSerializer.Serialize(people.Select(p => new
        {
            p.Name,
            p.Position,
            Evaluations = evaluations[p.Id].Select(r => new
            {
                r.TemplateTitle,
                r.Progress.Phase,
                Stage = r.Progress.StageTitle,
                r.Progress.DueTo,
                r.Progress.DaysLeft,
                r.Progress.Overdue,
            }),
        }));
    }
}
