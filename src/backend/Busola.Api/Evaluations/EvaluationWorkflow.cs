using Busola.Database;
using Busola.Database.Entities;
using Busola.Database.EvaluationTemplates;
using Microsoft.EntityFrameworkCore;

namespace Busola.Api.Evaluations;

/// <summary>Terminy i przejścia statusów według szablonu (TemplateSchema).</summary>
public static class EvaluationWorkflow
{
    public const string FirstTemplate = "first";

    /// <summary>Arkusz B — stanowisko z bezpośrednim kierowaniem pracownikami (ma podwładnych), C — pozostałe.</summary>
    public static async Task<string> PeriodicTemplateCodeAsync(BusolaDbContext db, int employeeId, CancellationToken ct) =>
        await db.Employees.AnyAsync(e => e.SupervisorId == employeeId, ct) ? "periodic-b" : "periodic-c";

    /// <summary>Zakłada ocenę według aktywnej wersji szablonu (bez SaveChanges). Oceniający = obecny przełożony.</summary>
    public static async Task<Evaluation> StartAsync(
        BusolaDbContext db, Employee employee, string templateCode, DateOnly start, CancellationToken ct)
    {
        var template = await db.EvaluationTemplates.SingleAsync(t => t.Code == templateCode && t.IsActive, ct);
        var schema = TemplateSchema.Parse(template.Schema);
        var evaluation = new Evaluation
        {
            EmployeeId = employee.Id,
            TemplateId = template.Id,
            Template = template,
            Status = schema.InitialStatus,
            StartDate = start,
            EvaluatorId = employee.SupervisorId,
            CreatedAt = DateTimeOffset.UtcNow,
            Stages = CreateStages(schema, start),
        };
        db.Evaluations.Add(evaluation);
        return evaluation;
    }

    /// <summary>Etapy nowej oceny. Terminy od „start” liczymy od razu, od „stage:x” — dopiero po wykonaniu etapu x.</summary>
    public static List<EvaluationStage> CreateStages(TemplateSchema schema, DateOnly start) =>
        schema.Stages.Select(definition =>
        {
            var stage = new EvaluationStage { StageKey = definition.Key, Status = StageStatus.Pending };
            if (definition.Deadline?.Anchor == DeadlineRule.StartAnchor)
            {
                SetDue(stage, definition.Deadline, start);
            }

            return stage;
        }).ToList();

    /// <summary>Zamyka etap: status oceny = completesTo etapu, a etapy zależne od niego dostają terminy.</summary>
    public static void Complete(TemplateSchema schema, Evaluation evaluation, EvaluationStage stage, DateOnly completedOn)
    {
        stage.Status = StageStatus.Completed;
        stage.CompletedOn = completedOn;
        evaluation.Status = schema.Stages.Single(s => s.Key == stage.StageKey).CompletesTo;

        var anchor = DeadlineRule.StageAnchorPrefix + stage.StageKey;
        foreach (var definition in schema.Stages.Where(s => s.Deadline?.Anchor == anchor))
        {
            var dependent = evaluation.Stages.SingleOrDefault(s => s.StageKey == definition.Key);
            if (dependent is { Status: StageStatus.Pending })
            {
                SetDue(dependent, definition.Deadline!, completedOn);
            }
        }
    }

    public static bool IsFinal(TemplateSchema schema, string status) =>
        schema.Statuses.FirstOrDefault(s => s.Key == status)?.Final ?? false;

    public static string StatusLabel(TemplateSchema schema, string status) =>
        schema.Statuses.FirstOrDefault(s => s.Key == status)?.Label ?? status;

    public static string StageTitle(TemplateSchema schema, string stageKey) =>
        schema.Stages.FirstOrDefault(s => s.Key == stageKey)?.Title ?? stageKey;

    public static async Task<Dictionary<int, TemplateSchema>> LoadSchemasAsync(
        BusolaDbContext db, IEnumerable<int> templateIds, CancellationToken ct)
    {
        var ids = templateIds.Distinct().ToList();
        var templates = await db.EvaluationTemplates
            .Where(t => ids.Contains(t.Id))
            .Select(t => new { t.Id, t.Schema })
            .ToListAsync(ct);

        return templates.ToDictionary(t => t.Id, t => TemplateSchema.Parse(t.Schema));
    }

    // Dni: bieg od dnia następnego, koniec z upływem ostatniego dnia (anchor + N dni).
    // Miesiące: ten sam dzień miesiąca, a gdy go brak — ostatni dzień miesiąca (art. 112 KC, robi to AddMonths).
    // Koniec w sobotę/dzień wolny przesuwa się na następny dzień roboczy (art. 115 KC); początek okna — nie.
    private static void SetDue(EvaluationStage stage, DeadlineRule rule, DateOnly anchorDate)
    {
        stage.DueFrom = rule.Earliest?.AddTo(anchorDate);
        stage.DueTo = rule.Latest is { } latest ? PolishCalendar.ToWorkingDay(latest.AddTo(anchorDate)) : null;
    }
}
