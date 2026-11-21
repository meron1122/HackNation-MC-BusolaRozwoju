using System.Text.Encodings.Web;
using System.Text.Json;
using Busola.Database.Entities;

namespace Busola.Database.EvaluationTemplates;

/// <summary>
/// Szablony z plików &lt;kod&gt;.v&lt;wersja&gt;.json, wgrywane migracją.
/// Nowe pole: skopiuj ostatnią wersję jako kolejną, dopisz ją tu z kolejnym Id (aktywna), poprzednią oznacz
/// jako nieaktywną i dodaj migrację. Nie edytuj opublikowanej wersji — trwające oceny są prowadzone według niej.
/// </summary>
internal static class EvaluationTemplateSeed
{
    public static readonly EvaluationTemplate[] Templates =
    [
        Load(1, "first", 1, EvaluationKind.First, active: true),
        Load(2, "periodic-b", 1, EvaluationKind.Periodic, active: true),
        Load(3, "periodic-c", 1, EvaluationKind.Periodic, active: true),
    ];

    private static EvaluationTemplate Load(int id, string code, int version, EvaluationKind kind, bool active)
    {
        var resource = $"EvaluationTemplates.{code}.v{version}.json";
        using var stream = typeof(EvaluationTemplateSeed).Assembly.GetManifestResourceStream(resource)
            ?? throw new InvalidOperationException($"Brak zasobu {resource}.");
        using var document = JsonDocument.Parse(stream);

        var schema = document.RootElement.Deserialize<TemplateSchema>(TemplateSchema.JsonOptions)!;
        schema.Validate();

        return new EvaluationTemplate
        {
            Id = id,
            Code = code,
            Version = version,
            Kind = kind,
            Title = schema.Title,
            Schema = Canonical(document.RootElement),
            IsActive = active,
        };
    }

    // Zwarty zapis bez zależności od końców linii w pliku (autocrlf), żeby migracje nie widziały fałszywych zmian.
    private static string Canonical(JsonElement element)
    {
        using var buffer = new MemoryStream();
        using (var writer = new Utf8JsonWriter(buffer, new JsonWriterOptions { Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping }))
        {
            element.WriteTo(writer);
        }

        return System.Text.Encoding.UTF8.GetString(buffer.ToArray());
    }
}
