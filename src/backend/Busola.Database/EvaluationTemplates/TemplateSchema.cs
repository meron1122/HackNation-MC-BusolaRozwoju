using System.Text.Json;
using System.Text.Json.Serialization;

namespace Busola.Database.EvaluationTemplates;

/// <summary>
/// Kontrakt szablonu arkusza (kolumna evaluation_templates.schema, jsonb). Szablon opisuje tylko strukturę:
/// etapy z regułami terminów, słownik statusów, sekcje i pola, skale i reguły oceny.
/// Dane konkretnej oceny (status, terminy, daty) są w zwykłych kolumnach evaluations / evaluation_stages.
/// </summary>
public sealed record TemplateSchema(
    int SchemaVersion,
    string Title,
    string InitialStatus,
    IReadOnlyList<StatusDefinition> Statuses,
    IReadOnlyList<StageDefinition> Stages,
    IReadOnlyList<SectionDefinition> Sections,
    IReadOnlyDictionary<string, IReadOnlyList<ScaleOption>> Scales,
    string? AppliesTo = null,
    string? LegalBasis = null,
    JsonElement? Scoring = null,
    CompetencyModel? CompetencyModel = null)
{
    public static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        RespectRequiredConstructorParameters = true,
        RespectNullableAnnotations = true,
    };

    public static readonly IReadOnlySet<string> FieldTypes = new HashSet<string>
    {
        "text", "longText", "date", "dateRange", "year", "choice", "person", "signature",
        "scores", "average", "level", "criteriaSelection", "notice", "indicatorScores",
    };

    public static TemplateSchema Parse(string json) =>
        JsonSerializer.Deserialize<TemplateSchema>(json, JsonOptions)
        ?? throw new InvalidDataException("Pusty szablon.");

    /// <summary>Sprawdza spójność odwołań (etapy, statusy, pola, skale). Rzuca z listą wszystkich błędów.</summary>
    public void Validate()
    {
        var errors = new List<string>();
        var statusKeys = Unique(Statuses.Select(s => s.Key), "status", errors);
        var stageKeys = new List<string>();
        var fields = Sections.SelectMany(s => s.Fields).ToList();
        var fieldKeys = Unique(fields.Select(f => f.Key), "pole", errors);
        Unique(Sections.Select(s => s.Key), "sekcja", errors);

        if (!statusKeys.Contains(InitialStatus))
        {
            errors.Add($"initialStatus '{InitialStatus}' nie jest zdefiniowany.");
        }

        foreach (var stage in Stages)
        {
            if (stageKeys.Contains(stage.Key))
            {
                errors.Add($"Powtórzony etap '{stage.Key}'.");
            }

            if (!statusKeys.Contains(stage.CompletesTo))
            {
                errors.Add($"Etap '{stage.Key}': nieznany status completesTo '{stage.CompletesTo}'.");
            }

            // Terminy mogą zależeć tylko od startu albo od etapu wcześniejszego — bez cykli.
            if (stage.Deadline is { } deadline
                && deadline.Anchor != DeadlineRule.StartAnchor
                && !(deadline.Anchor.StartsWith(DeadlineRule.StageAnchorPrefix)
                     && stageKeys.Contains(deadline.Anchor[DeadlineRule.StageAnchorPrefix.Length..])))
            {
                errors.Add($"Etap '{stage.Key}': anchor '{deadline.Anchor}' musi być 'start' albo 'stage:<wcześniejszy etap>'.");
            }

            stageKeys.Add(stage.Key);
        }

        foreach (var section in Sections)
        {
            if (!stageKeys.Contains(section.Stage))
            {
                errors.Add($"Sekcja '{section.Key}': nieznany etap '{section.Stage}'.");
            }

            CheckCondition(section.VisibleWhen, $"Sekcja '{section.Key}'");
        }

        foreach (var field in fields)
        {
            if (!FieldTypes.Contains(field.Type))
            {
                errors.Add($"Pole '{field.Key}': nieznany typ '{field.Type}'.");
            }

            if (field.Extra?.GetValueOrDefault("scale") is { ValueKind: JsonValueKind.String } scale
                && !Scales.ContainsKey(scale.GetString()!))
            {
                errors.Add($"Pole '{field.Key}': nieznana skala '{scale.GetString()}'.");
            }

            foreach (var reference in new[] { "of", "itemsFrom" })
            {
                if (field.Extra?.GetValueOrDefault(reference) is { ValueKind: JsonValueKind.String } target
                    && !fieldKeys.Contains(target.GetString()!))
                {
                    errors.Add($"Pole '{field.Key}': {reference} wskazuje nieistniejące pole '{target.GetString()}'.");
                }
            }

            CheckCondition(field.VisibleWhen, $"Pole '{field.Key}'");
            CheckCondition(field.RequiredWhen, $"Pole '{field.Key}'");
        }

        ValidateCompetencies(fields, errors);

        if (errors.Count > 0)
        {
            throw new InvalidDataException($"Szablon '{Title}' jest niespójny:{Environment.NewLine}- " + string.Join($"{Environment.NewLine}- ", errors));
        }

        void CheckCondition(Condition? condition, string owner)
        {
            if (condition is not null && !fieldKeys.Contains(condition.Field))
            {
                errors.Add($"{owner}: warunek odwołuje się do nieistniejącego pola '{condition.Field}'.");
            }
        }
    }

    /// <summary>
    /// Kryteria ↔ model kompetencji: każde oceniane kryterium ma kompetencję, a każdy jej wskaźnik — opis dla
    /// każdego stopnia skali arkusza (pierwsza ocena: 3/5/7, okresowa: 1–9).
    /// </summary>
    private void ValidateCompetencies(List<FieldDefinition> fields, List<string> errors)
    {
        var indicatorFields = fields.Where(f => f.Type == "indicatorScores").ToList();
        if (CompetencyModel is null)
        {
            if (indicatorFields.Count > 0)
            {
                errors.Add("Pola 'indicatorScores' wymagają competencyModel.");
            }

            return;
        }

        var competencies = CompetencyModel.Competencies;
        Unique(competencies.Values.SelectMany(c => c.Indicators).Select(i => i.Key), "wskaźnik", errors);

        foreach (var indicatorField in indicatorFields)
        {
            var scores = fields.FirstOrDefault(f => f.Key == ExtraString(indicatorField, "of") && f.Type == "scores");
            if (scores is null)
            {
                errors.Add($"Pole '{indicatorField.Key}': 'of' musi wskazywać pole typu 'scores'.");
                continue;
            }

            var scaleKeys = Scales.GetValueOrDefault(ExtraString(scores, "scale") ?? "")?.Select(o => o.Key).ToList() ?? [];
            var criterionKeys = new List<string>();
            if (scores.Extra?.GetValueOrDefault("items") is { ValueKind: JsonValueKind.Array } items)
            {
                criterionKeys.AddRange(items.EnumerateArray().Select(i => i.GetProperty("key").GetString()!));
            }

            if (fields.FirstOrDefault(f => f.Key == ExtraString(scores, "itemsFrom")) is { } selection)
            {
                if (selection.Extra?.GetValueOrDefault("mandatory") is { ValueKind: JsonValueKind.Array } mandatory)
                {
                    criterionKeys.AddRange(mandatory.EnumerateArray().Select(i => i.GetProperty("key").GetString()!));
                }

                if (selection.Extra?.GetValueOrDefault("additional") is { ValueKind: JsonValueKind.Object } additional
                    && additional.TryGetProperty("from", out var from) && from.GetString() == "competencyModel")
                {
                    criterionKeys.AddRange(competencies.Keys);
                }
            }

            foreach (var key in criterionKeys.Distinct())
            {
                if (!competencies.TryGetValue(key, out var competency))
                {
                    errors.Add($"Pole '{scores.Key}': kryterium '{key}' nie ma kompetencji w competencyModel.");
                    continue;
                }

                foreach (var indicator in competency.Indicators)
                {
                    var missing = scaleKeys.Where(k => !indicator.Levels.ContainsKey(k)).ToList();
                    if (missing.Count > 0)
                    {
                        errors.Add($"Wskaźnik '{indicator.Key}': brak opisu poziomów {string.Join(", ", missing)}.");
                    }
                }
            }
        }
    }

    private static string? ExtraString(FieldDefinition field, string name) =>
        field.Extra?.TryGetValue(name, out var value) == true && value.ValueKind == JsonValueKind.String ? value.GetString() : null;

    private static HashSet<string> Unique(IEnumerable<string> keys, string kind, List<string> errors)
    {
        var set = new HashSet<string>();
        foreach (var key in keys.Where(key => !set.Add(key)))
        {
            errors.Add($"Powtórzony klucz ({kind}) '{key}'.");
        }

        return set;
    }
}

