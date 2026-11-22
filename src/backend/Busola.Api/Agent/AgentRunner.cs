using System.Security.Claims;
using System.Text.Json;
using Busola.Api.Authorization;

namespace Busola.Api.Agent;

/// <summary>
/// Narzędzie agenta. Rejestracja: services.AddScoped&lt;IAgentTool, MojeNarzedzie&gt;() w AddAgent.
/// Narzędzie działa w żądaniu zalogowanego użytkownika, więc dane filtruje tak samo jak kontrolery
/// (AccessScopeService + InScope). Wynik to tekst/JSON dla modelu.
/// </summary>
public interface IAgentTool
{
    /// <summary>Nazwa dla modelu: [a-z0-9_].</summary>
    string Name { get; }

    string Description { get; }

    /// <summary>JSON Schema argumentów (typ "object").</summary>
    string Parameters { get; }

    /// <summary>Klucz z Permissions; bez niego model w ogóle nie dostaje narzędzia. null = każdy zalogowany.</summary>
    string? RequiredPermission { get; }

    Task<string> ExecuteAsync(JsonElement arguments, CancellationToken ct);
}

/// <summary>Pętla agenta: model → wywołania narzędzi → wyniki → model, aż do odpowiedzi tekstowej.</summary>
public sealed class AgentRunner(
    ILlmClient llm, IEnumerable<IAgentTool> tools, IHttpContextAccessor httpContextAccessor, ILogger<AgentRunner> log)
{
    private const int MaxSteps = 8;

    public async Task<string> RunAsync(IReadOnlyList<LlmMessage> conversation, string screen, CancellationToken ct)
    {
        var user = httpContextAccessor.HttpContext?.User ?? throw new InvalidOperationException("Brak kontekstu HTTP.");
        var available = tools.Where(t => t.RequiredPermission is null || user.HasPermission(t.RequiredPermission)).ToList();

        List<LlmMessage> messages = [new("system", AgentPrompt.System(user.FindFirstValue(BusolaClaims.Name), screen)), .. conversation];

        for (var step = 0; step < MaxSteps; step++)
        {
            var reply = await llm.CompleteAsync(messages, available, ct);
            messages.Add(reply);
            if (reply.ToolCalls is not { Count: > 0 })
            {
                return reply.Content ?? "";
            }

            foreach (var call in reply.ToolCalls)
            {
                messages.Add(new LlmMessage("tool", await ExecuteAsync(call, available, ct), ToolCallId: call.Id));
            }
        }

        return "Nie udało się ułożyć odpowiedzi w limicie kroków. Spróbuj zadać węższe pytanie.";
    }

    // Błędy wracają do modelu jako tekst, żeby mógł poprawić wywołanie; szczegóły tylko w logach.
    private async Task<string> ExecuteAsync(ToolCall call, IReadOnlyList<IAgentTool> available, CancellationToken ct)
    {
        var tool = available.FirstOrDefault(t => t.Name == call.Name);
        if (tool is null)
        {
            return $"Błąd: narzędzie {call.Name} nie istnieje albo użytkownik nie ma do niego uprawnień.";
        }

        try
        {
            using var args = JsonDocument.Parse(string.IsNullOrWhiteSpace(call.Arguments) ? "{}" : call.Arguments);
            return await tool.ExecuteAsync(args.RootElement, ct);
        }
        catch (JsonException)
        {
            return "Błąd: argumenty nie są poprawnym JSON-em.";
        }
        catch (Exception e) when (e is not OperationCanceledException)
        {
            log.LogError(e, "Narzędzie agenta {Tool} rzuciło wyjątek", call.Name);
            return "Błąd wykonania narzędzia.";
        }
    }
}
