using System.Text.Json;

namespace Busola.Api.Agent.Tools;

public sealed class SearchKnowledgeTool(IKnowledgeBase knowledge) : IAgentTool
{
    public string Name => "search_knowledge";

    public string Description =>
        "Przeszukuje bazę wiedzy systemu: zasady, procedury, proces raportów, FAQ. Zwraca pasujące fragmenty z nazwą dokumentu.";

    public string Parameters => """
        {
          "type": "object",
          "properties": { "query": { "type": "string", "description": "Słowa kluczowe albo pytanie po polsku" } },
          "required": ["query"]
        }
        """;

    public string? RequiredPermission => null;

    public Task<string> ExecuteAsync(JsonElement arguments, CancellationToken ct)
    {
        var query = arguments.TryGetProperty("query", out var q) ? q.GetString() ?? "" : "";
        var results = knowledge.Search(query, limit: 5);

        return Task.FromResult(results.Count == 0
            ? "Brak pasujących fragmentów w bazie wiedzy."
            : string.Join("\n\n", results.Select(r => $"## {r.Title} (źródło: {r.Source})\n{r.Text}")));
    }
}
