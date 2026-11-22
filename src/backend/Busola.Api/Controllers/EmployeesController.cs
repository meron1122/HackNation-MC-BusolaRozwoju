using Busola.Api.Authorization;
using Busola.Api.Evaluations;
using Busola.Api.Infrastructure;
using Busola.Api.Models;
using Busola.Database;
using Busola.Database.Authorization;
using Busola.Database.Entities;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Busola.Api.Controllers;

/// <summary>
/// Pracownik zawsze ma konto: założenie pracownika zakłada konto (bez ról — Pracownik/Przełożony wynikają z danych),
/// a usunięcie pracownika usuwa konto. Dlatego wystarcza add_employee/delete_employee, bez manage_users.
/// </summary>
[ApiController]
[Route("api/employees")]
public sealed class EmployeesController(BusolaDbContext db, AccessScopeService access, UserManager<User> userManager)
    : ControllerBase
{
    [HttpGet]
    [Authorize(Policy = Permissions.ReadEmployees)]
    public async Task<IReadOnlyList<EmployeeDto>> GetAll(int page = 1, int pageSize = 50, CancellationToken ct = default)
    {
        var scope = await access.ResolveAsync(Permissions.ReadEmployees, ct);
        page = Math.Max(page, 1);
        pageSize = Math.Clamp(pageSize, 1, 200);

        return await db.Employees
            .InScope(scope)
            .OrderBy(e => e.LastName).ThenBy(e => e.FirstName).ThenBy(e => e.Id)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(EmployeeDto.Projection)
            .ToListAsync(ct);
    }

    [HttpGet("{id:int}")]
    [Authorize(Policy = Permissions.ReadEmployees)]
    public async Task<ActionResult<EmployeeDto>> Get(int id, CancellationToken ct)
    {
        var scope = await access.ResolveAsync(Permissions.ReadEmployees, ct);
        var employee = await db.Employees
            .InScope(scope)
            .Where(e => e.Id == id)
            .Select(EmployeeDto.Projection)
            .SingleOrDefaultAsync(ct);

        return employee is null ? NotFound() : employee;
    }

    /// <summary>Zdjęcie widzi ten, kto widzi pracownika.</summary>
    [HttpGet("{id:int}/avatar")]
    [Authorize(Policy = Permissions.ReadEmployees)]
    public async Task<IActionResult> GetAvatar(int id, CancellationToken ct)
    {
        var scope = await access.ResolveAsync(Permissions.ReadEmployees, ct);
        var avatar = await db.Employees
            .InScope(scope)
            .Where(e => e.Id == id && e.User != null && e.User.Avatar != null)
            .Select(e => e.User!.Avatar!)
            .AsNoTracking()
            .SingleOrDefaultAsync(ct);

        return avatar is null ? NotFound() : avatar.ToFileResult(this);
    }

    [HttpPost]
    [Authorize(Policy = Permissions.AddEmployee)]
    public async Task<ActionResult<CreatedEmployeeDto>> Create(EmployeeRequest request, CancellationToken ct)
    {
        var scope = await access.ResolveAsync(Permissions.AddEmployee, ct);
        var email = request.Email?.Trim();
        if (string.IsNullOrEmpty(email))
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, detail: "Podaj e-mail — z nim zakładamy konto pracownika.");
        }

        if (await ValidateAsync(request, scope, employeeId: null, departmentChanged: true, ct) is { } error)
        {
            return error;
        }

        // Pracownik i konto razem albo wcale (np. zajęty e-mail cofa też pracownika).
        await using var transaction = await db.Database.BeginTransactionAsync(ct);

        var employee = new Employee
        {
            FirstName = request.FirstName,
            LastName = request.LastName,
        };
        Apply(employee, request);
        db.Employees.Add(employee);
        await db.SaveChangesAsync(ct);

        var password = PasswordGenerator.Generate();
        var user = new User { UserName = email, Email = email, EmailConfirmed = true, EmployeeId = employee.Id };
        var result = await userManager.CreateAsync(user, password);
        if (!result.Succeeded)
        {
            await transaction.RollbackAsync(ct);
            foreach (var identityError in result.Errors.WithoutDuplicateUserName())
            {
                ModelState.AddModelError(identityError.Code, identityError.Description);
            }

            return ValidationProblem(ModelState);
        }

        // Od zatrudnienia biegnie albo pierwsza ocena, albo cykl oceny okresowej — terminy pilnujemy od pierwszego dnia.
        var templateCode = employee.SubjectToFirstEvaluation
            ? EvaluationWorkflow.FirstTemplate
            : await EvaluationWorkflow.PeriodicTemplateCodeAsync(db, employee.Id, ct);
        var evaluation = await EvaluationWorkflow.StartAsync(db, employee, templateCode, employee.HireDate, ct);
        await db.SaveChangesAsync(ct);

        await transaction.CommitAsync(ct);

        return CreatedAtAction(nameof(Get), new { id = employee.Id },
            new CreatedEmployeeDto(await LoadDtoAsync(employee.Id, ct), email, password, evaluation.Id, evaluation.Template.Title));
    }

    [HttpPut("{id:int}")]
    [Authorize(Policy = Permissions.EditEmployee)]
    public async Task<ActionResult<EmployeeDto>> Update(int id, EmployeeRequest request, CancellationToken ct)
    {
        var scope = await access.ResolveAsync(Permissions.EditEmployee, ct);
        var employee = await db.Employees.InScope(scope).SingleOrDefaultAsync(e => e.Id == id, ct);
        if (employee is null)
        {
            return NotFound();
        }

        var departmentChanged = request.DepartmentId != employee.DepartmentId;
        if (await ValidateAsync(request, scope, id, departmentChanged, ct) is { } error)
        {
            return error;
        }

        Apply(employee, request);
        await db.SaveChangesAsync(ct);

        return await LoadDtoAsync(id, ct);
    }

    [HttpDelete("{id:int}")]
    [Authorize(Policy = Permissions.DeleteEmployee)]
    public async Task<IActionResult> Delete(int id, CancellationToken ct)
    {
        var scope = await access.ResolveAsync(Permissions.DeleteEmployee, ct);
        if (!await db.Employees.InScope(scope).AnyAsync(e => e.Id == id, ct))
        {
            return NotFound();
        }

        var myEmployeeId = await db.Users
            .Where(u => u.Id == User.FindFirstValue(BusolaClaims.UserId))
            .Select(u => u.EmployeeId)
            .SingleAsync(ct);
        if (myEmployeeId == id)
        {
            return Problem(statusCode: StatusCodes.Status403Forbidden, detail: "Nie możesz usunąć samego siebie.");
        }

        // Konto i pracownik razem, jednym SaveChanges (jedna transakcja). Gdy coś na nie wskazuje (oceny,
        // wypełnione pola, podpisy), baza odrzuci usunięcie (409) i oba zostaną. Remove zamiast ExecuteDelete,
        // żeby usunięcie trafiło do dziennika audytu.
        db.Users.RemoveRange(await db.Users.Where(u => u.EmployeeId == id).ToListAsync(ct));
        db.Employees.Remove(await db.Employees.SingleAsync(e => e.Id == id, ct));
        await db.SaveChangesAsync(ct);

        return NoContent();
    }

    private static void Apply(Employee employee, EmployeeRequest request)
    {
        employee.FirstName = request.FirstName;
        employee.LastName = request.LastName;
        employee.DateOfBirth = request.DateOfBirth;
        employee.HireDate = request.HireDate;
        employee.DepartmentId = request.DepartmentId;
        employee.SupervisorId = request.SupervisorId;
        employee.SubjectToFirstEvaluation = request.SubjectToFirstEvaluation;
        employee.PositionId = request.PositionId;
    }

    // Wydział sprawdzamy tylko przy zmianie — inaczej rola z zakresem Own/Subordinates nie mogłaby edytować nikogo.
    private async Task<ActionResult?> ValidateAsync(
        EmployeeRequest request, AccessScope scope, int? employeeId, bool departmentChanged, CancellationToken ct)
    {
        if (departmentChanged)
        {
            var serviceId = await db.Departments
                .Where(d => d.Id == request.DepartmentId)
                .Select(d => (int?)d.Location.ServiceId)
                .SingleOrDefaultAsync(ct);

            if (serviceId is null)
            {
                return Problem(statusCode: StatusCodes.Status400BadRequest, detail: "Nie ma takiego wydziału.");
            }

            if (!scope.CoversService(serviceId.Value))
            {
                return Forbid();
            }
        }

        if (request.SupervisorId is { } supervisorId)
        {
            if (supervisorId == employeeId)
            {
                return Problem(statusCode: StatusCodes.Status400BadRequest, detail: "Pracownik nie może być swoim przełożonym.");
            }

            if (!await db.Employees.AnyAsync(e => e.Id == supervisorId, ct))
            {
                return Problem(statusCode: StatusCodes.Status400BadRequest, detail: "Nie ma takiego przełożonego.");
            }
        }

        // Stanowisko tylko ze słownika służby, do której należy wydział pracownika (jak w profilu → Zatrudnienie).
        if (request.PositionId is { } positionId
            && !await db.Positions.AnyAsync(p => p.Id == positionId
                && db.Departments.Any(d => d.Id == request.DepartmentId && d.Location.ServiceId == p.ServiceId), ct))
        {
            ModelState.AddModelError(nameof(request.PositionId), "Wybierz stanowisko ze słownika służby, do której należy wydział.");
            return ValidationProblem(ModelState);
        }

        return null;
    }

    private Task<EmployeeDto> LoadDtoAsync(int id, CancellationToken ct) =>
        db.Employees.Where(e => e.Id == id).Select(EmployeeDto.Projection).SingleAsync(ct);
}
