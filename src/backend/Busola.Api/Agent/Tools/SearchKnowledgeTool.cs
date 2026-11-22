using System.Text.Json;

namespace Busola.Api.Agent.Tools;

public sealed class SearchKnowledgeTool(IKnowledgeBase knowledge) : IAgentTool
{
    public string Name => "search_knowledge";

    public string Description =>
        "Przeszukuje bazę wiedzy: rozporządzenia o ocenie okresowej (2016) i pierwszej ocenie (2015), ustawę o służbie cywilnej, "
        + "poradniki KPRM o ocenie okresowej i pierwszej ocenie (strony), model kompetencji (wskaźniki i opisy 5 poziomów), "
        + "wzory arkuszy oraz przykładowe opisy stanowisk (OSP). Wyszukiwanie semantyczne: pytaj pełnym zdaniem. "
        + "Zwraca fragmenty z dokumentem i miejscem (paragraf, artykuł, strona, wskaźnik).";

    public string Parameters => """
        {
          "type": "object",
          "properties": { "query": { "type": "string", "description": "Słowa kluczowe albo pytanie po polsku" } },
          "required": ["query"]
        }
        """;

    public string? RequiredPermission => null;

    public async Task<string> ExecuteAsync(JsonElement arguments, CancellationToken ct)
    {
        var query = arguments.TryGetProperty("query", out var q) ? q.GetString() ?? "" : "";
        var results = await knowledge.SearchAsync(query, limit: 6, ct);

        return results.Count == 0
            ? "Brak pasujących fragmentów w bazie wiedzy."
            : string.Join("\n\n", results.Select(r => $"## {r.Source} — {r.Title}\n{r.Text}"));
    }
}
