using System.Security.Claims;
using Busola.Api.Authorization;
using Busola.Api.Evaluations;
using Busola.Api.Models;
using Busola.Database;
using Busola.Database.Authorization;
using Busola.Database.Entities;
using Busola.Database.EvaluationTemplates;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Busola.Api.Controllers;

/// <summary>
/// Materiał roboczy oceniającego (poza arkuszem): notatki z obserwacji (W06–W09) oraz kontekst per wskaźnik
/// i kryterium (oczekiwania z rozmowy rozpoczynającej, powód innej oceny niż sugestia).
/// Oceniany widzi z tego tylko oczekiwania.
/// </summary>
[ApiController]
[Route("api/evaluations/{id:int}")]
public sealed class WorkingMaterialController(BusolaDbContext db, AccessScopeService access) : ControllerBase
{
    private const int MaxText = 2000;

    private string UserId => User.FindFirstValue(BusolaClaims.UserId)!;

    private static DateOnly Today => DateOnly.FromDateTime(DateTime.Today);

    // ---------- Notatki ----------

    [HttpGet("notes")]
    [Authorize(Policy = Permissions.EditEvaluation)]
    public async Task<ActionResult<NotesDto>> GetNotes(int id, CancellationToken ct)
    {
        var (context, error) = await LoadAsync(id, Permissions.EditEvaluation, ct);
        if (error is not null)
        {
            return error;
        }

        if (context!.IsOwn)
        {
            return Problem(statusCode: StatusCodes.Status403Forbidden, detail: "Notatki do własnej oceny są niedostępne.");
        }

        var notes = await db.EvaluationNotes
            .Where(n => n.EvaluationId == id && (!n.IsPrivate || n.AuthorId == UserId))
            .OrderByDescending(n => n.ObservedOn).ThenByDescending(n => n.Id)
            .Select(n => new
            {
                Note = n,
                AuthorName = n.Author.Employee != null ? n.Author.Employee.FirstName + " " + n.Author.Employee.LastName : n.Author.Email!,
            })
            .ToListAsync(ct);

        var periodStart = context.PeriodStart;
        var today = Today;
        bool InPeriod(DateOnly date) => date >= periodStart && date <= today;

        var dtos = notes.Select(n => ToDto(n.Note, n.AuthorName, InPeriod(n.Note.ObservedOn))).ToList();
        var inPeriod = dtos.Where(n => n.InPeriod).ToList();
        var evidence = new EvidenceDto(
            periodStart,
            inPeriod.Where(n => n.IndicatorKey is not null)
                .GroupBy(n => n.IndicatorKey!)
                .Select(g => new IndicatorEvidenceDto(g.Key, g.First().CriterionKey, g.Count()))
                .ToList(),
            inPeriod.Count,
            inPeriod.Count == 0 ? null : Math.Round((decimal)inPeriod.Count(n => n.ObservedOn > today.AddMonths(-4)) / inPeriod.Count, 2),
            dtos.Count - inPeriod.Count);

        return new NotesDto(dtos, evidence);
    }

    [HttpPost("notes")]
    [Authorize(Policy = Permissions.EditEvaluation)]
    public async Task<ActionResult<NoteDto>> AddNote(int id, NoteRequest request, CancellationToken ct)
    {
        var (context, error) = await LoadForNotesAsync(id, ct);
        if (error is not null)
        {
            return error;
        }

        if (ValidateNote(context!, request, out var criterionKey) is { } problem)
        {
            return problem;
        }

        var now = DateTimeOffset.UtcNow;
        var note = new EvaluationNote { EvaluationId = id, AuthorId = UserId, CreatedAt = now };
        Apply(note, request, criterionKey, now);
        db.EvaluationNotes.Add(note);
        await db.SaveChangesAsync(ct);

        return ToDto(note, await MyNameAsync(ct), note.ObservedOn >= context!.PeriodStart && note.ObservedOn <= Today);
    }

