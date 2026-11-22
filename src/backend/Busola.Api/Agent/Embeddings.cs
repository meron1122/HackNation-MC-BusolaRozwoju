using System.Net.Http.Headers;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.Extensions.Options;

namespace Busola.Api.Agent;

/// <summary>Embeddingi tekstu (RAG). Wektory są znormalizowane, więc podobieństwo = iloczyn skalarny.</summary>
public interface IEmbeddingClient
{
    bool IsConfigured { get; }

    /// <summary>Model zapisywany przy wektorach: zmiana modelu = przeliczenie bazy.</summary>
    string Model { get; }

    Task<float[][]> EmbedAsync(IReadOnlyList<string> inputs, CancellationToken ct);
}

/// <summary>OpenRouter /embeddings (format OpenAI), ten sam klucz co czat.</summary>
public sealed class OpenRouterEmbeddingClient(HttpClient http, IOptions<OpenRouterOptions> options, ILogger<OpenRouterEmbeddingClient> log)
    : IEmbeddingClient
{
    public bool IsConfigured => !string.IsNullOrWhiteSpace(options.Value.ApiKey) && !string.IsNullOrWhiteSpace(Model);

    public string Model => options.Value.EmbeddingModel;

    public async Task<float[][]> EmbedAsync(IReadOnlyList<string> inputs, CancellationToken ct)
    {
        if (!IsConfigured)
        {
            throw new LlmUnavailableException("Embeddingi nie są skonfigurowane (OpenRouter:ApiKey i OpenRouter:EmbeddingModel).");
        }

        var body = new JsonObject { ["model"] = Model, ["input"] = new JsonArray(inputs.Select(i => (JsonNode?)i).ToArray()) };
        using var request = new HttpRequestMessage(HttpMethod.Post, "embeddings")
        {
            Content = new StringContent(body.ToJsonString(), System.Text.Encoding.UTF8, "application/json"),
        };
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", options.Value.ApiKey);

        using var response = await http.SendAsync(request, ct);
        var text = await response.Content.ReadAsStringAsync(ct);
        JsonDocument? doc = null;
        try
        {
            doc = JsonDocument.Parse(text);
        }
        catch (JsonException)
        {
        }

        using (doc)
        {
            if (!response.IsSuccessStatusCode || doc is null || !doc.RootElement.TryGetProperty("data", out var data))
            {
                log.LogError("OpenRouter embeddings {Status}: {Body}", (int)response.StatusCode, text);
                throw new LlmUnavailableException("Embeddingi są chwilowo niedostępne.");
            }

            var vectors = new float[inputs.Count][];
            foreach (var item in data.EnumerateArray())
            {
                var v = item.GetProperty("embedding").EnumerateArray().Select(x => x.GetSingle()).ToArray();
                vectors[item.GetProperty("index").GetInt32()] = Normalize(v);
            }

            return vectors;
        }
    }

    private static float[] Normalize(float[] v)
    {
        var norm = MathF.Sqrt(v.Sum(x => x * x));
        return norm == 0 ? v : v.Select(x => x / norm).ToArray();
    }
}
