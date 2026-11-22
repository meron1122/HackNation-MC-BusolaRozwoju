using Busola.Api.Models;
using Busola.Database.Entities;
using Busola.Database.EvaluationTemplates;

namespace Busola.Api.Evaluations;

/// <summary>Stan etapu potrzebny do sprawdzenia oceny (bez ładowania encji).</summary>
public sealed record StageState(string Key, StageStatus Status, DateOnly? DueFrom, DateOnly? DueTo);

/// <summary>
/// „Sprawdź przed podpisaniem”: braki w polach wymaganych (też requiredWhen), ocenach cząstkowych i podpisach,
/// per sekcja i per etap, z odwołaniem do przepisu z szablonu (legalRef). Blokujące braki nie pozwalają zamknąć etapu;
/// nieblokujące to ostrzeżenia (np. wskaźniki bez odpowiedzi, brak stanowiska w danych osoby).
/// Sekcja etapu zamkniętego jest zablokowana do edycji.
/// </summary>
public static class EvaluationCheck
{
    public static EvaluationCheckDto Run(
        TemplateSchema schema,
        IReadOnlyList<StageState> stages,
        IEnumerable<AnswerDto> storedAnswers,
        IReadOnlySet<string> signedFields,
        bool isFinal,
        bool selfAssessmentSubmitted)
    {
        // Pola liczone (średnia, poziom, wynik) sprawdzamy po wyliczeniu, nie po tym, co zapisał formularz.
        var answers = new AnswerSet(storedAnswers);
        foreach (var computed in EvaluationScoring.ComputedAnswers(schema, EvaluationScoring.Compute(schema, answers)))
        {
            answers.Set(computed);
        }

        var stageByKey = stages.ToDictionary(s => s.Key);
        var sections = schema.Sections.Select(section =>
        {
            var visible = answers.Matches(section.VisibleWhen);
            var issues = visible ? SectionIssues(schema, section, answers, signedFields).ToList() : [];
            var locked = stageByKey.GetValueOrDefault(section.Stage)?.Status is not (null or StageStatus.Pending) || isFinal;
            return new SectionCheckDto(section.Key, section.Title, section.Part, section.Stage, visible, locked,
                visible && issues.All(i => !i.Blocking), issues);
        }).ToList();

        var result = new List<StageCheckDto>();
        foreach (var definition in schema.Stages)
        {
            if (!stageByKey.TryGetValue(definition.Key, out var stage))
            {
                continue;
            }

            var issues = sections.Where(s => s.StageKey == definition.Key).SelectMany(s => s.Issues).ToList();

            // Etapy po kolei: nie zamkniesz oceny przed ustaleniem kryteriów.
            var earlier = schema.Stages.TakeWhile(s => s.Key != definition.Key)
                .Where(s => !s.Optional && stageByKey.GetValueOrDefault(s.Key)?.Status == StageStatus.Pending)
                .ToList();
            issues.InsertRange(0, earlier.Select(s =>
                new CheckIssue(definition.Key, null, null, $"Najpierw zamknij etap „{s.Title}”.", s.LegalRef, Blocking: true)));

            // Etap zamykany przez ocenianego (sprawozdanie): oceniający go nie zamyka, po terminie może go pominąć.
            var overdue = stage.DueTo is { } due && due < DateOnly.FromDateTime(DateTime.Today);
            if (definition.CompletedByEvaluated && stage.Status == StageStatus.Pending)
            {
                issues.Add(new CheckIssue(definition.Key, null, null,
                    overdue
                        ? "Termin na sprawozdanie minął — możesz oznaczyć je jako niezłożone i przejść do rozmowy oceniającej."
                        : "Etap zamyka oceniany, przekazując sprawozdanie.",
                    "§ 8 ust. 1", Blocking: !overdue));
            }
            else if (definition.SelfAssessment && stage.Status == StageStatus.Pending && !selfAssessmentSubmitted)
            {
                issues.Add(new CheckIssue(definition.Key, null, null, "Oceniany nie przekazał jeszcze samooceny.", null, Blocking: false));
            }

            var open = stage.Status == StageStatus.Pending;
            var canComplete = open && !definition.CompletedByEvaluated && (!isFinal || definition.Optional) && issues.All(i => !i.Blocking);
            var canSkip = open && (definition.Optional || (definition.CompletedByEvaluated && overdue));
            result.Add(new StageCheckDto(definition.Key, definition.Title, stage.Status.ToString(), canComplete, canSkip, issues));
        }

        return new EvaluationCheckDto(result, sections);
    }

