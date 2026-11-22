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

/// <summary>
/// Nieobecności pracownika (profil → Nieobecności). Odczyt: read_employees w zakresie (pracownik widzi swoje);
/// zmiany: edit_employee w zakresie (kadry). Po każdej zmianie przeliczają się terminy otwartych ocen okresowych
/// (art. 81 ust. 7 ustawy); przy pierwszej ocenie nieobecności są podstawą decyzji przełożonego (§ 5 rozporządzenia z 2015 r.).
/// </summary>
[ApiController]
[Route("api/employees/{employeeId:int}/absences")]
public sealed class AbsencesController(BusolaDbContext db, AccessScopeService access) : ControllerBase
{
    [HttpGet("/api/absence-reasons")]
    [Authorize(Policy = Permissions.ReadEmployees)]
    public async Task<IReadOnlyList<AbsenceReasonDto>> GetReasons(CancellationToken ct) =>
        await db.AbsenceReasons.OrderBy(r => r.Id).Select(r => new AbsenceReasonDto(r.Id, r.Name, r.Kind.ToString())).ToListAsync(ct);

    [HttpGet]
    [Authorize(Policy = Permissions.ReadEmployees)]
    public async Task<ActionResult<IReadOnlyList<AbsenceDto>>> GetAll(int employeeId, CancellationToken ct)
    {
        if (!await InScopeAsync(Permissions.ReadEmployees, employeeId, ct))
        {
            return NotFound();
        }

        return await db.Absences
            .Where(a => a.EmployeeId == employeeId)
            .OrderByDescending(a => a.StartDate)
            .Select(Projection)
            .ToListAsync(ct);
    }

    [HttpPost]
    [Authorize(Policy = Permissions.EditEmployee)]
    public async Task<ActionResult<AbsenceDto>> Create(int employeeId, AbsenceRequest request, CancellationToken ct)
    {
        if (!await InScopeAsync(Permissions.EditEmployee, employeeId, ct))
        {
            return NotFound();
        }

        if (await ValidateAsync(request, ct) is { } problem)
        {
            return problem;
        }

        var absence = new Absence { EmployeeId = employeeId, StartDate = request.StartDate, EndDate = request.EndDate, ReasonId = request.ReasonId };
        db.Absences.Add(absence);
        await db.SaveChangesAsync(ct);
        await AbsenceDeadlines.RecalculateAsync(db, employeeId, ct);

        return await db.Absences.Where(a => a.Id == absence.Id).Select(Projection).SingleAsync(ct);
    }

    [HttpPut("{id:int}")]
    [Authorize(Policy = Permissions.EditEmployee)]
    public async Task<ActionResult<AbsenceDto>> Update(int employeeId, int id, AbsenceRequest request, CancellationToken ct)
    {
        if (!await InScopeAsync(Permissions.EditEmployee, employeeId, ct))
        {
            return NotFound();
        }

        var absence = await db.Absences.SingleOrDefaultAsync(a => a.Id == id && a.EmployeeId == employeeId, ct);
        if (absence is null)
        {
            return NotFound();
        }

        if (await ValidateAsync(request, ct) is { } problem)
        {
            return problem;
        }

        absence.StartDate = request.StartDate;
        absence.EndDate = request.EndDate;
        absence.ReasonId = request.ReasonId;
        await db.SaveChangesAsync(ct);
        await AbsenceDeadlines.RecalculateAsync(db, employeeId, ct);

        return await db.Absences.Where(a => a.Id == id).Select(Projection).SingleAsync(ct);
    }

    [HttpDelete("{id:int}")]
    [Authorize(Policy = Permissions.EditEmployee)]
    public async Task<IActionResult> Delete(int employeeId, int id, CancellationToken ct)
    {
        if (!await InScopeAsync(Permissions.EditEmployee, employeeId, ct))
        {
            return NotFound();
        }

        var absence = await db.Absences.SingleOrDefaultAsync(a => a.Id == id && a.EmployeeId == employeeId, ct);
        if (absence is null)
        {
            return NotFound();
        }

        db.Absences.Remove(absence);
        await db.SaveChangesAsync(ct);
        await AbsenceDeadlines.RecalculateAsync(db, employeeId, ct);
        return NoContent();
    }

    private static readonly System.Linq.Expressions.Expression<Func<Absence, AbsenceDto>> Projection =
        a => new AbsenceDto(a.Id, a.StartDate, a.EndDate, a.ReasonId, a.Reason.Name, a.Reason.Kind.ToString());

    private async Task<ActionResult?> ValidateAsync(AbsenceRequest request, CancellationToken ct)
    {
        if (request.EndDate is { } end && end < request.StartDate)
        {
            ModelState.AddModelError(nameof(request.EndDate), "Koniec nieobecności nie może być przed jej początkiem.");
            return ValidationProblem(ModelState);
        }

        if (!await db.AbsenceReasons.AnyAsync(r => r.Id == request.ReasonId, ct))
        {
            ModelState.AddModelError(nameof(request.ReasonId), "Wybierz powód ze słownika.");
            return ValidationProblem(ModelState);
        }

        return null;
    }

    private async Task<bool> InScopeAsync(string permission, int employeeId, CancellationToken ct) =>
        await db.Employees.InScope(await access.ResolveAsync(permission, ct)).AnyAsync(e => e.Id == employeeId, ct);
}
