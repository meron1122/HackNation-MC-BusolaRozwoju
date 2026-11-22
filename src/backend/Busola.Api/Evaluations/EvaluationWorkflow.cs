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

    /// <summary>
    /// Pola z prefill "stage:x" wypełnione w zamykanym etapie (np. termin sporządzenia oceny w cz. I, termin sprawozdania
    /// na rozmowie wstępnej) ustalają termin etapu x — śledzimy termin wpisany do arkusza, a nie tylko wyliczony.
    /// </summary>
    public static void ApplyDeadlinesFromAnswers(TemplateSchema schema, Evaluation evaluation, string completedStageKey, AnswerSet answers)
    {
        var fields = schema.Sections.Where(s => s.Stage == completedStageKey).SelectMany(s => s.Fields);
        foreach (var field in fields)
        {
            if (field.ExtraString("prefill") is not { } prefill || !prefill.StartsWith(DeadlineRule.StageAnchorPrefix)
                || answers.Get(field.Key) is not { ValueDate: { } from } answer)
            {
                continue;
            }

            var target = evaluation.Stages.SingleOrDefault(s => s.StageKey == prefill[DeadlineRule.StageAnchorPrefix.Length..]);
            if (target is not { Status: StageStatus.Pending })
            {
                continue;
            }

            if (field.Type == "dateRange" && answer.ValueDateTo is { } to)
            {
                target.DueFrom = from;
                target.DueTo = to;
            }
            else if (field.Type == "date")
            {
                target.DueTo = from;
                if (target.DueFrom > from)
                {
                    target.DueFrom = null;
                }
            }
        }
    }

    /// <summary>Etap w toku: pierwszy otwarty etap obowiązkowy w kolejności szablonu (null, gdy wszystkie zamknięte).</summary>
    public static StageDefinition? CurrentStage(TemplateSchema schema, IEnumerable<(string Key, StageStatus Status)> stages)
    {
        var pending = stages.Where(s => s.Status == StageStatus.Pending).Select(s => s.Key).ToHashSet();
        return schema.Stages.FirstOrDefault(s => !s.Optional && pending.Contains(s.Key));
    }

    /// <summary>
    /// Sekcje roboczej oceny ukryte przed ocenianym (W09): sekcje etapu z ocenami cząstkowymi, dopóki nie jest zamknięty
    /// (ocena sporządzona). Oceniany widzi część I, swoje podpisy i samoocenę, ale nie punktów, wyniku ani uzasadnienia w trakcie.
    /// </summary>
    public static IReadOnlySet<string> DraftSections(TemplateSchema schema, IEnumerable<(string Key, StageStatus Status)> stages)
    {
        var scores = EvaluationScoring.ScoresField(schema);
        var stageKey = scores is null ? null : schema.SectionOf(scores.Key)?.Stage;
        if (stageKey is null || stages.Any(s => s.Key == stageKey && s.Status == StageStatus.Completed))
        {
            return new HashSet<string>();
        }

        return schema.Sections.Where(s => s.Stage == stageKey).Select(s => s.Key).ToHashSet();
    }

    /// <summary>Odpowiedzi bez pól z sekcji roboczych (dla ocenianego).</summary>
    public static IEnumerable<T> WithoutDraft<T>(TemplateSchema schema, IReadOnlySet<string> draftSections, IEnumerable<T> answers, Func<T, string> fieldKey) =>
        draftSections.Count == 0 ? answers : answers.Where(a => schema.SectionOf(fieldKey(a)) is not { } s || !draftSections.Contains(s.Key));

    /// <summary>
    /// Czy pole podpisu można teraz podpisać (dla każdej roli): etap pola w toku, wcześniejsze etapy obowiązkowe zamknięte,
    /// nie przed początkiem terminu etapu (np. pierwsza ocena od 8. miesiąca), data podpisu nie z przyszłości i nie sprzed
    /// tego początku. Po upływie terminu podpis zostaje możliwy — spóźnioną ocenę i tak trzeba dokończyć.
    /// Zwraca powód blokady albo null.
    /// </summary>
    public static string? SignBlockReason(
        TemplateSchema schema, IReadOnlyList<(string Key, StageStatus Status, DateOnly? DueFrom)> stages, string fieldKey,
        DateOnly signedOn, DateOnly today)
    {
        var stageKey = schema.SectionOf(fieldKey)?.Stage;
        var definition = schema.Stages.FirstOrDefault(s => s.Key == stageKey);
        var stage = stages.FirstOrDefault(s => s.Key == stageKey);
        if (definition is null || stage.Key is null)
        {
            return null;
        }

        if (stage.Status != StageStatus.Pending)
        {
            return "Etap tego podpisu jest już zamknięty.";
        }

        var earlier = schema.Stages.TakeWhile(s => s.Key != stageKey)
            .FirstOrDefault(s => !s.Optional && stages.Any(x => x.Key == s.Key && x.Status == StageStatus.Pending));
        if (earlier is not null)
        {
            return $"Ten podpis będzie możliwy po zamknięciu etapu „{earlier.Title}”.";
        }

        if (stage.DueFrom is { } from && today < from)
        {
            return $"Ten podpis można złożyć od {from:dd.MM.yyyy} — wtedy zaczyna się termin etapu „{definition.Title}”.";
        }

        if (signedOn > today)
        {
            return "Data podpisu nie może być z przyszłości.";
        }

        return stage.DueFrom is { } start && signedOn < start
            ? $"Data podpisu nie może być wcześniejsza niż początek terminu etapu ({start:dd.MM.yyyy})."
            : null;
    }

    /// <summary>Samoocena przy ocenie okresowej: tyle dni przed terminem sporządzenia oceny (termin organizacyjny).</summary>
    public const int SelfAssessmentLeadDays = 30;

    /// <summary>
    /// Termin przekazania samooceny: sprawozdanie (etap zamykany przez ocenianego) — termin etapu ustalony na rozmowie
    /// wstępnej; samoocena w trakcie etapu oceny — 30 dni przed terminem jego zamknięcia, żeby była przed rozmową oceniającą.
    /// </summary>
    public static DateOnly? SelfAssessmentDueTo(StageDefinition? stage, DateOnly? stageDueTo) =>
        stage is null || stageDueTo is not { } due ? null
        : stage.CompletedByEvaluated ? due
        : due.AddDays(-SelfAssessmentLeadDays);

    public const string NotStartedPhase = "Oczekuje na start";

    /// <summary>
    /// Krótka nazwa fazy na listy: status końcowy, „Oczekuje na start” (pierwszy etap bez żadnych wpisów — też nowy cykl
    /// po zamkniętej ocenie), albo phase etapu w toku z szablonu (starsze wersje: tytuł etapu).
    /// </summary>
    public static string Phase(TemplateSchema schema, string status, StageDefinition? current, bool hasProgress)
    {
        if (IsFinal(schema, status) || current is null)
        {
            return StatusLabel(schema, status);
        }

        return current.Key == schema.Stages[0].Key && !hasProgress ? NotStartedPhase : current.Phase ?? current.Title;
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
