using System.Text.Json;
using Busola.Api.Models;
using Busola.Database.EvaluationTemplates;

namespace Busola.Api.Evaluations;

/// <summary>
/// Liczenie oceny według „scoring” z szablonu: pozycje ocen cząstkowych, sugestie ze wskaźników, średnia,
/// poziom i wynik (positiveWhen). Ocena cząstkowa zostaje decyzją oceniającego — sugestia jej nie nadpisuje;
/// średnią, poziom i wynik wylicza się z ocen cząstkowych faktycznie wpisanych (§ 11 rozporządzenia z 2016 r.,
/// § 7 i § 10 rozporządzenia z 2015 r.).
/// </summary>
public static class EvaluationScoring
{
    public static ScoringRules? Rules(TemplateSchema schema) =>
        schema.Scoring is { ValueKind: JsonValueKind.Object } scoring
            ? scoring.Deserialize<ScoringRules>(JsonOptions)
            : null;

    public static FieldDefinition? ScoresField(TemplateSchema schema)
    {
        var fields = schema.Sections.SelectMany(s => s.Fields).ToList();
        var key = Rules(schema)?.Scores;
        return fields.FirstOrDefault(f => f.Key == key && f.Type == "scores") ?? fields.FirstOrDefault(f => f.Type == "scores");
    }

    /// <summary>Pozycje ocen cząstkowych: z szablonu (items) albo z wybranych kryteriów (obowiązkowe + dodatkowe).</summary>
    public static IReadOnlyList<ScoreItem> Items(TemplateSchema schema, FieldDefinition scores, AnswerSet answers)
    {
        if (scores.ExtraArray("items") is { } items)
        {
            return items.Select(i => new ScoreItem(i.GetProperty("key").GetString()!, i.GetProperty("label").GetString()!)).ToList();
        }

        var source = schema.Sections.SelectMany(s => s.Fields).FirstOrDefault(f => f.Key == scores.ExtraString("itemsFrom"));
        return source is null ? [] : Criteria(schema, source, answers);
    }

    /// <summary>Kryteria z pola criteriaSelection: obowiązkowe z szablonu i wybrane dodatkowe (wiersze spoza obowiązkowych).</summary>
    public static IReadOnlyList<ScoreItem> Criteria(TemplateSchema schema, FieldDefinition selection, AnswerSet answers)
    {
        var mandatory = (selection.ExtraArray("mandatory") ?? [])
            .Select(m => new ScoreItem(m.GetProperty("key").GetString()!, m.GetProperty("label").GetString()!))
            .ToList();
        var mandatoryKeys = mandatory.Select(m => m.Key).ToHashSet();
        var competencies = schema.CompetencyModel?.Competencies;

        var additional = answers.Of(selection.Key)
            .Where(a => a.ItemKey is not null && !mandatoryKeys.Contains(a.ItemKey) && a.ValueText is not null)
            .OrderBy(a => a.ItemKey, StringComparer.Ordinal)
            .Select(a => new ScoreItem(a.ItemKey!, competencies?.GetValueOrDefault(a.ItemKey!)?.Name ?? a.ValueText!));

        return [.. mandatory, .. additional];
    }

    public static IReadOnlyList<ScaleOption> Scale(TemplateSchema schema, FieldDefinition scores) =>
        schema.Scales.GetValueOrDefault(scores.ExtraString("scale") ?? "") ?? [];

