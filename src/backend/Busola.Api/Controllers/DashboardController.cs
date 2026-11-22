using System.Security.Claims;
using Busola.Api.Authorization;
using Busola.Api.Evaluations;
using Busola.Api.Models;
using Busola.Database;
using Busola.Database.Authorization;
using Busola.Database.Entities;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Busola.Api.Controllers;

[ApiController]
[Route("api/dashboard")]
public sealed class DashboardController(BusolaDbContext db, AccessScopeService access) : ControllerBase
{
    /// <summary>Pracownicy w zakresie, którzy nie mają żadnej otwartej (niezamkniętej) oceny.</summary>
    [HttpGet("without-evaluation")]
    [Authorize(Policy = Permissions.ReadEvaluations)]
    public async Task<IReadOnlyList<EmployeeWithoutEvaluationDto>> WithoutEvaluation(CancellationToken ct)
    {
        var scope = await access.ResolveAsync(Permissions.ReadEvaluations, ct);
        var employees = await db.Employees
            .InScope(scope)
            .OrderBy(e => e.LastName).ThenBy(e => e.FirstName)
            .Select(e => new EmployeeWithoutEvaluationDto(e.Id, e.LastName + " " + e.FirstName, e.HireDate, e.SubjectToFirstEvaluation))
            .ToListAsync(ct);

        var ids = employees.Select(e => e.EmployeeId).ToList();
        var evaluations = await db.Evaluations
            .Where(e => ids.Contains(e.EmployeeId))
            .Select(e => new { e.EmployeeId, e.TemplateId, e.Status })
            .ToListAsync(ct);

        // Statusy końcowe są w szablonach (jsonb), więc „otwarta” liczymy w pamięci.
        var schemas = await EvaluationWorkflow.LoadSchemasAsync(db, evaluations.Select(e => e.TemplateId), ct);
        var withOpen = evaluations
            .Where(e => !EvaluationWorkflow.IsFinal(schemas[e.TemplateId], e.Status))
            .Select(e => e.EmployeeId)
            .ToHashSet();

        return employees.Where(e => !withOpen.Contains(e.EmployeeId)).ToList();
    }

    /// <summary>
    /// Pulpit przełożonego (W01): bezpośredni podwładni z fazą oceny, terminem etapu w toku, „wymaga uwagi”
    /// (po terminie / termin w ciągu `days` dni / zapoznanie do zrobienia niezwłocznie) i ostatnim przypomnieniem HR.
    /// </summary>
    [HttpGet("team")]
    [Authorize(Policy = Permissions.ReadEvaluations)]
    public async Task<ActionResult<TeamDashboardDto>> Team(int days = 14, CancellationToken ct = default)
    {
        var userId = User.FindFirstValue(BusolaClaims.UserId);
        var me = await db.Users
            .Where(u => u.Id == userId && u.Employee != null)
            .Select(u => new { u.Employee!.Id, DepartmentName = u.Employee.Department.Name })
            .SingleOrDefaultAsync(ct);
        if (me is null)
        {
            return new TeamDashboardDto(null, 0, []);
        }

        var members = await db.Employees
            .Where(e => e.SupervisorId == me.Id)
            .OrderBy(e => e.LastName).ThenBy(e => e.FirstName)
            .Select(e => new { e.Id, e.FirstName, e.LastName, PositionName = e.Position != null ? e.Position.Name : null })
            .ToListAsync(ct);
        var ids = members.Select(m => m.Id).ToList();

        // Najpilniejsza otwarta ocena (po sporządzeniu oceny są dwie: zapoznanie ze starą i nowy cykl — zapoznanie
        // nie może zniknąć z „wymaga uwagi”), a gdy otwartej brak — ostatnia zamknięta.
        var rows = await EvaluationProgress.LoadAsync(db, db.Evaluations.Where(e => ids.Contains(e.EmployeeId)), Today, ct);
        var byEmployee = rows
            .GroupBy(r => r.EmployeeId)
            .ToDictionary(g => g.Key, g =>
            {
                var open = g.Where(r => !r.Progress.IsFinal).ToList();
                return open.Count == 0
                    ? g.MaxBy(r => r.EvaluationId)!.Progress
                    : open
                        .OrderByDescending(r => EvaluationProgress.NeedsAttention(r.Progress, days))
                        .ThenBy(r => r.Progress.DueTo ?? DateOnly.MaxValue)
                        .ThenBy(r => r.EvaluationId)
                        .First().Progress;
            });

        var result = members.Select(m =>
        {
            var progress = byEmployee.GetValueOrDefault(m.Id);
            return new TeamMemberDto(m.Id, m.FirstName, m.LastName,
                progress is not null && EvaluationProgress.NeedsAttention(progress, days), progress, m.PositionName);
        }).ToList();

        return new TeamDashboardDto(me.DepartmentName, result.Count, result);
    }

