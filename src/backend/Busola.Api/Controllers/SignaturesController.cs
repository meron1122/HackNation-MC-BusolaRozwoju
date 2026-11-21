using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using Busola.Api.Authorization;
using Busola.Api.Signatures;
using Busola.Database;
using Busola.Database.Authorization;
using Busola.Database.Entities;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Busola.Api.Controllers;

/// <summary>Prośby o podpis zlecającego. Każdy zalogowany widzi swoje, SuperAdmin wszystkie.</summary>
[ApiController]
[Route("api/signatures")]
public sealed class SignaturesController(BusolaDbContext db, SignatureService signatures) : ControllerBase
{
    public sealed record CreateRequest([Required, MaxLength(200)] string Title, [Required, MaxLength(200)] string SignerName);

    public sealed record LinkResponse(string Token, DateTimeOffset LinkExpiresAt);

    public sealed record CreateResponse(SignatureRequestDto Request, string Token);

    [HttpGet]
    public async Task<IReadOnlyList<SignatureRequestDto>> GetAll(CancellationToken ct) =>
        (await Mine().OrderByDescending(r => r.CreatedAt).Take(100).ToListAsync(ct)).Select(signatures.ToDto).ToList();

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<SignatureRequestDto>> Get(Guid id, CancellationToken ct) =>
        await Mine().SingleOrDefaultAsync(r => r.Id == id, ct) is { } r ? signatures.ToDto(r) : NotFound();

    [HttpPost]
    public async Task<ActionResult<CreateResponse>> Create(CreateRequest request, CancellationToken ct)
    {
        var (dto, token) = await signatures.CreateAsync(request.Title, request.SignerName, UserId, ct);
        return Created($"api/signatures/{dto.Id}", new CreateResponse(dto, token));
    }

    [HttpPost("{id:guid}/link")]
    public async Task<ActionResult<LinkResponse>> RenewLink(Guid id, CancellationToken ct)
    {
        if (!await Mine().AnyAsync(r => r.Id == id, ct))
        {
            return NotFound();
        }

        var token = await signatures.RenewLinkAsync(id, ct);
        return token is null
            ? Problem(statusCode: StatusCodes.Status409Conflict, detail: "Prośba jest już zakończona.")
            : new LinkResponse(token, DateTimeOffset.UtcNow + SignatureService.LinkLifetime);
    }

    [HttpGet("{id:guid}/image")]
    public async Task<IActionResult> Image(Guid id, CancellationToken ct)
    {
        var image = await Mine().Where(r => r.Id == id).Select(r => r.Image).SingleOrDefaultAsync(ct);
        return image is null ? NotFound() : File(image, "image/png");
    }

    private string UserId => User.FindFirstValue(BusolaClaims.UserId)!;

    private IQueryable<SignatureRequest> Mine() =>
        User.IsInRole(RoleNames.SuperAdmin)
            ? db.SignatureRequests
            : db.SignatureRequests.Where(r => r.CreatedByUserId == UserId);
}
