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
