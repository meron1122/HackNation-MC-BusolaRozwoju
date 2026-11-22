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
/// Nieobecności pracownika (profil → Nieobecności) i wszystkich pracowników w zakresie (strona „Nieobecności”, /api/absences).
/// Odczyt: read_employees w zakresie (pracownik widzi swoje);
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

    /// <summary>Strona „Nieobecności”: wszystkie nieobecności pracowników w zakresie, od najnowszych.</summary>
    [HttpGet("/api/absences")]
    [Authorize(Policy = Permissions.ReadEmployees)]
    public async Task<IReadOnlyList<AbsenceListItemDto>> GetAllInScope(CancellationToken ct)
    {
        var employeeIds = db.Employees.InScope(await access.ResolveAsync(Permissions.ReadEmployees, ct)).Select(e => e.Id);
        return await db.Absences
            .Where(a => employeeIds.Contains(a.EmployeeId))
            .OrderByDescending(a => a.StartDate)
            .ThenBy(a => a.Employee.LastName)
            .Select(ListProjection)
            .ToListAsync(ct);
    }

    [HttpPost("/api/absences")]
    [Authorize(Policy = Permissions.EditEmployee)]
    public async Task<ActionResult<AbsenceListItemDto>> CreateEntry(AbsenceEntryRequest request, CancellationToken ct)
    {
        var created = await Create(request.EmployeeId, new AbsenceRequest(request.StartDate, request.EndDate, request.ReasonId), ct);
        return created.Value is { } dto
            ? await db.Absences.Where(a => a.Id == dto.Id).Select(ListProjection).SingleAsync(ct)
            : created.Result!;
    }

    /// <summary>Zmiana także pracownika: oba muszą być w zakresie; terminy przeliczają się u obu.</summary>
    [HttpPut("/api/absences/{id:int}")]
    [Authorize(Policy = Permissions.EditEmployee)]
    public async Task<ActionResult<AbsenceListItemDto>> UpdateEntry(int id, AbsenceEntryRequest request, CancellationToken ct)
    {
        var absence = await db.Absences.SingleOrDefaultAsync(a => a.Id == id, ct);
        if (absence is null || !await InScopeAsync(Permissions.EditEmployee, absence.EmployeeId, ct)
            || !await InScopeAsync(Permissions.EditEmployee, request.EmployeeId, ct))
        {
            return NotFound();
        }

        if (await ValidateAsync(new AbsenceRequest(request.StartDate, request.EndDate, request.ReasonId), ct) is { } problem)
        {
            return problem;
        }

        var previousEmployeeId = absence.EmployeeId;
        absence.EmployeeId = request.EmployeeId;
        absence.StartDate = request.StartDate;
        absence.EndDate = request.EndDate;
        absence.ReasonId = request.ReasonId;
        await db.SaveChangesAsync(ct);
        await AbsenceDeadlines.RecalculateAsync(db, request.EmployeeId, ct);
        if (previousEmployeeId != request.EmployeeId)
        {
            await AbsenceDeadlines.RecalculateAsync(db, previousEmployeeId, ct);
        }

        return await db.Absences.Where(a => a.Id == id).Select(ListProjection).SingleAsync(ct);
    }

    [HttpDelete("/api/absences/{id:int}")]
    [Authorize(Policy = Permissions.EditEmployee)]
    public async Task<IActionResult> DeleteEntry(int id, CancellationToken ct)
    {
        var employeeId = await db.Absences.Where(a => a.Id == id).Select(a => (int?)a.EmployeeId).SingleOrDefaultAsync(ct);
        return employeeId is null ? NotFound() : await Delete(employeeId.Value, id, ct);
    }

    private static readonly System.Linq.Expressions.Expression<Func<Absence, AbsenceListItemDto>> ListProjection =
        a => new AbsenceListItemDto(a.Id, a.EmployeeId, a.Employee.LastName + " " + a.Employee.FirstName, a.StartDate, a.EndDate,
            a.ReasonId, a.Reason.Name, a.Reason.Kind.ToString());

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
