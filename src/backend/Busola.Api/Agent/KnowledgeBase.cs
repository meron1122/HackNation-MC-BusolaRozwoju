using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using Busola.Database;
using Busola.Database.Entities;
using Microsoft.EntityFrameworkCore;

namespace Busola.Api.Agent;

/// <param name="Source">Dokument: tytuł aktu z nagłówka „# …” pliku (albo nazwa pliku).</param>
/// <param name="Title">Miejsce w dokumencie, np. „Rozdział 2 › § 5”.</param>
public sealed record KnowledgeChunk(string Source, string Title, string Text)
{
    /// <summary>Do embeddingu: dokument i miejsce dają fragmentowi kontekst („§ 5” sam nic nie znaczy).</summary>
    public string EmbeddingText => $"{Source}\n{Title}\n{Text}";

    public string Hash => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(EmbeddingText)));
}

/// <summary>Baza wiedzy agenta (RAG): przepisy i Q&amp;A z Agent/Knowledge/*.md.</summary>
public interface IKnowledgeBase
{
    Task<IReadOnlyList<KnowledgeChunk>> SearchAsync(string query, int limit, CancellationToken ct);
}

/// <summary>
/// Wyszukiwanie wektorowe, gdy indeks jest gotowy (KnowledgeIndexer), a do tego czasu albo bez klucza — po słowach.
/// shortcut: wektory w pamięci i podobieństwo liczone w C# — przy setkach/tysiącach fragmentów to ułamek milisekundy;
/// przy dziesiątkach tysięcy przenieść na pgvector (indeks HNSW) za tym samym interfejsem.
/// </summary>
public sealed partial class VectorKnowledgeBase(IReadOnlyList<KnowledgeChunk> chunks, IEmbeddingClient embeddings, ILogger<VectorKnowledgeBase> log)
    : IKnowledgeBase
{
    private readonly KeywordIndex keywords = new(chunks);
    private (KnowledgeChunk Chunk, float[] Vector)[] vectors = [];

    public IReadOnlyList<KnowledgeChunk> Chunks => chunks;

    public bool IsVectorReady => Volatile.Read(ref vectors).Length > 0;

    public void SetVectors(IEnumerable<(KnowledgeChunk Chunk, float[] Vector)> index) =>
        Volatile.Write(ref vectors, index.ToArray());

    public async Task<IReadOnlyList<KnowledgeChunk>> SearchAsync(string query, int limit, CancellationToken ct)
    {
        var index = Volatile.Read(ref vectors);
        if (index.Length > 0)
        {
            try
            {
                var q = (await embeddings.EmbedAsync([query], ct))[0];
                return index
                    .Select(e => (e.Chunk, Score: Dot(q, e.Vector)))
                    .OrderByDescending(e => e.Score)
                    .Take(limit)
                    .Select(e => e.Chunk)
                    .ToList();
            }
            catch (LlmUnavailableException e)
            {
                log.LogWarning("Wyszukiwanie wektorowe niedostępne ({Message}), szukam po słowach.", e.Message);
            }
        }

        return keywords.Search(query, limit);
    }

    private static float Dot(float[] a, float[] b)
    {
        var sum = 0f;
        for (var i = 0; i < Math.Min(a.Length, b.Length); i++)
        {
            sum += a[i] * b[i];
        }

        return sum;
    }

    public static IReadOnlyList<KnowledgeChunk> LoadDirectory(string directory)
    {
        var files = Directory.Exists(directory) ? Directory.GetFiles(directory, "*.md", SearchOption.AllDirectories) : [];
        return files.Order().SelectMany(f => Split(Path.GetFileNameWithoutExtension(f), File.ReadAllText(f))).ToList();
    }

    /// <summary>Długie artykuły tniemy na okna, żeby embedding nie rozmywał treści i model nie dostawał ścian tekstu.</summary>
    private const int MaxChunkChars = 2000;

    /// <summary>
    /// Fragment = tekst pod nagłówkiem (## / ### …) do następnego nagłówka. Tytuł fragmentu to ścieżka nagłówków
    /// („Rozdział 2 › § 5”), dokument to nagłówek „# …” pliku.
    /// </summary>
    public static IEnumerable<KnowledgeChunk> Split(string fileName, string markdown)
    {
        var document = fileName;
        var path = new SortedDictionary<int, string>();
        var text = new List<string>();

        IEnumerable<KnowledgeChunk> Flush()
        {
            var body = string.Join('\n', text).Trim();
            text.Clear();
            if (body.Length == 0)
            {
                yield break;
            }

            var title = path.Count == 0 ? document : string.Join(" › ", path.Values);
            var parts = Windows(body).ToList();
            for (var i = 0; i < parts.Count; i++)
            {
                yield return new KnowledgeChunk(document, parts.Count == 1 ? title : $"{title} (cz. {i + 1})", parts[i]);
            }
        }

        foreach (var raw in markdown.Split('\n'))
        {
            var line = raw.TrimEnd('\r');
            var heading = Heading().Match(line);
            if (!heading.Success)
            {
                text.Add(line);
                continue;
            }

            foreach (var chunk in Flush())
            {
                yield return chunk;
            }

            var level = heading.Groups[1].Length;
            var name = heading.Groups[2].Value.Trim();
            if (level == 1)
            {
                document = name;
                path.Clear();
                continue;
            }

            foreach (var deeper in path.Keys.Where(k => k >= level).ToList())
            {
                path.Remove(deeper);
            }

            path[level] = name;
        }

        foreach (var chunk in Flush())
        {
            yield return chunk;
        }
    }

    private static IEnumerable<string> Windows(string body)
    {
        if (body.Length <= MaxChunkChars)
        {
            yield return body;
            yield break;
        }

        var current = new StringBuilder();
        foreach (var paragraph in body.Split('\n'))
        {
            if (current.Length > 0 && current.Length + paragraph.Length > MaxChunkChars)
            {
                yield return current.ToString().Trim();
                current.Clear();
            }

            current.AppendLine(paragraph);
        }

        if (current.Length > 0)
        {
            yield return current.ToString().Trim();
        }
    }

    [GeneratedRegex(@"^(#{1,6})\s+(.+)$")]
    private static partial Regex Heading();
}

