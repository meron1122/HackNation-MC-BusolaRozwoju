using Busola.Api.Signatures;
using Busola.Database.Authorization;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Busola.Api.Controllers;

/// <summary>Zakładka Dev: testowe prośby o podpis w pamięci (bez bazy). Tylko SuperAdmin.</summary>
[ApiController]
[Route("api/dev/signatures")]
[Authorize(Roles = RoleNames.SuperAdmin)]
public sealed class DevSignaturesController(DevSignatureStore store) : ControllerBase
{
    [HttpPost]
    public ActionResult<SignaturesController.CreateResponse> Create(SignaturesController.CreateRequest request)
    {
        try
        {
            var (dto, token) = store.Create(request.Title, request.SignerName);
            return new SignaturesController.CreateResponse(dto, token);
        }
        catch (InvalidOperationException e)
        {
            return Problem(statusCode: StatusCodes.Status429TooManyRequests, detail: e.Message);
        }
    }

    [HttpGet("{id:guid}")]
    public ActionResult<SignatureRequestDto> Get(Guid id) => store.Get(id) is { } e ? store.ToDto(e) : NotFound();

    [HttpGet("{id:guid}/image")]
    public IActionResult Image(Guid id) => store.Get(id)?.Image is { } image ? File(image, "image/png") : NotFound();
}

/// <summary>Publiczna strona testowego podpisu (/podpis-test/{token}): te same odpowiedzi co SignController.</summary>
[ApiController]
[Route("api/dev/sign/{token}")]
[AllowAnonymous]
public sealed class DevSignController(DevSignatureStore store) : ControllerBase
{
    [HttpGet]
    public ActionResult<SignController.SignInfo> Get(string token) =>
        store.FindByToken(token) is { } e
            ? new SignController.SignInfo(e.Title, e.SignerName, null, e.Status.ToString(), e.ExpiresAt)
            : NotFound();

    [HttpPost]
    public IActionResult Sign(string token, SignController.SignRequest request) =>
        ToResult(store.Sign(token, request.Image, Request.Headers.UserAgent.ToString()));

    [HttpPost("decline")]
    public IActionResult Decline(string token) => ToResult(store.Decline(token));

    private IActionResult ToResult(SignResult result) => result switch
    {
        SignResult.Ok => NoContent(),
        SignResult.NotFound => NotFound(),
        SignResult.NotPending => Problem(statusCode: StatusCodes.Status409Conflict, detail: "Ten link jest już nieaktywny (podpisano, odrzucono albo wygasł)."),
        _ => Problem(statusCode: StatusCodes.Status400BadRequest, detail: "Nieprawidłowy obraz podpisu."),
    };
}
