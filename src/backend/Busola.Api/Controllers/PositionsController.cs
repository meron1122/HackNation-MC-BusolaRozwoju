using Busola.Api.Authorization;
using Busola.Api.Models;
using Busola.Database;
using Busola.Database.Authorization;
using Busola.Database.Entities;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Busola.Api.Controllers;

/// <summary>
/// Słownik stanowisk urzędu (służby): HR wybiera z niego stanowisko pracownika (profil → Zatrudnienie),
/// a arkusz oceny bierze stąd „Stanowisko pracy”. Lista dla każdego, kto widzi pracowników w zakresie służby.
/// </summary>
[ApiController]
[Route("api/positions")]
public sealed class PositionsController(BusolaDbContext db, AccessScopeService access) : ControllerBase
{
    [HttpGet]
    [Authorize(Policy = Permissions.ReadEmployees)]
    public async Task<IReadOnlyList<PositionDto>> GetAll(int? serviceId, CancellationToken ct)
    {
        var scope = await access.ResolveAsync(Permissions.ReadEmployees, ct);
        return await InScope(scope)
            .Where(p => serviceId == null || p.ServiceId == serviceId)
            .OrderBy(p => p.Name)
            .Select(Projection)
            .ToListAsync(ct);
    }

    [HttpPost]
    [Authorize(Policy = Permissions.ManagePositions)]
    public async Task<ActionResult<PositionDto>> Create(PositionRequest request, CancellationToken ct)
    {
        var scope = await access.ResolveAsync(Permissions.ManagePositions, ct);
        var serviceId = request.ServiceId ?? scope.ServiceId;
        if (serviceId is null)
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, detail: "Wskaż służbę stanowiska.");
        }

        if (!scope.CoversService(serviceId.Value) || !await db.Services.AnyAsync(s => s.Id == serviceId, ct))
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, detail: "Nie ma takiej służby w Twoim zakresie.");
        }

        var position = new Position { Name = request.Name.Trim(), ServiceId = serviceId.Value };
        db.Positions.Add(position);
        await db.SaveChangesAsync(ct);

        return Created($"api/positions/{position.Id}", await db.Positions.Where(p => p.Id == position.Id).Select(Projection).SingleAsync(ct));
    }

    [HttpPut("{id:int}")]
    [Authorize(Policy = Permissions.ManagePositions)]
    public async Task<ActionResult<PositionDto>> Rename(int id, PositionRequest request, CancellationToken ct)
    {
        var scope = await access.ResolveAsync(Permissions.ManagePositions, ct);
        var position = await InScope(scope).SingleOrDefaultAsync(p => p.Id == id, ct);
        if (position is null)
        {
            return NotFound();
        }

        // Zmiana nazwy obejmuje wszystkich pracowników z tym stanowiskiem; arkusze już podpisane mają swoją kopię.
        position.Name = request.Name.Trim();
        await db.SaveChangesAsync(ct);

        return await db.Positions.Where(p => p.Id == id).Select(Projection).SingleAsync(ct);
    }

    [HttpDelete("{id:int}")]
    [Authorize(Policy = Permissions.ManagePositions)]
    public async Task<IActionResult> Delete(int id, CancellationToken ct)
    {
        var scope = await access.ResolveAsync(Permissions.ManagePositions, ct);
        var position = await InScope(scope).Select(p => new { p.Id, Used = p.Employees.Count }).SingleOrDefaultAsync(p => p.Id == id, ct);
        if (position is null)
        {
            return NotFound();
        }

        if (position.Used > 0)
        {
            return Problem(statusCode: StatusCodes.Status409Conflict,
                detail: $"Stanowisko jest przypisane pracownikom (liczba: {position.Used}) — najpierw zmień im stanowisko.");
        }

        await db.Positions.Where(p => p.Id == id).ExecuteDeleteAsync(ct);
        return NoContent();
    }

    private IQueryable<Position> InScope(AccessScope scope) =>
        scope.All ? db.Positions : db.Positions.Where(p => p.ServiceId == scope.ServiceId);

    private static readonly System.Linq.Expressions.Expression<Func<Position, PositionDto>> Projection =
        p => new PositionDto(p.Id, p.Name, p.ServiceId, p.Service.Name, p.Employees.Count);
}
