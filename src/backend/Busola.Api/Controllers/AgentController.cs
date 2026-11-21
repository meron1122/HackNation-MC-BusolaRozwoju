using System.ComponentModel.DataAnnotations;
using Busola.Api.Agent;
using Microsoft.AspNetCore.Mvc;

namespace Busola.Api.Controllers;

/// <summary>Czat z agentem. Bezstanowy: klient przysyła całą rozmowę (tylko tekst), agent działa z uprawnieniami użytkownika.</summary>
[ApiController]
[Route("api/agent")]
public sealed class AgentController(AgentRunner agent) : ControllerBase
{
    public sealed record ChatMessage([Required] string Role, [Required, MaxLength(8000)] string Content);

    public sealed record ChatRequest([Required, MinLength(1), MaxLength(40)] IReadOnlyList<ChatMessage> Messages);

    public sealed record ChatResponse(string Reply);

    [HttpPost("chat")]
    public async Task<ActionResult<ChatResponse>> Chat(ChatRequest request, CancellationToken ct)
    {
        if (request.Messages.Any(m => m.Role is not ("user" or "assistant")) || request.Messages[^1].Role != "user")
        {
            return Problem(
                statusCode: StatusCodes.Status400BadRequest,
                detail: "Wiadomości mają role user/assistant, a ostatnia musi być od użytkownika.");
        }

        try
        {
            var reply = await agent.RunAsync(request.Messages.Select(m => new LlmMessage(m.Role, m.Content)).ToList(), ct);
            return new ChatResponse(reply);
        }
        catch (LlmUnavailableException e)
        {
            return Problem(statusCode: StatusCodes.Status503ServiceUnavailable, detail: e.Message);
        }
    }
}
