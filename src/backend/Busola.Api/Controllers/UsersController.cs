using Busola.Api.Authorization;
using Busola.Api.Infrastructure;
using Busola.Api.Models;
using Busola.Database;
using Busola.Database.Authorization;
using Busola.Database.Entities;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Busola.Api.Controllers;

/// <summary>
/// Administrator służby zarządza kontami pracowników swojej służby i nie może nadać ani odebrać ról o zakresie All.
/// Konta bez pracownika (techniczne) zakłada tylko SuperAdmin.
/// </summary>
[ApiController]
[Route("api/users")]
[Authorize(Policy = Permissions.ManageUsers)]
public sealed class UsersController(BusolaDbContext db, UserManager<User> userManager, AccessScopeService access)
    : ControllerBase
{
    [HttpGet]
    public async Task<IReadOnlyList<UserDto>> GetAll(CancellationToken ct)
    {
        var scope = await access.ResolveAsync(Permissions.ManageUsers, ct);

        return await UsersInScope(scope)
            .OrderBy(u => u.Email)
            .Select(u => new UserDto(
                u.Id,
                u.Email!,
                u.EmployeeId,
                db.UserRoles.Where(ur => ur.UserId == u.Id)
                    .Join(db.Roles, ur => ur.RoleId, r => r.Id, (_, r) => r.Name!)
                    .ToList(),
                u.TwoFactorEnabled))
            .ToListAsync(ct);
    }

    [HttpPost]
    public async Task<ActionResult<UserDto>> Create(CreateUserRequest request, CancellationToken ct)
    {
        var scope = await access.ResolveAsync(Permissions.ManageUsers, ct);

        if (request.EmployeeId is { } employeeId)
        {
            var serviceId = await db.Employees
                .Where(e => e.Id == employeeId)
                .Select(e => (int?)e.Department.Location.ServiceId)
                .SingleOrDefaultAsync(ct);

            if (serviceId is null)
            {
                return Problem(statusCode: StatusCodes.Status400BadRequest, detail: "Nie ma takiego pracownika.");
            }

            if (!scope.CoversService(serviceId.Value))
            {
                return Forbid();
            }
        }
        else if (!scope.All)
        {
            return Forbid();
        }

        if (await ValidateRolesAsync(request.Roles, request.EmployeeId, scope, ct) is { } error)
        {
            return error;
        }

        var user = new User { UserName = request.Email, Email = request.Email, EmployeeId = request.EmployeeId };
        var result = await userManager.CreateAsync(user, request.Password);
        if (result.Succeeded)
        {
            result = await userManager.AddToRolesAsync(user, request.Roles);
        }

        if (!result.Succeeded)
        {
            return IdentityErrors(result);
        }

        return Created($"api/users/{user.Id}", new UserDto(user.Id, user.Email, user.EmployeeId, request.Roles, TwoFactorEnabled: false));
    }

    [HttpPut("{id}/roles")]
    public async Task<ActionResult<UserDto>> UpdateRoles(string id, UpdateUserRolesRequest request, CancellationToken ct)
    {
        var scope = await access.ResolveAsync(Permissions.ManageUsers, ct);
        var user = await UsersInScope(scope).SingleOrDefaultAsync(u => u.Id == id, ct);
        if (user is null)
        {
            return NotFound();
        }

        var currentRoles = await userManager.GetRolesAsync(user);
        if (!scope.All && await HoldsAllScopeRoleAsync(currentRoles, ct))
        {
            return Forbid();
        }

        if (await ValidateRolesAsync(request.Roles, user.EmployeeId, scope, ct) is { } error)
        {
            return error;
        }

        var result = await userManager.RemoveFromRolesAsync(user, currentRoles);
        if (result.Succeeded)
        {
            result = await userManager.AddToRolesAsync(user, request.Roles);
        }

        if (result.Succeeded)
        {
            // Unieważnia tokeny użytkownika — odebrana rola przestaje działać od razu, a nie po 12 h.
            result = await userManager.UpdateSecurityStampAsync(user);
        }

        return result.Succeeded
            ? new UserDto(user.Id, user.Email!, user.EmployeeId, request.Roles, user.TwoFactorEnabled)
            : IdentityErrors(result);
    }

    /// <summary>Gdy użytkownik zgubi telefon i kody odzyskiwania. Wylogowuje go wszędzie.</summary>
    [HttpDelete("{id}/two-factor")]
    public async Task<IActionResult> ResetTwoFactor(string id, CancellationToken ct)
    {
        var scope = await access.ResolveAsync(Permissions.ManageUsers, ct);
        var user = await UsersInScope(scope).SingleOrDefaultAsync(u => u.Id == id, ct);
        if (user is null)
        {
            return NotFound();
        }

        if (!scope.All && await HoldsAllScopeRoleAsync(await userManager.GetRolesAsync(user), ct))
        {
            return Forbid();
        }

        await userManager.SetTwoFactorEnabledAsync(user, false);
        await userManager.ResetAuthenticatorKeyAsync(user);
        return NoContent();
    }

    private Task<bool> HoldsAllScopeRoleAsync(IList<string> roleNames, CancellationToken ct) =>
        db.Roles.AnyAsync(r => roleNames.Contains(r.Name!) && r.Scope == DataScope.All, ct);

    private IQueryable<User> UsersInScope(AccessScope scope) =>
        scope.All
            ? db.Users
            : db.Users.Where(u => u.Employee != null && u.Employee.Department.Location.ServiceId == scope.ServiceId);

    private async Task<ActionResult?> ValidateRolesAsync(
        IReadOnlyList<string> roleNames, int? employeeId, AccessScope scope, CancellationToken ct)
    {
        if (roleNames.Any(RoleNames.Derived.Contains))
        {
            return Problem(
                statusCode: StatusCodes.Status400BadRequest,
                detail: $"Role {RoleNames.Employee} i {RoleNames.Supervisor} wynikają z danych pracownika i nie przypisuje się ich ręcznie.");
        }

        var roles = await db.Roles
            .Where(r => roleNames.Contains(r.Name!))
            .Select(r => r.Scope)
            .ToListAsync(ct);

        if (roles.Count != roleNames.Distinct().Count())
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, detail: "Nieznana rola.");
        }

        if (!scope.All && roles.Contains(DataScope.All))
        {
            return Forbid();
        }

        // Zakres Own/Subordinates/Service liczy się od pracownika — bez niego rola nic by nie dała.
        if (employeeId is null && roles.Any(s => s != DataScope.All))
        {
            return Problem(
                statusCode: StatusCodes.Status400BadRequest,
                detail: "Role o zakresie innym niż All wymagają konta powiązanego z pracownikiem.");
        }

        return null;
    }

    private ActionResult IdentityErrors(IdentityResult result)
    {
        foreach (var error in result.Errors.WithoutDuplicateUserName())
        {
            ModelState.AddModelError(error.Code, error.Description);
        }

        return ValidationProblem(ModelState);
    }
}
