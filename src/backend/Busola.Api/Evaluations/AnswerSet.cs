using Busola.Api.Models;
using Busola.Database.EvaluationTemplates;

namespace Busola.Api.Evaluations;

/// <summary>Wartości pól oceny po (pole, pozycja) — do liczenia, walidacji i PDF. Set nadpisuje (np. wartościami liczonymi).</summary>
public sealed class AnswerSet
{
    private readonly Dictionary<(string Field, string Item), AnswerDto> values = [];

    public AnswerSet(IEnumerable<AnswerDto> answers)
    {
        foreach (var answer in answers)
        {
            Set(answer);
        }
    }

    public AnswerDto? Get(string field, string? item = null) => values.GetValueOrDefault((field, item ?? ""));

    public IEnumerable<AnswerDto> Of(string field) => values.Values.Where(a => a.FieldKey == field);

    public string? Text(string field, string? item = null) => Get(field, item)?.ValueText;

    public void Set(AnswerDto answer) => values[(answer.FieldKey, answer.ItemKey ?? "")] = answer;

    /// <summary>Warunek visibleWhen/requiredWhen: brak warunku = spełniony.</summary>
    public bool Matches(Condition? condition) => condition is null || condition.In.Contains(Text(condition.Field) ?? "");
}
