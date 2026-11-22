using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using Busola.Api.Agent;
using Busola.Api.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace Busola.Api.Controllers;

/// <summary>
/// Czat z asystentem. Bezstanowy: klient przysyła całą rozmowę (tylko tekst) i to, na co patrzy (identyfikatory),
/// a agent dociąga dane i działa z uprawnieniami zalogowanego użytkownika.
/// </summary>
[ApiController]
[Route("api/agent")]
[EnableRateLimiting(AgentServiceCollectionExtensions.RateLimitPolicy)]
public sealed class AgentController(AgentRunner agent, ScreenContextService screens, AgentGuard guard) : ControllerBase
{
    /// <summary>Pytanie użytkownika: krótko, bo długie wklejki to typowy nośnik prób obejścia zasad.</summary>
    private const int MaxQuestionLength = 2000;

    /// <param name="Signature">Podpis odpowiedzi asystenta z ChatResponse; bez niego historia jest odrzucana.</param>
    public sealed record ChatMessage([Required] string Role, [Required, MaxLength(8000)] string Content, string? Signature = null);

    public sealed record ChatRequest([Required, MinLength(1), MaxLength(20)] IReadOnlyList<ChatMessage> Messages, ScreenContext? Context = null);

    /// <param name="Unverified">Odwołania z odpowiedzi, których model nie dostał w materiale (możliwa halucynacja).</param>
    public sealed record ChatResponse(string Reply, string ContextLabel, string Signature, IReadOnlyList<string> Unverified);

    public sealed record ContextResponse(string Label);

    /// <summary>Co asystent „widzi” na tym ekranie — etykieta w oknie czatu, zanim padnie pytanie.</summary>
    [HttpPost("context")]
    public async Task<ContextResponse> Context(ScreenContext context, CancellationToken ct) =>
        new((await screens.DescribeAsync(context, ct)).Label);

    [HttpPost("chat")]
    public async Task<ActionResult<ChatResponse>> Chat(ChatRequest request, CancellationToken ct)
    {
        if (request.Messages.Any(m => m.Role is not ("user" or "assistant")) || request.Messages[^1].Role != "user")
        {
            return Problem(
                statusCode: StatusCodes.Status400BadRequest,
                detail: "Wiadomości mają role user/assistant, a ostatnia musi być od użytkownika.");
        }

        if (request.Messages.Any(m => m.Role == "user" && m.Content.Length > MaxQuestionLength))
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, detail: $"Pytanie może mieć najwyżej {MaxQuestionLength} znaków.");
        }

        var userId = User.FindFirstValue(BusolaClaims.UserId)!;
        if (request.Messages.Any(m => m.Role == "assistant" && !guard.Verify(userId, m.Content, m.Signature)))
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest,
                detail: "Historia rozmowy nie pochodzi z tego asystenta. Zacznij nową rozmowę.");
        }

        var screen = await screens.DescribeAsync(request.Context, ct);
        try
        {
            var (reply, unverified) = await agent.RunAsync(request.Messages.Select(m => new LlmMessage(m.Role, m.Content)).ToList(), screen.Prompt, ct);
            return new ChatResponse(reply, screen.Label, guard.Sign(userId, reply), unverified);
        }
        catch (LlmUnavailableException e)
        {
            return Problem(statusCode: StatusCodes.Status503ServiceUnavailable, detail: e.Message);
        }
    }
}
