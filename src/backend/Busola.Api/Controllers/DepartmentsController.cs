using Busola.Api.Authorization;
using Busola.Api.Models;
using Busola.Database;
using Busola.Database.Authorization;
using Busola.Database.Entities;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Busola.Api.Controllers;

[ApiController]
[Route("api/departments")]
public sealed class DepartmentsController(BusolaDbContext db, AccessScopeService access) : ControllerBase
{
    [HttpGet]
    [Authorize(Policy = Permissions.ReadDepartments)]
    public async Task<IReadOnlyList<DepartmentDto>> GetAll(int? locationId, CancellationToken ct)
    {
        var scope = await access.ResolveAsync(Permissions.ReadDepartments, ct);
        var query = db.Departments.InScope(scope);
        if (locationId is not null)
        {
            query = query.Where(d => d.LocationId == locationId);
        }

        return await query
            .OrderBy(d => d.Name)
            .Select(DepartmentDto.Projection)
            .ToListAsync(ct);
    }

    [HttpGet("{id:int}")]
    [Authorize(Policy = Permissions.ReadDepartments)]
    public async Task<ActionResult<DepartmentDto>> Get(int id, CancellationToken ct)
    {
        var scope = await access.ResolveAsync(Permissions.ReadDepartments, ct);
        var department = await db.Departments
            .InScope(scope)
            .Where(d => d.Id == id)
            .Select(DepartmentDto.Projection)
            .SingleOrDefaultAsync(ct);

        return department is null ? NotFound() : department;
    }

    [HttpPost]
    [Authorize(Policy = Permissions.AddDepartment)]
    public async Task<ActionResult<DepartmentDto>> Create(DepartmentRequest request, CancellationToken ct)
    {
        var scope = await access.ResolveAsync(Permissions.AddDepartment, ct);
        if (await ValidateLocationAsync(request.LocationId, scope, ct) is { } error)
        {
            return error;
        }

        var department = new Department { Name = request.Name, LocationId = request.LocationId };
        db.Departments.Add(department);
        await db.SaveChangesAsync(ct);

        return CreatedAtAction(nameof(Get), new { id = department.Id }, await LoadDtoAsync(department.Id, ct));
    }

    [HttpPut("{id:int}")]
    [Authorize(Policy = Permissions.EditDepartment)]
    public async Task<ActionResult<DepartmentDto>> Update(int id, DepartmentRequest request, CancellationToken ct)
    {
        var scope = await access.ResolveAsync(Permissions.EditDepartment, ct);
        var department = await db.Departments.InScope(scope).SingleOrDefaultAsync(d => d.Id == id, ct);
        if (department is null)
        {
            return NotFound();
        }

        if (request.LocationId != department.LocationId
            && await ValidateLocationAsync(request.LocationId, scope, ct) is { } error)
        {
            return error;
        }

        department.Name = request.Name;
        department.LocationId = request.LocationId;
        await db.SaveChangesAsync(ct);

        return await LoadDtoAsync(id, ct);
    }

    /// <summary>
    /// Kierujący komórką organizacyjną (null = brak). Osobno od edycji wydziału, żeby formularz bez tego pola go nie kasował.
    /// Kierujący widzi i współtworzy oceny pracowników wydziału oraz podpisuje swoje pola arkusza pierwszej oceny.
    /// </summary>
    [HttpPut("{id:int}/head")]
    [Authorize(Policy = Permissions.EditDepartment)]
    public async Task<ActionResult<DepartmentDto>> SetHead(int id, DepartmentHeadRequest request, CancellationToken ct)
    {
        var scope = await access.ResolveAsync(Permissions.EditDepartment, ct);
        var department = await db.Departments.InScope(scope).Include(d => d.Location).SingleOrDefaultAsync(d => d.Id == id, ct);
        if (department is null)
        {
            return NotFound();
        }

        if (request.EmployeeId is { } employeeId
            && !await db.Employees.AnyAsync(e => e.Id == employeeId && e.Department.Location.ServiceId == department.Location.ServiceId, ct))
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, detail: "Kierujący musi być pracownikiem tej samej służby.");
        }

        department.HeadId = request.EmployeeId;
        await db.SaveChangesAsync(ct);

        return await LoadDtoAsync(id, ct);
    }

    [HttpDelete("{id:int}")]
    [Authorize(Policy = Permissions.DeleteDepartment)]
    public async Task<IActionResult> Delete(int id, CancellationToken ct)
    {
        var scope = await access.ResolveAsync(Permissions.DeleteDepartment, ct);
        // Remove zamiast ExecuteDelete: usunięcie trafia do dziennika audytu (AuditInterceptor).
        var department = await db.Departments.InScope(scope).SingleOrDefaultAsync(d => d.Id == id, ct);
        if (department is null)
        {
            return NotFound();
        }

        db.Departments.Remove(department);
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    private async Task<ActionResult?> ValidateLocationAsync(int locationId, AccessScope scope, CancellationToken ct)
    {
        var serviceId = await db.Locations
            .Where(l => l.Id == locationId)
            .Select(l => (int?)l.ServiceId)
            .SingleOrDefaultAsync(ct);

        if (serviceId is null)
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, detail: "Nie ma takiej lokalizacji.");
        }

        return scope.CoversService(serviceId.Value) ? null : Forbid();
    }

    private Task<DepartmentDto> LoadDtoAsync(int id, CancellationToken ct) =>
        db.Departments.Where(d => d.Id == id).Select(DepartmentDto.Projection).SingleAsync(ct);
}
