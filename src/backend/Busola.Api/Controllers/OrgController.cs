using System.Security.Claims;
using Busola.Api.Authorization;
using Busola.Api.Infrastructure;
using Busola.Database;
using Busola.Database.Authorization;
using Busola.Database.Entities;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Busola.Api.Controllers;

/// <summary>
/// Drzewko przełożonych (jak org chart): łańcuch przełożonych w górę, wybrana osoba i jej bezpośredni podwładni.
/// Każdy pracownik widzi tylko osoby ze swojej służby (w służbach sama tożsamość bywa wrażliwa), SuperAdmin wszystkich.
/// Karta ma tylko podstawowe dane: imię i nazwisko, stanowisko, komórkę.
/// </summary>
[ApiController]
[Route("api/org")]
public sealed class OrgController(BusolaDbContext db) : ControllerBase
{
    private const int MaxChainDepth = 30;

    public sealed record OrgCard(int Id, string Name, string? JobTitle, string DepartmentName, bool HasAvatar, int ReportsCount, bool IsMe);

    public sealed record OrgView(OrgCard Focus, IReadOnlyList<OrgCard> Managers, IReadOnlyList<OrgCard> Reports);

    /// <param name="employeeId">Osoba w centrum; domyślnie ja.</param>
    [HttpGet]
    public async Task<ActionResult<OrgView>> Get(int? employeeId, CancellationToken ct)
    {
        var me = await MeAsync(ct);
        var focusId = employeeId ?? me.EmployeeId;
        if (focusId is null)
        {
            return Problem(statusCode: StatusCodes.Status404NotFound, detail: "Twoje konto nie jest powiązane z pracownikiem.");
        }

        var visible = Visible(me);
        var focus = await Cards(visible.Where(e => e.Id == focusId), me.EmployeeId).SingleOrDefaultAsync(ct);
        if (focus is null)
        {
            return NotFound();
        }

        // Łańcuch w górę; przerywa się na osobie spoza zasięgu (np. inna służba) i na pętli w danych.
        var managers = new List<OrgCard>();
        var seen = new HashSet<int> { focus.Id };
        var next = await db.Employees.Where(e => e.Id == focus.Id).Select(e => e.SupervisorId).SingleAsync(ct);
        while (next is { } managerId && seen.Add(managerId) && managers.Count < MaxChainDepth)
        {
            var manager = await Cards(visible.Where(e => e.Id == managerId), me.EmployeeId).SingleOrDefaultAsync(ct);
            if (manager is null)
            {
                break;
            }

            managers.Insert(0, manager);
            next = await db.Employees.Where(e => e.Id == managerId).Select(e => e.SupervisorId).SingleAsync(ct);
        }

        var reports = await Cards(visible.Where(e => e.SupervisorId == focus.Id), me.EmployeeId).ToListAsync(ct);
        return new OrgView(focus, managers, reports);
    }

    /// <summary>Zdjęcie na karcie: te same zasady widoczności co drzewko.</summary>
    [HttpGet("{employeeId:int}/avatar")]
    public async Task<IActionResult> Avatar(int employeeId, CancellationToken ct)
    {
        var avatar = await Visible(await MeAsync(ct))
            .Where(e => e.Id == employeeId && e.User != null && e.User.Avatar != null)
            .Select(e => e.User!.Avatar!)
            .AsNoTracking()
            .SingleOrDefaultAsync(ct);

        return avatar is null ? NotFound() : avatar.ToFileResult(this);
    }

    private IQueryable<Employee> Visible((int? EmployeeId, int? ServiceId) me) =>
        User.IsInRole(RoleNames.SuperAdmin)
            ? db.Employees
            : db.Employees.Where(e => me.ServiceId != null && e.Department.Location.ServiceId == me.ServiceId);

    private IQueryable<OrgCard> Cards(IQueryable<Employee> query, int? myEmployeeId) =>
        query
            .OrderBy(e => e.LastName).ThenBy(e => e.FirstName)
            .Select(e => new OrgCard(
                e.Id,
                e.FirstName + " " + e.LastName,
                db.EmployeeProfiles.Where(p => p.EmployeeId == e.Id).Select(p => p.JobTitle).FirstOrDefault(),
                e.Department.Name,
                e.User != null && e.User.Avatar != null,
                e.Subordinates.Count,
                e.Id == myEmployeeId));

    private async Task<(int? EmployeeId, int? ServiceId)> MeAsync(CancellationToken ct)
    {
        var userId = User.FindFirstValue(BusolaClaims.UserId);
        var me = await db.Users
            .Where(u => u.Id == userId)
            .Select(u => new { u.EmployeeId, ServiceId = u.Employee != null ? (int?)u.Employee.Department.Location.ServiceId : null })
            .SingleOrDefaultAsync(ct);
        return (me?.EmployeeId, me?.ServiceId);
    }
}