    [HttpPut("notes/{noteId:int}")]
    [Authorize(Policy = Permissions.EditEvaluation)]
    public async Task<ActionResult<NoteDto>> UpdateNote(int id, int noteId, NoteRequest request, CancellationToken ct)
    {
        var (context, error) = await LoadForNotesAsync(id, ct);
        if (error is not null)
        {
            return error;
        }

        var note = await db.EvaluationNotes.SingleOrDefaultAsync(n => n.Id == noteId && n.EvaluationId == id, ct);
        if (note is null || (note.IsPrivate && note.AuthorId != UserId))
        {
            return NotFound();
        }

        if (note.AuthorId != UserId)
        {
            return Problem(statusCode: StatusCodes.Status403Forbidden, detail: "Notatkę zmienia jej autor.");
        }

        if (ValidateNote(context!, request, out var criterionKey) is { } problem)
        {
            return problem;
        }

        Apply(note, request, criterionKey, DateTimeOffset.UtcNow);
        await db.SaveChangesAsync(ct);

        return ToDto(note, await MyNameAsync(ct), note.ObservedOn >= context!.PeriodStart && note.ObservedOn <= Today);
    }

    [HttpDelete("notes/{noteId:int}")]
    [Authorize(Policy = Permissions.EditEvaluation)]
    public async Task<IActionResult> DeleteNote(int id, int noteId, CancellationToken ct)
    {
        var (_, error) = await LoadForNotesAsync(id, ct);
        if (error is not null)
        {
            return error;
        }

        var deleted = await db.EvaluationNotes
            .Where(n => n.Id == noteId && n.EvaluationId == id && n.AuthorId == UserId)
            .ExecuteDeleteAsync(ct);
        return deleted == 0 ? NotFound() : NoContent();
    }

    // ---------- Kontekst per wskaźnik / kryterium ----------

    [HttpGet("context")]
    [Authorize(Policy = Permissions.ReadEvaluations)]
    public async Task<ActionResult<WorkingContextDto>> GetContext(int id, CancellationToken ct)
    {
        var (context, error) = await LoadAsync(id, Permissions.ReadEvaluations, ct);
        if (error is not null)
        {
            return error;
        }

        var indicators = await db.EvaluationIndicatorContexts
            .Where(c => c.EvaluationId == id)
            .OrderBy(c => c.IndicatorKey)
            .ToListAsync(ct);

        // Oceniany widzi tylko ustalone oczekiwania.
        if (context!.IsOwn)
        {
            return new WorkingContextDto(
                indicators.Where(c => c.Expectation is not null).Select(c => new IndicatorContextDto(c.IndicatorKey, c.Expectation)).ToList(),
                []);
        }

        var criteria = await db.EvaluationCriterionContexts
            .Where(c => c.EvaluationId == id)
            .OrderBy(c => c.CriterionKey)
            .Select(c => new CriterionContextDto(c.CriterionKey, c.ScoreReason))
            .ToListAsync(ct);

        return new WorkingContextDto(
            indicators.Select(c => new IndicatorContextDto(c.IndicatorKey, c.Expectation)).ToList(),
            criteria);
    }