    private static IEnumerable<CheckIssue> SectionIssues(
        TemplateSchema schema, SectionDefinition section, AnswerSet answers, IReadOnlySet<string> signedFields)
    {
        var where = section.Part is { } part ? $" ({part.Replace("Część", "cz.")})" : "";
        CheckIssue Issue(FieldDefinition field, string message, bool blocking = true) =>
            new(section.Stage, section.Key, field.Key, message + where, field.LegalRef, blocking);

        foreach (var field in section.Fields.Where(f => answers.Matches(f.VisibleWhen)))
        {
            var label = field.Label ?? section.Title;
            var required = field.Required || (field.RequiredWhen is not null && answers.Matches(field.RequiredWhen));

            switch (field.Type)
            {
                case "signature":
                    if (!signedFields.Contains(field.Key))
                    {
                        yield return Issue(field, $"Brak podpisu {RoleName(field.SignatureRole())} — {section.Title}");
                    }

                    break;

                case "scores":
                    var scale = EvaluationScoring.Scale(schema, field).Select(o => (decimal)o.Value).ToHashSet();
                    var items = EvaluationScoring.Items(schema, field, answers);
                    if (items.Count == 0)
                    {
                        yield return Issue(field, "Brak kryteriów do oceny");
                    }

                    foreach (var item in items)
                    {
                        var score = answers.Get(field.Key, item.Key)?.ValueNumber;
                        if (score is null)
                        {
                            yield return Issue(field, $"Brak oceny cząstkowej: {item.Label}");
                        }
                        else if (!scale.Contains(score.Value))
                        {
                            yield return Issue(field, $"Ocena cząstkowa spoza skali: {item.Label} ({score})");
                        }
                    }

                    break;

                case "indicatorScores":
                    var of = schema.Sections.SelectMany(s => s.Fields).FirstOrDefault(f => f.Key == field.ExtraString("of"));
                    if (of is null || schema.CompetencyModel is null)
                    {
                        break;
                    }

                    foreach (var item in EvaluationScoring.Items(schema, of, answers))
                    {
                        var indicators = schema.CompetencyModel.Competencies.GetValueOrDefault(item.Key)?.Indicators ?? [];
                        // Każdy wskaźnik wybranego kryterium wymaga odpowiedzi ze skali (bez „brak okazji”).
                        var open = indicators.Count(i => answers.Get(field.Key, i.Key)?.ValueNumber is null);
                        if (open > 0)
                        {
                            yield return Issue(field, $"{item.Label}: {open} z {indicators.Count} wskaźników bez odpowiedzi");
                        }
                    }

                    break;

                case "criteriaSelection":
                    var max = field.ExtraObject("additional") is { } additional && additional.TryGetProperty("max", out var m) ? m.GetInt32() : 0;
                    var chosen = EvaluationScoring.Criteria(schema, field, answers).Count - (field.ExtraArray("mandatory")?.Count ?? 0);
                    if (chosen > max)
                    {
                        yield return Issue(field, $"Za dużo kryteriów dodatkowych: {chosen}, najwyżej {max}");
                    }

                    break;

                case "person":
                    if (!required)
                    {
                        break;
                    }

                    if (answers.Text(field.Key, "firstName") is null || answers.Text(field.Key, "lastName") is null)
                    {
                        yield return Issue(field, $"Brak imienia i nazwiska: {label}");
                    }
                    else if (answers.Text(field.Key, "position") is null)
                    {
                        yield return Issue(field, $"Brak stanowiska: {label}", blocking: false);
                    }

                    break;

                case "notice":
                    break;

                default:
                    if (required && !HasValue(field, answers.Get(field.Key)))
                    {
                        yield return Issue(field, EvaluationScoring.IsComputed(schema, field)
                            ? $"Nie da się jeszcze wyliczyć: {label}"
                            : $"Brak: {label}");
                    }

                    break;
            }
        }
    }

    private static bool HasValue(FieldDefinition field, AnswerDto? answer) => field.Type switch
    {
        "date" => answer?.ValueDate is not null,
        "dateRange" => answer?.ValueDate is not null && answer.ValueDateTo is not null,
        "year" or "average" => answer?.ValueNumber is not null,
        _ => answer?.ValueText is not null,
    };

    private static string RoleName(SignatureRole? role) => role switch
    {
        SignatureRole.Evaluated => "ocenianego",
        SignatureRole.Evaluator => "oceniającego",
        SignatureRole.Supervisor => "bezpośredniego przełożonego",
        SignatureRole.UnitHead => "kierującego komórką",
        _ => "",
    };
}
