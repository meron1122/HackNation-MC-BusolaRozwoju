using System.ComponentModel.DataAnnotations;
using Busola.Api.Signatures;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Busola.Api.Controllers;

/// <summary>Strona sygnatariusza: bez logowania, dostęp tylko przez token z linku/QR.</summary>
[ApiController]
[Route("api/sign/{token}")]
[AllowAnonymous]
public sealed class SignController(SignatureService signatures) : ControllerBase
{
    public sealed record SignInfo(string Title, string SignerName, string? RequestedBy, string Status, DateTimeOffset LinkExpiresAt);

    public sealed record SignRequest([Required] string Image);

    [HttpGet]
    public async Task<ActionResult<SignInfo>> Get(string token, CancellationToken ct)
    {
        var r = await signatures.FindByTokenAsync(token, ct);
        if (r is null)
        {
            return NotFound();
        }

        var requestedBy = r.CreatedBy.Employee is { } e ? $"{e.FirstName} {e.LastName}" : null;
        return new SignInfo(r.Title, r.SignerName, requestedBy, signatures.StatusOf(r), r.LinkExpiresAt);
    }

    [HttpPost]
    public async Task<IActionResult> Sign(string token, SignRequest request, CancellationToken ct) =>
        ToResult(await signatures.SignAsync(
            token,
            request.Image,
            HttpContext.Connection.RemoteIpAddress?.ToString(),
            Request.Headers.UserAgent.ToString(),
            ct));

    [HttpPost("decline")]
    public async Task<IActionResult> Decline(string token, CancellationToken ct) =>
        ToResult(await signatures.DeclineAsync(token, ct));

    private IActionResult ToResult(SignResult result) => result switch
    {
        SignResult.Ok => NoContent(),
        SignResult.NotFound => NotFound(),
        SignResult.NotPending => Problem(statusCode: StatusCodes.Status409Conflict, detail: "Ten link jest już nieaktywny (podpisano, odrzucono albo wygasł)."),
        _ => Problem(statusCode: StatusCodes.Status400BadRequest, detail: "Nieprawidłowy obraz podpisu."),
    };
}