    /// <summary>
    /// Panel HR (W14): otwarte oceny w zakresie (HR — służba) z oceniającym, wydziałem, ścieżką i etapem w toku,
    /// plus liczniki: po terminie, termin w 7 dni, w toku, zamknięte w roku `year` (domyślnie bieżący).
    /// Filtry (ścieżka, etap, wydział, tylko zagrożone) robi front na wierszach.
    /// </summary>
    [HttpGet("hr")]
    [Authorize(Policy = Permissions.ReadEvaluations)]
    public async Task<HrDashboardDto> Hr(int? year, CancellationToken ct)
    {
        var scope = await access.ResolveAsync(Permissions.ReadEvaluations, ct);
        var today = Today;
        var reportYear = year ?? today.Year;

        var evaluations = db.Evaluations.AsQueryable();
        if (!scope.All)
        {
            var employeeIds = db.Employees.InScope(scope).Select(e => e.Id);
            evaluations = evaluations.Where(e => employeeIds.Contains(e.EmployeeId));
        }

        var rows = await EvaluationProgress.LoadAsync(db, evaluations, today, ct);
        var open = rows.Where(r => !r.Progress.IsFinal).ToList();

        var openIds = open.Select(r => r.EvaluationId).ToList();
        var people = await db.Evaluations
            .Where(e => openIds.Contains(e.Id))
            .Select(e => new
            {
                e.Id,
                EvaluatorName = e.Evaluator != null
                    ? e.Evaluator.FirstName + " " + e.Evaluator.LastName
                    : e.Employee.Supervisor != null ? e.Employee.Supervisor.FirstName + " " + e.Employee.Supervisor.LastName : null,
                e.Employee.DepartmentId,
                DepartmentName = e.Employee.Department.Name,
            })
            .ToDictionaryAsync(e => e.Id, ct);

        // Zamknięte w roku: ocena w statusie końcowym (bez anulowanych), data = ostatnie zamknięcie etapu.
        var closedIds = rows.Where(r => r.Progress.IsFinal && r.Status != "cancelled").Select(r => r.EvaluationId).ToList();
        var closedInYear = await db.EvaluationStages
            .Where(s => closedIds.Contains(s.EvaluationId) && s.CompletedOn != null)
            .GroupBy(s => s.EvaluationId)
            .CountAsync(g => g.Max(s => s.CompletedOn)!.Value.Year == reportYear, ct);

        var result = open
            .Select(r =>
            {
                var p = r.Progress;
                var person = people[r.EvaluationId];
                return new HrEvaluationRowDto(r.EmployeeId, r.EmployeeName, person.EvaluatorName, person.DepartmentId, person.DepartmentName,
                    p.Overdue || p.DaysLeft <= 7, p);
            })
            .OrderBy(r => r.Evaluation.DueTo ?? DateOnly.MaxValue)
            .ToList();

        return new HrDashboardDto(
            new HrCountersDto(
                result.Count(r => r.Evaluation.Overdue),
                result.Count(r => r.Evaluation.DaysLeft is >= 0 and <= 7),
                result.Count,
                closedInYear,
                reportYear),
            result);
    }

    private static DateOnly Today => DateOnly.FromDateTime(DateTime.Today);

    /// <summary>Otwarte etapy ocen w zakresie użytkownika z terminem w ciągu `days` dni albo już po terminie.</summary>
    [HttpGet("deadlines")]
    [Authorize(Policy = Permissions.ReadEvaluations)]
    public async Task<IReadOnlyList<DeadlineDto>> Deadlines(int days = 60, CancellationToken ct = default)
    {
        var scope = await access.ResolveAsync(Permissions.ReadEvaluations, ct);
        var today = DateOnly.FromDateTime(DateTime.Today);
        var until = today.AddDays(Math.Clamp(days, 1, 730));

        var stages = db.EvaluationStages.Where(s => s.Status == StageStatus.Pending && s.DueTo != null && s.DueTo <= until);
        if (!scope.All)
        {
            var employeeIds = db.Employees.InScope(scope).Select(e => e.Id);
            stages = stages.Where(s => employeeIds.Contains(s.Evaluation.EmployeeId));
        }

        var rows = await stages
            .OrderBy(s => s.DueTo)
            .Select(s => new
            {
                s.EvaluationId,
                s.Evaluation.EmployeeId,
                EmployeeName = s.Evaluation.Employee.LastName + " " + s.Evaluation.Employee.FirstName,
                s.Evaluation.TemplateId,
                TemplateTitle = s.Evaluation.Template.Title,
                EvaluationStatus = s.Evaluation.Status,
                s.StageKey,
                s.DueFrom,
                DueTo = s.DueTo!.Value,
            })
            .ToListAsync(ct);

        // Statusy końcowe są w szablonach (jsonb), więc odsiewamy zamknięte oceny już w pamięci.
        var schemas = await EvaluationWorkflow.LoadSchemasAsync(db, rows.Select(r => r.TemplateId), ct);
        return rows
            .Where(r => !EvaluationWorkflow.IsFinal(schemas[r.TemplateId], r.EvaluationStatus))
            .Select(r => new DeadlineDto(
                r.EvaluationId, r.EmployeeId, r.EmployeeName, r.TemplateTitle, r.StageKey,
                EvaluationWorkflow.StageTitle(schemas[r.TemplateId], r.StageKey),
                r.DueFrom, r.DueTo, r.DueTo.DayNumber - today.DayNumber, r.DueTo < today))
            .ToList();
    }
}