/// <summary>Zapasowe wyszukiwanie po rdzeniach słów (pierwsze 5 liter, zgrubnie pod polską odmianę).</summary>
internal sealed partial class KeywordIndex(IReadOnlyList<KnowledgeChunk> chunks)
{
    private const int StemLength = 5;

    private readonly (KnowledgeChunk Chunk, HashSet<string> Stems, HashSet<string> TitleStems)[] index =
        chunks.Select(c => (c, Stems(c.Title + " " + c.Text), Stems(c.Title))).ToArray();

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

/// <summary>
/// Po starcie liczy brakujące embeddingi (tylko dla nowych/zmienionych fragmentów), zapisuje je w bazie
/// i włącza wyszukiwanie wektorowe. Bez klucza nic nie robi — agent szuka wtedy po słowach.
/// </summary>
public sealed class KnowledgeIndexer(
    VectorKnowledgeBase knowledge, IEmbeddingClient embeddings, IServiceScopeFactory scopes, ILogger<KnowledgeIndexer> log)
    : BackgroundService
{
    private const int BatchSize = 64;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!embeddings.IsConfigured)
        {
            log.LogInformation("Baza wiedzy: {Count} fragmentów, bez embeddingów (brak klucza) — wyszukiwanie po słowach.", knowledge.Chunks.Count);
            return;
        }

        try
        {
            using var scope = scopes.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<BusolaDbContext>();
            var model = embeddings.Model;
            var byHash = knowledge.Chunks.GroupBy(c => c.Hash).ToDictionary(g => g.Key, g => g.First());

            var stored = await db.KnowledgeEmbeddings.AsNoTracking()
                .Where(e => e.Model == model)
                .ToDictionaryAsync(e => e.Hash, e => e.Vector, stoppingToken);

            var missing = byHash.Keys.Where(h => !stored.ContainsKey(h)).ToList();
            foreach (var batch in missing.Chunk(BatchSize))
            {
                var vectors = await embeddings.EmbedAsync(batch.Select(h => byHash[h].EmbeddingText).ToList(), stoppingToken);
                for (var i = 0; i < batch.Length; i++)
                {
                    stored[batch[i]] = vectors[i];
                    db.KnowledgeEmbeddings.Add(new KnowledgeEmbedding { Hash = batch[i], Model = model, Vector = vectors[i] });
                }

                await db.SaveChangesAsync(stoppingToken);
            }

            var current = byHash.Keys.ToList();
            var removed = await db.KnowledgeEmbeddings
                .Where(e => e.Model != model || !current.Contains(e.Hash))
                .ExecuteDeleteAsync(stoppingToken);

            knowledge.SetVectors(knowledge.Chunks.Select(c => (c, stored[c.Hash])));
            log.LogInformation(
                "Baza wiedzy: {Count} fragmentów, {New} nowych embeddingów ({Model}), {Removed} usuniętych — wyszukiwanie wektorowe włączone.",
                knowledge.Chunks.Count, missing.Count, model, removed);
        }
        catch (Exception e) when (e is not OperationCanceledException)
        {
            log.LogError(e, "Indeksowanie bazy wiedzy nie powiodło się — agent szuka po słowach.");
        }
    }
}
