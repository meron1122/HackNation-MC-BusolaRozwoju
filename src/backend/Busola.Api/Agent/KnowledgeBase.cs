using System.Text.RegularExpressions;

namespace Busola.Api.Agent;

public sealed record KnowledgeChunk(string Source, string Title, string Text);

/// <summary>Baza wiedzy agenta (RAG). Implementację można podmienić, np. na embeddingi, bez zmian w narzędziach.</summary>
public interface IKnowledgeBase
{
    IReadOnlyList<KnowledgeChunk> Search(string query, int limit);
}

/// <summary>
/// Pliki *.md z katalogu Agent/Knowledge, pocięte na fragmenty po nagłówkach, wyszukiwane po słowach.
/// shortcut: dopasowanie po rdzeniach słów (pierwsze 5 liter, zgrubnie pod polską odmianę), bez embeddingów;
/// gdy baza urośnie albo wyniki będą słabe, podmienić na embeddingi (np. pgvector) za IKnowledgeBase.
/// </summary>
public sealed partial class MarkdownKnowledgeBase(IReadOnlyList<KnowledgeChunk> chunks) : IKnowledgeBase
{
    private const int StemLength = 5;

    private readonly (KnowledgeChunk Chunk, HashSet<string> Stems, HashSet<string> TitleStems)[] index =
        chunks.Select(c => (c, Stems(c.Title + " " + c.Text), Stems(c.Title))).ToArray();

    public static MarkdownKnowledgeBase Load(string directory)
    {
        var files = Directory.Exists(directory) ? Directory.GetFiles(directory, "*.md", SearchOption.AllDirectories) : [];
        return new MarkdownKnowledgeBase(files.Order().SelectMany(f => Split(Path.GetRelativePath(directory, f), File.ReadAllText(f))).ToList());
    }

    /// <summary>Fragment = nagłówek markdown i tekst do następnego nagłówka. Tekst przed pierwszym nagłówkiem dostaje nazwę pliku.</summary>
    public static IEnumerable<KnowledgeChunk> Split(string source, string markdown)
    {
        var title = Path.GetFileNameWithoutExtension(source);
        var text = new List<string>();
        foreach (var line in markdown.Split('\n'))
        {
            if (line.StartsWith('#'))
            {
                if (text.Any(l => !string.IsNullOrWhiteSpace(l)))
                {
                    yield return new KnowledgeChunk(source, title, string.Join('\n', text).Trim());
                }

                title = line.TrimStart('#').Trim();
                text.Clear();
            }
            else
            {
                text.Add(line.TrimEnd('\r'));
            }
        }

        if (text.Any(l => !string.IsNullOrWhiteSpace(l)))
        {
            yield return new KnowledgeChunk(source, title, string.Join('\n', text).Trim());
        }
    }

    public IReadOnlyList<KnowledgeChunk> Search(string query, int limit)
    {
        var queryStems = Stems(query);
        return index
            .Select(e => (e.Chunk, Score: queryStems.Count(e.Stems.Contains) + queryStems.Count(e.TitleStems.Contains)))
            .Where(r => r.Score > 0)
            .OrderByDescending(r => r.Score)
            .Take(limit)
            .Select(r => r.Chunk)
            .ToList();
    }

    private static HashSet<string> Stems(string text) =>
        Word().Matches(text.ToLowerInvariant())
            .Select(m => m.Value)
            .Where(w => w.Length >= 3)
            .Select(w => w.Length > StemLength ? w[..StemLength] : w)
            .ToHashSet();

    [GeneratedRegex(@"\p{L}+|\d+")]
    private static partial Regex Word();
}
