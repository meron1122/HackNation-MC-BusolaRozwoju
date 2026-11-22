using System.Security.Claims;
using Busola.Database;
using Busola.Database.Authorization;
using Busola.Database.Entities;
using Microsoft.EntityFrameworkCore;

namespace Busola.Api.Authorization;

/// <summary>
/// Polityka mówi, CZY użytkownik ma uprawnienie; ten serwis mówi, do CZYICH danych.
/// Bierze zakresy wszystkich ról użytkownika, które dają to uprawnienie.
/// </summary>
public sealed class AccessScopeService(BusolaDbContext db, IHttpContextAccessor httpContextAccessor)
{
    public async Task<AccessScope> ResolveAsync(string permission, CancellationToken ct)
    {
        var user = httpContextAccessor.HttpContext?.User
            ?? throw new InvalidOperationException("Brak kontekstu HTTP.");

        if (user.IsInRole(RoleNames.SuperAdmin))
        {
            return AccessScope.Everything;
        }

        var roles = user.FindAll(BusolaClaims.Role).Select(c => c.Value).ToList();
        var scopes = await db.RolePermissions
            .Where(rp => roles.Contains(rp.Role.Name!) && rp.Permission.Key == permission)
            .Select(rp => rp.Role.Scope)
            .Distinct()
            .ToListAsync(ct);

        if (scopes.Contains(DataScope.All))
        {
            return AccessScope.Everything;
        }

        if (scopes.Count == 0)
        {
            return AccessScope.Nothing;
        }

        var userId = user.FindFirstValue(BusolaClaims.UserId);
        var me = await db.Users
            .Where(u => u.Id == userId && u.Employee != null)
            .Select(u => new { EmployeeId = u.Employee!.Id, u.Employee.Department.Location.ServiceId })
            .SingleOrDefaultAsync(ct);

        if (me is null)
        {
            return AccessScope.Nothing;
        }

        var subordinates = scopes.Contains(DataScope.Subordinates)
            ? await GetSubordinateIdsAsync(me.EmployeeId, ct)
            : [];

        return new AccessScope(
            All: false,
            OwnEmployeeId: scopes.Contains(DataScope.Own) ? me.EmployeeId : null,
            ServiceId: scopes.Contains(DataScope.Service) ? me.ServiceId : null,
            SubordinateIds: subordinates);
    }

    // UNION (nie UNION ALL) — zapętlona hierarchia przełożonych nie zawiesi zapytania.
    // Kierujący komórką obejmuje też pracowników wydziałów, którymi kieruje (i ich podwładnych), oprócz siebie.
    private async Task<IReadOnlyList<int>> GetSubordinateIdsAsync(int employeeId, CancellationToken ct) =>
        await db.Database.SqlQuery<int>($"""
            WITH RECURSIVE subordinates AS (
                SELECT id FROM employees WHERE supervisor_id = {employeeId}
                UNION
                SELECT e.id FROM employees e JOIN departments d ON e.department_id = d.id
                    WHERE d.head_id = {employeeId} AND e.id <> {employeeId}
                UNION
                SELECT e.id FROM employees e JOIN subordinates s ON e.supervisor_id = s.id
            )
            SELECT id AS "Value" FROM subordinates
            """).ToListAsync(ct);
}
