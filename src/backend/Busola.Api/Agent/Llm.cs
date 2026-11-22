namespace Busola.Api.Agent;

/// <summary>Wywołanie narzędzia zażądane przez model. Arguments to surowy JSON z modelu (może być niepoprawny).</summary>
public sealed record ToolCall(string Id, string Name, string Arguments);

/// <summary>
/// Wiadomość w formacie wspólnym dla dostawców (wzorowanym na chat completions).
/// Role: system, user, assistant (może mieć ToolCalls), tool (ma ToolCallId).
/// </summary>
public sealed record LlmMessage(
    string Role,
    string? Content,
    IReadOnlyList<ToolCall>? ToolCalls = null,
    string? ToolCallId = null);

/// <summary>Dostawca modelu. Podmiana dostawcy = nowa implementacja i jedna linia w AddAgent.</summary>
public interface ILlmClient
{
    Task<LlmMessage> CompleteAsync(IReadOnlyList<LlmMessage> messages, IReadOnlyList<IAgentTool> tools, CancellationToken ct);
}

/// <summary>Model niedostępny: brak konfiguracji albo błąd dostawcy. API zwraca wtedy 503.</summary>
public sealed class LlmUnavailableException(string message) : Exception(message);

public static class ProviderHttp
{
    /// <summary>Brak sieci albo timeout u dostawcy = „asystent chwilowo niedostępny” (503), a nie błąd 500.</summary>
    public static async Task<HttpResponseMessage> SendToProviderAsync(
        this HttpClient http, HttpRequestMessage request, ILogger log, CancellationToken ct)
    {
        try
        {
            return await http.SendAsync(request, ct);
        }
        catch (Exception e) when (e is HttpRequestException || (e is TaskCanceledException && !ct.IsCancellationRequested))
        {
            log.LogError(e, "Dostawca modelu nieosiągalny: {Url}", request.RequestUri);
            throw new LlmUnavailableException("Asystent jest chwilowo niedostępny. Spróbuj ponownie za chwilę.");
        }
    }
}
