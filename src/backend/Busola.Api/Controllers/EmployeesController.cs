using Busola.Api.Authorization;
using Busola.Api.Models;
using Busola.Api.Pdf;
using Busola.Database;
using Busola.Database.Authorization;
using Busola.Database.Entities;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Busola.Api.Controllers;

[ApiController]
[Route("api/employees")]
public sealed class EmployeesController(BusolaDbContext db, AccessScopeService access) : ControllerBase
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

    /// <summary>Wszyscy pracownicy w zakresie użytkownika jako PDF (bez stronicowania).</summary>
    [HttpGet("report.pdf")]
    [Authorize(Policy = Permissions.ReadEmployees)]
    public async Task<IActionResult> Report(CancellationToken ct)
    {
        var scope = await access.ResolveAsync(Permissions.ReadEmployees, ct);
        var employees = await db.Employees
            .InScope(scope)
            .OrderBy(e => e.LastName).ThenBy(e => e.FirstName).ThenBy(e => e.Id)
            .Select(EmployeeDto.Projection)
            .ToListAsync(ct);

        var pdf = PdfReport.Render("Pracownicy", content => PdfReport.Table(
            content,
            ["Nazwisko i imię", "Służba", "Lokalizacja", "Wydział", "Zatrudniony", "Przełożony"],
            employees.Select(e => new[]
            {
                $"{e.LastName} {e.FirstName}", e.ServiceName, e.LocationName, e.DepartmentName,
                e.HireDate.ToString("yyyy-MM-dd"), e.SupervisorName ?? "—",
            })));

        return File(pdf, "application/pdf", "pracownicy.pdf");
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

    [HttpPost]
    [Authorize(Policy = Permissions.AddEmployee)]
    public async Task<ActionResult<EmployeeDto>> Create(EmployeeRequest request, CancellationToken ct)
    {
        var scope = await access.ResolveAsync(Permissions.AddEmployee, ct);
        if (await ValidateAsync(request, scope, employeeId: null, departmentChanged: true, ct) is { } error)
        {
            return error;
        }

        var employee = new Employee
        {
            FirstName = request.FirstName,
            LastName = request.LastName,
        };
        Apply(employee, request);
        db.Employees.Add(employee);
        await db.SaveChangesAsync(ct);

        return CreatedAtAction(nameof(Get), new { id = employee.Id }, await LoadDtoAsync(employee.Id, ct));
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
        var deleted = await db.Employees.InScope(scope).Where(e => e.Id == id).ExecuteDeleteAsync(ct);

        return deleted == 0 ? NotFound() : NoContent();
    }

    private static void Apply(Employee employee, EmployeeRequest request)
    {
        employee.FirstName = request.FirstName;
        employee.LastName = request.LastName;
        employee.DateOfBirth = request.DateOfBirth;
        employee.HireDate = request.HireDate;
        employee.DepartmentId = request.DepartmentId;
        employee.SupervisorId = request.SupervisorId;
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

        return null;
    }

    private Task<EmployeeDto> LoadDtoAsync(int id, CancellationToken ct) =>
        db.Employees.Where(e => e.Id == id).Select(EmployeeDto.Projection).SingleAsync(ct);
}