    /// <summary>Wszystko, co da się wyliczyć z bieżących wartości (podgląd na ekranie i zapis przy sporządzeniu oceny).</summary>
    public static ScoringDto? Compute(TemplateSchema schema, AnswerSet answers)
    {
        var scores = ScoresField(schema);
        if (scores is null)
        {
            return null;
        }

        var rules = Rules(schema);
        var scale = Scale(schema, scores);
        var items = Items(schema, scores, answers);
        var indicatorField = schema.Sections.SelectMany(s => s.Fields)
            .FirstOrDefault(f => f.Type == "indicatorScores" && f.ExtraString("of") == scores.Key);

        var criteria = items.Select(item =>
        {
            var score = answers.Get(scores.Key, item.Key)?.ValueNumber;
            var competency = schema.CompetencyModel?.Competencies.GetValueOrDefault(item.Key);
            if (indicatorField is null || competency is null)
            {
                return new CriterionScoringDto(item.Key, item.Label, 0, 0, null, null, score);
            }

            var indicatorAnswers = competency.Indicators.Select(i => answers.Get(indicatorField.Key, i.Key)).ToList();
            var rated = indicatorAnswers.Where(a => a?.ValueNumber is not null).Select(a => a!.ValueNumber!.Value).ToList();
            decimal? mean = rated.Count > 0 ? Math.Round(rated.Average(), 2, MidpointRounding.AwayFromZero) : null;

            return new CriterionScoringDto(item.Key, item.Label, rated.Count, competency.Indicators.Count, mean,
                rated.Count > 0 ? Nearest(scale, rated.Average()) : null, score);
        }).ToList();

        var allScored = criteria.Count > 0 && criteria.All(c => c.Score is not null);
        decimal? average = allScored
            ? Math.Round(criteria.Average(c => c.Score!.Value), 2, MidpointRounding.AwayFromZero)
            : null;
        var level = average is { } avg ? rules?.Levels?.FirstOrDefault(l => l.Contains(avg)) : null;

        return new ScoringDto(scores.Key, criteria, average, level?.Key, level?.Label,
            average is null ? null : Result(rules, answers, criteria.Select(c => c.Score!.Value).ToList(), average.Value, level?.Key));
    }

    /// <summary>Wartości pól liczonych (średnia, poziom, wynik) jako odpowiedzi — do nałożenia na zapisane albo do zapisu.</summary>
    public static IEnumerable<AnswerDto> ComputedAnswers(TemplateSchema schema, ScoringDto? scoring)
    {
        var rules = Rules(schema);
        if (rules is null || scoring is null)
        {
            yield break;
        }

        if (rules.Average is { } averageKey)
        {
            yield return new AnswerDto(averageKey, ValueNumber: scoring.Average);
        }

        if (rules.Level is { } levelKey)
        {
            yield return new AnswerDto(levelKey, ValueText: scoring.Level);
        }

        if (rules.Result is { } resultKey)
        {
            yield return new AnswerDto(resultKey, ValueText: scoring.Result);
        }
    }

    /// <summary>Pola wyliczane przez backend: średnia, poziom, wynik ze scoring i pola oznaczone w szablonie jako computed.</summary>
    public static bool IsComputed(TemplateSchema schema, FieldDefinition field)
    {
        var rules = Rules(schema);
        return field.Type is "average" or "level"
            || field.Key == rules?.Result
            || field.ExtraBool("computed");
    }

    // Najbliższy stopień skali; przy remisie niższy (jak w formularzu).
    private static int? Nearest(IReadOnlyList<ScaleOption> scale, decimal mean) =>
        scale.Count == 0 ? null : scale.Aggregate((best, o) => Math.Abs(o.Value - mean) < Math.Abs(best.Value - mean) ? o : best).Value;

    // positiveWhen: wszystkie reguły spełnione = pozytywna, któraś niespełniona = negatywna, brak danych = null.
    private static string? Result(ScoringRules? rules, AnswerSet answers, IReadOnlyList<decimal> scores, decimal average, string? level)
    {
        if (rules?.PositiveWhen is not { Count: > 0 } conditions)
        {
            return null;
        }

        var unknown = false;
        foreach (var condition in conditions)
        {
            bool? ok = condition.Rule switch
            {
                "levelIn" => level is null ? null : condition.Values?.Contains(level) == true,
                "maxCountOfScore" => scores.Count(s => s == condition.Score) <= condition.Count,
                "minAverage" => average >= condition.Value,
                "fieldIn" => answers.Text(condition.Field ?? "") is { } value ? condition.Values?.Contains(value) == true : null,
                _ => null,
            };

            if (ok == false)
            {
                return "negative";
            }

            unknown |= ok is null;
        }

        return unknown ? null : "positive";
    }

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
}

public sealed record ScoreItem(string Key, string Label);

/// <summary>„scoring” z szablonu: klucze pól liczonych, progi poziomów i reguły oceny pozytywnej.</summary>
public sealed record ScoringRules(
    string? Scores,
    string? Average,
    string? Level,
    string? Result,
    IReadOnlyList<LevelRule>? Levels,
    IReadOnlyList<PositiveRule>? PositiveWhen);

public sealed record LevelRule(string Key, string Label, decimal? Min, decimal? MinExclusive, decimal Max)
{
    public bool Contains(decimal value) =>
        (Min is null || value >= Min) && (MinExclusive is null || value > MinExclusive) && value <= Max;
}

public sealed record PositiveRule(string Rule, IReadOnlyList<string>? Values, string? Field, decimal? Score, int? Count, decimal? Value);
