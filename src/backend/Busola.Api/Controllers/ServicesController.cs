using System.ComponentModel.DataAnnotations;
using Busola.Database;
using Busola.Database.Authorization;
using Busola.Database.Entities;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Busola.Api.Controllers;

/// <summary>Słownik służb: lista dla formularza lokalizacji, dodawanie tylko przez SuperAdmina (bez nowego uprawnienia i migracji).</summary>
[ApiController]
[Route("api/services")]
public sealed class ServicesController(BusolaDbContext db) : ControllerBase
{
    public sealed record ServiceDto(int Id, string Name);

    public sealed record ServiceRequest([Required, MaxLength(200)] string Name);

    [HttpGet]
    [Authorize(Policy = Permissions.ReadLocations)]
    public async Task<IReadOnlyList<ServiceDto>> GetAll(CancellationToken ct) =>
        await db.Services.OrderBy(s => s.Name).Select(s => new ServiceDto(s.Id, s.Name)).ToListAsync(ct);

    [HttpPost]
    [Authorize(Roles = RoleNames.SuperAdmin)]
    public async Task<ActionResult<ServiceDto>> Create(ServiceRequest request, CancellationToken ct)
    {
        var service = new Service { Name = request.Name };
        db.Services.Add(service);
        await db.SaveChangesAsync(ct);

        return Created($"api/services/{service.Id}", new ServiceDto(service.Id, service.Name));
    }
}
