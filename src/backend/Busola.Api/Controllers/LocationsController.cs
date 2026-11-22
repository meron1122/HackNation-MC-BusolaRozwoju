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
[Route("api/locations")]
public sealed class LocationsController(BusolaDbContext db, AccessScopeService access) : ControllerBase
{
    [HttpGet]
    [Authorize(Policy = Permissions.ReadLocations)]
    public async Task<IReadOnlyList<LocationDto>> GetAll(CancellationToken ct)
    {
        var scope = await access.ResolveAsync(Permissions.ReadLocations, ct);

        return await db.Locations
            .InScope(scope)
            .OrderBy(l => l.Name)
            .Select(LocationDto.Projection)
            .ToListAsync(ct);
    }

    [HttpGet("{id:int}")]
    [Authorize(Policy = Permissions.ReadLocations)]
    public async Task<ActionResult<LocationDto>> Get(int id, CancellationToken ct)
    {
        var scope = await access.ResolveAsync(Permissions.ReadLocations, ct);
        var location = await db.Locations
            .InScope(scope)
            .Where(l => l.Id == id)
            .Select(LocationDto.Projection)
            .SingleOrDefaultAsync(ct);

        return location is null ? NotFound() : location;
    }

    [HttpPost]
    [Authorize(Policy = Permissions.AddLocation)]
    public async Task<ActionResult<LocationDto>> Create(LocationRequest request, CancellationToken ct)
    {
        var scope = await access.ResolveAsync(Permissions.AddLocation, ct);
        if (await ValidateServiceAsync(request.ServiceId, scope, ct) is { } error)
        {
            return error;
        }

        var location = new Location { Name = request.Name, ServiceId = request.ServiceId };
        db.Locations.Add(location);
        await db.SaveChangesAsync(ct);

        return CreatedAtAction(nameof(Get), new { id = location.Id }, await LoadDtoAsync(location.Id, ct));
    }

    [HttpPut("{id:int}")]
    [Authorize(Policy = Permissions.EditLocation)]
    public async Task<ActionResult<LocationDto>> Update(int id, LocationRequest request, CancellationToken ct)
    {
        var scope = await access.ResolveAsync(Permissions.EditLocation, ct);
        var location = await db.Locations.InScope(scope).SingleOrDefaultAsync(l => l.Id == id, ct);
        if (location is null)
        {
            return NotFound();
        }

        if (request.ServiceId != location.ServiceId
            && await ValidateServiceAsync(request.ServiceId, scope, ct) is { } error)
        {
            return error;
        }

        location.Name = request.Name;
        location.ServiceId = request.ServiceId;
        await db.SaveChangesAsync(ct);

        return await LoadDtoAsync(id, ct);
    }

    [HttpDelete("{id:int}")]
    [Authorize(Policy = Permissions.DeleteLocation)]
    public async Task<IActionResult> Delete(int id, CancellationToken ct)
    {
        var scope = await access.ResolveAsync(Permissions.DeleteLocation, ct);
        // Remove zamiast ExecuteDelete: usunięcie trafia do dziennika audytu (AuditInterceptor).
        var location = await db.Locations.InScope(scope).SingleOrDefaultAsync(l => l.Id == id, ct);
        if (location is null)
        {
            return NotFound();
        }

        db.Locations.Remove(location);
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    private async Task<ActionResult?> ValidateServiceAsync(int serviceId, AccessScope scope, CancellationToken ct)
    {
        if (!await db.Services.AnyAsync(s => s.Id == serviceId, ct))
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, detail: "Nie ma takiej służby.");
        }

        return scope.CoversService(serviceId) ? null : Forbid();
    }

    private Task<LocationDto> LoadDtoAsync(int id, CancellationToken ct) =>
        db.Locations.Where(l => l.Id == id).Select(LocationDto.Projection).SingleAsync(ct);
}