    /// <summary>
    /// Oczekiwanie można zmieniać, dopóki trwa pierwszy etap (ustalenie kryteriów / rozmowa wstępna); później 409.
    /// </summary>
    [HttpPut("context/indicators/{indicatorKey}")]
    [Authorize(Policy = Permissions.EditEvaluation)]
    public async Task<ActionResult<IndicatorContextDto>> SetIndicator(int id, string indicatorKey, IndicatorContextRequest request, CancellationToken ct)
    {
        var (context, error) = await LoadForEditAsync(id, ct);
        if (error is not null)
        {
            return error;
        }

        if (context!.CriterionOfIndicator(indicatorKey) is null)
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, detail: $"Model kompetencji nie ma wskaźnika '{indicatorKey}'.");
        }

        var row = await db.EvaluationIndicatorContexts.SingleOrDefaultAsync(x => x.EvaluationId == id && x.IndicatorKey == indicatorKey, ct);

        // Łatka: null = bez zmian, "" = wyczyść.
        var expectation = request.Expectation is null ? row?.Expectation : Clean(request.Expectation);
        if (expectation?.Length > MaxText)
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, detail: $"Oczekiwanie może mieć najwyżej {MaxText} znaków.");
        }

        if (row?.Expectation != expectation && !context.FirstStageOpen)
        {
            return Problem(statusCode: StatusCodes.Status409Conflict, detail: "Oczekiwania ustala się w pierwszym etapie, a ten jest zamknięty.");
        }

        if (row is null)
        {
            row = new EvaluationIndicatorContext { EvaluationId = id, IndicatorKey = indicatorKey };
            db.EvaluationIndicatorContexts.Add(row);
        }

        row.Expectation = expectation;
        row.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);

        return new IndicatorContextDto(row.IndicatorKey, row.Expectation);
    }

    [HttpPut("context/criteria/{criterionKey}")]
    [Authorize(Policy = Permissions.EditEvaluation)]
    public async Task<ActionResult<CriterionContextDto>> SetCriterion(int id, string criterionKey, CriterionContextRequest request, CancellationToken ct)
    {
        var (context, error) = await LoadForEditAsync(id, ct);
        if (error is not null)
        {
            return error;
        }

        if (!context!.Criteria.Contains(criterionKey))
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, detail: $"Ocena nie ma kryterium '{criterionKey}'.");
        }

        if (!context.ScoringStageOpen)
        {
            return Problem(statusCode: StatusCodes.Status409Conflict, detail: "Etap ocen cząstkowych jest zamknięty.");
        }

        var reason = Clean(request.ScoreReason);
        if (reason?.Length > MaxText)
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, detail: $"Uzasadnienie może mieć najwyżej {MaxText} znaków.");
        }

        var row = await db.EvaluationCriterionContexts.SingleOrDefaultAsync(x => x.EvaluationId == id && x.CriterionKey == criterionKey, ct);
        if (row is null)
        {
            row = new EvaluationCriterionContext { EvaluationId = id, CriterionKey = criterionKey };
            db.EvaluationCriterionContexts.Add(row);
        }

        row.ScoreReason = reason;
        row.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);

        return new CriterionContextDto(row.CriterionKey, row.ScoreReason);
    }

    // ---------- Wspólne ----------

    private sealed record Context(
        bool IsOwn,
        bool IsFinal,
        DateOnly PeriodStart,
        bool FirstStageOpen,
        bool ScoringStageOpen,
        IReadOnlySet<string> Criteria,
        TemplateSchema Schema)
    {
        public string? CriterionOfIndicator(string indicatorKey) =>
            Schema.CompetencyModel?.Competencies.FirstOrDefault(c => c.Value.Indicators.Any(i => i.Key == indicatorKey)).Key;
    }

    private async Task<(Context? Context, ActionResult? Error)> LoadAsync(int id, string permission, CancellationToken ct)
    {
        var scope = await access.ResolveAsync(permission, ct);
        var inScope = db.Employees.InScope(scope).Select(e => e.Id);
        var evaluation = await db.Evaluations
            .AsNoTracking()
            .Include(e => e.Template)
            .Include(e => e.Stages)
            .Include(e => e.Answers)
            .SingleOrDefaultAsync(e => e.Id == id && (scope.All || inScope.Contains(e.EmployeeId)), ct);
        if (evaluation is null)
        {
            return (null, NotFound());
        }

        var myEmployeeId = await db.Users.Where(u => u.Id == UserId).Select(u => u.EmployeeId).SingleAsync(ct);
        var schema = TemplateSchema.Parse(evaluation.Template.Schema);
        var isFinal = EvaluationWorkflow.IsFinal(schema, evaluation.Status);
        bool Open(string? stageKey) => !isFinal && evaluation.Stages.SingleOrDefault(s => s.StageKey == stageKey)?.Status == StageStatus.Pending;

        // Okres oceny liczymy od zamknięcia pierwszego etapu (podpisy części I / rozmowa wstępna), wcześniej od startu.
        var firstStage = evaluation.Stages.SingleOrDefault(s => s.StageKey == schema.Stages[0].Key);
        var scores = EvaluationScoring.ScoresField(schema);
        var answers = new AnswerSet(evaluation.Answers.Select(a => new AnswerDto(a.FieldKey, a.ItemKey, a.ValueText, a.ValueNumber, a.ValueDate, a.ValueDateTo)));

        return (new Context(
            evaluation.EmployeeId == myEmployeeId,
            isFinal,
            firstStage?.CompletedOn ?? evaluation.StartDate,
            Open(schema.Stages[0].Key),
            scores is not null && Open(schema.SectionOf(scores.Key)?.Stage),
            scores is null ? new HashSet<string>() : EvaluationScoring.Items(schema, scores, answers).Select(i => i.Key).ToHashSet(),
            schema), null);
    }

    private async Task<(Context? Context, ActionResult? Error)> LoadForEditAsync(int id, CancellationToken ct)
    {
        var (context, error) = await LoadAsync(id, Permissions.EditEvaluation, ct);
        if (error is not null)
        {
            return (null, error);
        }

        if (context!.IsOwn)
        {
            return (null, Problem(statusCode: StatusCodes.Status403Forbidden, detail: "Nie możesz wypełniać własnej oceny."));
        }

        return context.IsFinal
            ? (null, Problem(statusCode: StatusCodes.Status409Conflict, detail: "Ocena jest zamknięta."))
            : (context, null);
    }

    // Notatki zbiera się do sporządzenia oceny; potem są tylko do odczytu.
    private async Task<(Context? Context, ActionResult? Error)> LoadForNotesAsync(int id, CancellationToken ct)
    {
        var (context, error) = await LoadForEditAsync(id, ct);
        if (error is not null)
        {
            return (null, error);
        }

        return context!.ScoringStageOpen
            ? (context, null)
            : (null, Problem(statusCode: StatusCodes.Status409Conflict, detail: "Ocena jest już sporządzona — notatek nie można zmieniać."));
    }

    private ActionResult? ValidateNote(Context context, NoteRequest request, out string? criterionKey)
    {
        criterionKey = null;
        var texts = new[] { request.Situation, request.Action, request.Result };
        if (texts.All(string.IsNullOrWhiteSpace))
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, detail: "Opisz sytuację, działanie albo rezultat.");
        }

        if (texts.Any(t => t?.Length > MaxText))
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, detail: $"Każde pole notatki może mieć najwyżej {MaxText} znaków.");
        }

        if (request.ObservedOn > Today)
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, detail: "Data zdarzenia nie może być z przyszłości.");
        }

        if (request.IndicatorKey is { } indicatorKey)
        {
            criterionKey = context.CriterionOfIndicator(indicatorKey);
            if (criterionKey is null)
            {
                return Problem(statusCode: StatusCodes.Status400BadRequest, detail: $"Model kompetencji nie ma wskaźnika '{indicatorKey}'.");
            }
        }

        return null;
    }

    private static void Apply(EvaluationNote note, NoteRequest request, string? criterionKey, DateTimeOffset now)
    {
        note.ObservedOn = request.ObservedOn;
        note.Situation = Clean(request.Situation);
        note.Action = Clean(request.Action);
        note.Result = Clean(request.Result);
        note.IndicatorKey = request.IndicatorKey;
        note.CriterionKey = criterionKey;
        note.IsPrivate = request.IsPrivate;
        note.DiscussedWithEmployee = request.DiscussedWithEmployee;
        note.UpdatedAt = now;
    }

    private NoteDto ToDto(EvaluationNote n, string authorName, bool inPeriod) =>
        new(n.Id, n.ObservedOn, n.Situation, n.Action, n.Result, n.IndicatorKey, n.CriterionKey, n.IsPrivate,
            n.DiscussedWithEmployee, authorName, n.CreatedAt, n.AuthorId == UserId, inPeriod);

    private Task<string> MyNameAsync(CancellationToken ct) =>
        db.Users.Where(u => u.Id == UserId)
            .Select(u => u.Employee != null ? u.Employee.FirstName + " " + u.Employee.LastName : u.Email!)
            .SingleAsync(ct);

    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
