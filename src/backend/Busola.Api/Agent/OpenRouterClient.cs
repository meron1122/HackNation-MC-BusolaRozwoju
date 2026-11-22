using System.Net.Http.Headers;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.Extensions.Options;

namespace Busola.Api.Agent;

public sealed class OpenRouterOptions
{
    public const string SectionName = "OpenRouter";

    public string ApiKey { get; init; } = "";

    /// <summary>Slug modelu z openrouter.ai/models.</summary>
    public string Model { get; init; } = "";

    /// <summary>Model embeddingów do bazy wiedzy (openrouter.ai/models, filtr: embeddings). Zmiana = przeliczenie wektorów.</summary>
    public string EmbeddingModel { get; init; } = "openai/text-embedding-3-small";

    /// <summary>Adres API zgodnego z OpenAI; inny tylko do testów (atrapa modelu) albo innego dostawcy.</summary>
    public string BaseUrl { get; init; } = "https://openrouter.ai/api/v1/";
}

/// <summary>OpenRouter przez endpoint chat completions (format OpenAI, z narzędziami jako "function").</summary>
public sealed class OpenRouterClient(HttpClient http, IOptions<OpenRouterOptions> options, ILogger<OpenRouterClient> log)
    : ILlmClient
{
    public async Task<LlmMessage> CompleteAsync(
        IReadOnlyList<LlmMessage> messages, IReadOnlyList<IAgentTool> tools, CancellationToken ct)
    {
        var o = options.Value;
        if (string.IsNullOrWhiteSpace(o.ApiKey) || string.IsNullOrWhiteSpace(o.Model))
        {
            throw new LlmUnavailableException("Agent AI nie jest skonfigurowany (OpenRouter:ApiKey i OpenRouter:Model).");
        }

        var body = new JsonObject
        {
            ["model"] = o.Model,
            ["temperature"] = 0, // najmniej „twórczości” = najmniej zmyślania
            ["messages"] = new JsonArray(messages.Select(ToJson).ToArray<JsonNode?>()),
        };
        if (tools.Count > 0)
        {
            body["tools"] = new JsonArray(tools.Select(t => (JsonNode?)new JsonObject
            {
                ["type"] = "function",
                ["function"] = new JsonObject
                {
                    ["name"] = t.Name,
                    ["description"] = t.Description,
                    ["parameters"] = JsonNode.Parse(t.Parameters),
                },
            }).ToArray());
        }

        using var request = new HttpRequestMessage(HttpMethod.Post, "chat/completions")
        {
            Content = new StringContent(body.ToJsonString(), System.Text.Encoding.UTF8, "application/json"),
        };
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", o.ApiKey);

        using var response = await http.SendAsync(request, ct);
        var text = await response.Content.ReadAsStringAsync(ct);

        // OpenRouter potrafi zwrócić błąd także przy 200 (pole "error").
        using var doc = TryParse(text);
        if (!response.IsSuccessStatusCode || doc is null || doc.RootElement.TryGetProperty("error", out _))
        {
            log.LogError("OpenRouter {Status}: {Body}", (int)response.StatusCode, text);
            throw new LlmUnavailableException("Model AI jest chwilowo niedostępny.");
        }

        var message = doc.RootElement.GetProperty("choices")[0].GetProperty("message");
        var content = message.TryGetProperty("content", out var c) && c.ValueKind == JsonValueKind.String ? c.GetString() : null;
        List<ToolCall>? toolCalls = null;
        if (message.TryGetProperty("tool_calls", out var calls) && calls.ValueKind == JsonValueKind.Array)
        {
            toolCalls = calls.EnumerateArray()
                .Select(call => new ToolCall(
                    call.GetProperty("id").GetString()!,
                    call.GetProperty("function").GetProperty("name").GetString()!,
                    call.GetProperty("function").TryGetProperty("arguments", out var a) ? a.GetString() ?? "" : ""))
                .ToList();
        }

        return new LlmMessage("assistant", content, toolCalls);
    }

    private static JsonDocument? TryParse(string text)
    {
        try
        {
            return JsonDocument.Parse(text);
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static JsonObject ToJson(LlmMessage m)
    {
        var json = new JsonObject { ["role"] = m.Role, ["content"] = m.Content };
        if (m.ToolCallId is not null)
        {
            json["tool_call_id"] = m.ToolCallId;
        }

        if (m.ToolCalls is { Count: > 0 })
        {
            json["tool_calls"] = new JsonArray(m.ToolCalls.Select(t => (JsonNode?)new JsonObject
            {
                ["id"] = t.Id,
                ["type"] = "function",
                ["function"] = new JsonObject { ["name"] = t.Name, ["arguments"] = t.Arguments },
            }).ToArray());
        }

        return json;
    }
}