/// <summary>Status oceny. Final = ocena zamknięta (nie liczy się do terminów).</summary>
public sealed record StatusDefinition(string Key, string Label, bool Final = false);

/// <summary>Etap procesu. Po jego wykonaniu ocena przechodzi w status CompletesTo.</summary>
public sealed record StageDefinition(
    string Key,
    string Title,
    string CompletesTo,
    DeadlineRule? Deadline = null,
    bool Optional = false);

/// <summary>
/// Termin etapu liczony od Anchor: "start" (evaluations.start_date, np. data zatrudnienia) albo
/// "stage:&lt;klucz&gt;" (data wykonania wcześniejszego etapu). Earliest/Latest = okno „nie wcześniej / nie później”.
/// </summary>
public sealed record DeadlineRule(string Anchor, Offset? Earliest = null, Offset? Latest = null)
{
    public const string StartAnchor = "start";
    public const string StageAnchorPrefix = "stage:";
}

/// <summary>Przesunięcie w miesiącach i dniach (miesiące kalendarzowe, nie 30 dni).</summary>
public sealed record Offset(int Months = 0, int Days = 0)
{
    public DateOnly AddTo(DateOnly date) => date.AddMonths(Months).AddDays(Days);
}

public sealed record SectionDefinition(
    string Key,
    string Title,
    string Stage,
    IReadOnlyList<FieldDefinition> Fields,
    string? Part = null,
    Condition? VisibleWhen = null);

/// <summary>Pole formularza. Właściwości zależne od typu (options, scale, items, role…) trafiają do Extra.</summary>
public sealed record FieldDefinition(
    string Key,
    string Type,
    string? Label = null,
    bool Required = false,
    Condition? VisibleWhen = null,
    Condition? RequiredWhen = null)
{
    [JsonExtensionData]
    public Dictionary<string, JsonElement>? Extra { get; init; }
}

/// <summary>Warunek: wartość pola Field należy do In.</summary>
public sealed record Condition(string Field, IReadOnlyList<string> In);

public sealed record ScaleOption(int Value, string Key, string Label);

/// <summary>Model kompetencji (Kompas Kompetencji): kompetencje = kryteria oceny, wskaźniki behawioralne = pytania.</summary>
public sealed record CompetencyModel(
    string Source,
    IReadOnlyList<string> Guidance,
    IReadOnlyDictionary<string, CompetencyDefinition> Competencies);

public sealed record CompetencyDefinition(string Name, IReadOnlyList<IndicatorDefinition> Indicators);

/// <summary>Levels: opis zachowania dla każdego klucza poziomu skali (far_below … far_above).</summary>
public sealed record IndicatorDefinition(string Key, string Text, IReadOnlyDictionary<string, string> Levels);
