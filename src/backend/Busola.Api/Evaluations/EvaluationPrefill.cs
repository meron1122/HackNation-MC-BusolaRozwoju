using Busola.Api.Models;
using Busola.Database;
using Busola.Database.Entities;
using Busola.Database.EvaluationTemplates;
using Microsoft.EntityFrameworkCore;

namespace Busola.Api.Evaluations;

/// <summary>
/// Dane arkusza brane z kartoteki, żeby nikt ich nie przepisywał ręcznie:
/// pola „person” według roli (oceniany; oceniający / bezpośredni przełożony = oceniający oceny albo przełożony z kartoteki;
/// kierujący komórką = kierujący wydziałem ocenianego) — imię, nazwisko, komórka organizacyjna = wydział tej osoby,
/// stanowisko = stanowisko z profilu; nazwa urzędu = służba; prefill "employee.hireDate" = data zatrudnienia.
/// Zwraca tylko wartości dla pól bez zapisanych wpisów. Zapisuje się je (kopia z chwili podpisu) przy zamknięciu etapu sekcji.
/// </summary>
public static class EvaluationPrefill
{
    public const string OfficePrefill = "employee.office";
    public const string HireDatePrefill = "employee.hireDate";

    private sealed record PersonData(int Id, string FirstName, string LastName, string DepartmentName);

    public static async Task<List<AnswerDto>> LoadAsync(
        BusolaDbContext db, int evaluationId, TemplateSchema schema, IEnumerable<AnswerDto> stored, CancellationToken ct)
    {
        var source = await db.Evaluations
            .Where(e => e.Id == evaluationId)
            .Select(e => new
            {
                e.EmployeeId,
                e.Employee.HireDate,
                OfficeName = e.Employee.Department.Location.Service.Name,
                EvaluatorId = e.EvaluatorId ?? e.Employee.SupervisorId,
                e.Employee.Department.HeadId,
            })
            .SingleAsync(ct);

        var ids = new[] { (int?)source.EmployeeId, source.EvaluatorId, source.HeadId }.Where(id => id is not null).Select(id => id!.Value).Distinct().ToList();
        var people = await db.Employees
            .Where(e => ids.Contains(e.Id))
            .Select(e => new PersonData(e.Id, e.FirstName, e.LastName, e.Department.Name))
            .ToDictionaryAsync(p => p.Id, ct);
        var positions = await db.EmployeeProfiles
            .Where(p => ids.Contains(p.EmployeeId) && p.JobTitle != null)
            .ToDictionaryAsync(p => p.EmployeeId, p => p.JobTitle!, ct);

        var answers = new AnswerSet(stored);
        var result = new List<AnswerDto>();
        void Add(AnswerDto value)
        {
            if (answers.Get(value.FieldKey, value.ItemKey) is null && (value.ValueText is not null || value.ValueDate is not null))
            {
                result.Add(value);
            }
        }

        foreach (var field in schema.Sections.SelectMany(s => s.Fields))
        {
            var prefill = field.ExtraString("prefill");
            if (field.Type == "person")
            {
                int? personId = field.SignatureRole() switch
                {
                    SignatureRole.Evaluated => source.EmployeeId,
                    SignatureRole.Evaluator or SignatureRole.Supervisor => source.EvaluatorId,
                    SignatureRole.UnitHead => source.HeadId,
                    _ => null,
                };
                if (personId is { } id && people.TryGetValue(id, out var person))
                {
                    Add(new AnswerDto(field.Key, "firstName", person.FirstName));
                    Add(new AnswerDto(field.Key, "lastName", person.LastName));
                    Add(new AnswerDto(field.Key, "department", person.DepartmentName));
                    Add(new AnswerDto(field.Key, "position", positions.GetValueOrDefault(id)));
                }
            }
            else if (prefill == HireDatePrefill)
            {
                Add(new AnswerDto(field.Key, ValueDate: source.HireDate));
            }
            else if (prefill == OfficePrefill || (field.Type == "text" && field.Key == "office"))
            {
                Add(new AnswerDto(field.Key, ValueText: source.OfficeName));
            }
        }

        return result;
    }

    /// <summary>Zapisane wpisy + podpowiedzi z kartoteki dla pól pustych (zapisane mają pierwszeństwo).</summary>
    public static List<AnswerDto> Merge(IEnumerable<AnswerDto> stored, IEnumerable<AnswerDto> prefill) => [.. stored, .. prefill];
}
