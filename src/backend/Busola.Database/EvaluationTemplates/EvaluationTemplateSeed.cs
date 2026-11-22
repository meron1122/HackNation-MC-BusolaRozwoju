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
        Load(1, "first", 1, EvaluationKind.First, active: false),
        Load(2, "periodic-b", 1, EvaluationKind.Periodic, active: false),
        Load(3, "periodic-c", 1, EvaluationKind.Periodic, active: false),

        // v2: model kompetencji — wskaźniki behawioralne z opisami poziomów.
        Load(4, "first", 2, EvaluationKind.First, active: false),
        Load(5, "periodic-b", 2, EvaluationKind.Periodic, active: false),
        Load(6, "periodic-c", 2, EvaluationKind.Periodic, active: false),

        // v3: fazy etapów, etap samooceny, odwołania do przepisów (§), pola liczone przez backend,
        // uzasadnienie wymagane przy ocenie negatywnej, wnioski rozwojowe pierwszej oceny tylko przy pozytywnej.
        Load(7, "first", 3, EvaluationKind.First, active: false),
        Load(8, "periodic-b", 3, EvaluationKind.Periodic, active: true),
        Load(9, "periodic-c", 3, EvaluationKind.Periodic, active: true),

        // first v4: podpis ocenianego pod sprawozdaniem (formularz z załącznika nr 3), „sprawozdanie złożone
        // w wyznaczonym terminie” wyliczane z etapu sprawozdania (prefill report.onTime), domyślny termin sprawozdania
        // od 7. do 10. miesiąca (§ 6 ust. 1: co najmniej 7 miesięcy pracy) — przełożony wyznacza go na rozmowie wstępnej.
        Load(10, "first", 4, EvaluationKind.First, active: false),

        // first v5: termin sprawozdania po upływie 8 miesięcy od nawiązania stosunku pracy (§ 4 ust. 1), nie od 7.
        Load(11, "first", 5, EvaluationKind.First, active: true),
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
