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
/// Samoocena ocenianego (W09 „perspektywa pracownika”, przy pierwszej ocenie sprawozdanie). Wypełnia ją tylko oceniany
/// i tylko w etapie oznaczonym w szablonie jako selfAssessment (okresowa: do sporządzenia oceny, pierwsza: sprawozdanie);
/// po przekazaniu jest tylko do odczytu. Przełożony i HR widzą treść dopiero po przekazaniu.
/// </summary>
[ApiController]
[Route("api/evaluations/{id:int}/self-assessment")]
[Authorize(Policy = Permissions.ReadEvaluations)]
public sealed class SelfAssessmentController(BusolaDbContext db, AccessScopeService access) : ControllerBase
{
    private const int MaxCommentLength = 2000;

    private string UserId => User.FindFirstValue(BusolaClaims.UserId)!;

    [HttpGet]
    public async Task<ActionResult<SelfAssessmentDto>> Get(int id, CancellationToken ct)
    {
        var context = await LoadAsync(id, ct);
        return context is null ? NotFound() : ToDto(context);
    }

    [HttpPut]
    public async Task<ActionResult<SelfAssessmentDto>> Save(int id, SaveSelfAssessmentRequest request, CancellationToken ct)
    {
        var context = await LoadAsync(id, ct);
        if (context is null)
        {
            return NotFound();
        }

        if (CannotEdit(context) is { } problem)
        {
            return problem;
        }

        var allowedCriteria = context.Criteria.Select(c => c.Key).ToHashSet();
        var allowedLevels = context.Scale.Select(o => o.Key).ToHashSet();
        var errors = request.Criteria
            .Where(c => !allowedCriteria.Contains(c.CriterionKey))
            .Select(c => $"Ocena nie ma kryterium '{c.CriterionKey}'.")
            .Concat(request.Criteria
                .Where(c => c.Level is not null && !allowedLevels.Contains(c.Level))
                .Select(c => $"Nieznany poziom '{c.Level}' (dozwolone: {string.Join(", ", allowedLevels)})."))
            .Concat(request.Criteria
                .Where(c => c.Comment?.Length > MaxCommentLength)
                .Select(c => $"Komentarz do '{c.CriterionKey}' może mieć najwyżej {MaxCommentLength} znaków."))
            .ToList();
        if (request.Criteria.Select(c => c.CriterionKey).Distinct().Count() != request.Criteria.Count)
        {
            errors.Add("Każde kryterium może wystąpić tylko raz.");
        }

        if (request.DevelopmentNeeds?.Length > 4000)
        {
            errors.Add("Potrzeby rozwojowe mogą mieć najwyżej 4000 znaków.");
        }

        if (errors.Count > 0)
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, detail: string.Join(" ", errors));
        }

        var selfAssessment = context.SelfAssessment;
        if (selfAssessment is null)
        {
            selfAssessment = new EvaluationSelfAssessment { EvaluationId = id };
            db.EvaluationSelfAssessments.Add(selfAssessment);
        }

        selfAssessment.Criteria = request.Criteria
            .Where(c => c.Level is not null || !string.IsNullOrWhiteSpace(c.Comment))
            .Select(c => new SelfAssessmentItem
            {
                CriterionKey = c.CriterionKey,
                Level = c.Level,
                Comment = string.IsNullOrWhiteSpace(c.Comment) ? null : c.Comment.Trim(),
            })
            .ToList();
        selfAssessment.DevelopmentNeeds = string.IsNullOrWhiteSpace(request.DevelopmentNeeds) ? null : request.DevelopmentNeeds.Trim();
        selfAssessment.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);

        return ToDto(context with { SelfAssessment = selfAssessment });
    }

    /// <summary>Przekazanie przełożonemu — potem samoocena jest tylko do odczytu.</summary>
    [HttpPost("submit")]
    public async Task<ActionResult<SelfAssessmentDto>> Submit(int id, CancellationToken ct)
    {
        var context = await LoadAsync(id, ct);
        if (context is null)
        {
            return NotFound();
        }

        if (CannotEdit(context) is { } problem)
        {
            return problem;
        }

        if (context.SelfAssessment is not { } selfAssessment
            || (selfAssessment.Criteria.Count == 0 && selfAssessment.DevelopmentNeeds is null))
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, detail: "Samoocena jest pusta.");
        }

        selfAssessment.SubmittedAt = DateTimeOffset.UtcNow;

        // Przy pierwszej ocenie przekazanie samooceny = złożenie sprawozdania: zamyka etap (data złożenia = dziś).
        if (context.Stage!.CompletedByEvaluated)
        {
            var stage = context.Evaluation.Stages.Single(s => s.StageKey == context.Stage.Key);
            EvaluationWorkflow.Complete(context.Schema, context.Evaluation, stage, DateOnly.FromDateTime(DateTime.Today));
        }

        await db.SaveChangesAsync(ct);
        return ToDto(context with { StageOpen = !context.Stage.CompletedByEvaluated });
    }

    private sealed record Context(
        int EvaluationId,
        bool IsOwn,
        bool IsFinal,
        StageDefinition? Stage,
        bool StageOpen,
        IReadOnlyList<ScoreItem> Criteria,
        IReadOnlyList<ScaleOption> Scale,
        EvaluationSelfAssessment? SelfAssessment,
        Evaluation Evaluation,
        TemplateSchema Schema);

    private ActionResult? CannotEdit(Context context)
    {
        if (!context.IsOwn)
        {
            return Problem(statusCode: StatusCodes.Status403Forbidden, detail: "Samoocenę wypełnia oceniany.");
        }

        if (context.Stage is null)
        {
            return Problem(statusCode: StatusCodes.Status409Conflict, detail: "Ta wersja arkusza nie przewiduje samooceny.");
        }

        if (context.IsFinal || !context.StageOpen)
        {
            return Problem(statusCode: StatusCodes.Status409Conflict, detail: $"Samoocenę można wypełniać w etapie „{context.Stage.Title}”, a jest on zamknięty.");
        }

        return context.SelfAssessment?.SubmittedAt is not null
            ? Problem(statusCode: StatusCodes.Status409Conflict, detail: "Samoocena została już przekazana.")
            : null;
    }

    private async Task<Context?> LoadAsync(int id, CancellationToken ct)
    {
        var scope = await access.ResolveAsync(Permissions.ReadEvaluations, ct);
        var inScope = db.Employees.InScope(scope).Select(e => e.Id);
        var evaluation = await db.Evaluations
            .Include(e => e.Template)
            .Include(e => e.Stages)
            .Include(e => e.Answers)
            .Include(e => e.SelfAssessment)
            .SingleOrDefaultAsync(e => e.Id == id && (scope.All || inScope.Contains(e.EmployeeId)), ct);
        if (evaluation is null)
        {
            return null;
        }

        var myEmployeeId = await db.Users.Where(u => u.Id == UserId).Select(u => u.EmployeeId).SingleAsync(ct);
        var schema = TemplateSchema.Parse(evaluation.Template.Schema);
        var stage = schema.Stages.FirstOrDefault(s => s.SelfAssessment);
        var scores = EvaluationScoring.ScoresField(schema);
        var answers = new AnswerSet(evaluation.Answers.Select(a => new AnswerDto(a.FieldKey, a.ItemKey, a.ValueText, a.ValueNumber, a.ValueDate, a.ValueDateTo)));

        return new Context(
            evaluation.Id,
            evaluation.EmployeeId == myEmployeeId,
            EvaluationWorkflow.IsFinal(schema, evaluation.Status),
            stage,
            stage is not null && evaluation.Stages.SingleOrDefault(s => s.StageKey == stage.Key)?.Status == StageStatus.Pending,
            scores is null ? [] : EvaluationScoring.Items(schema, scores, answers),
            scores is null ? [] : EvaluationScoring.Scale(schema, scores),
            evaluation.SelfAssessment,
            evaluation,
            schema);
    }

    private static SelfAssessmentDto ToDto(Context context)
    {
        var self = context.SelfAssessment;
        var submitted = self?.SubmittedAt is not null;
        var visible = context.IsOwn || submitted;
        var byKey = visible ? self?.Criteria.ToDictionary(c => c.CriterionKey) ?? [] : [];
        var dueTo = EvaluationWorkflow.SelfAssessmentDueTo(context.Stage, context.Evaluation.Stages.SingleOrDefault(s => s.StageKey == context.Stage?.Key)?.DueTo);

        return new SelfAssessmentDto(
            context.Stage?.Key,
            context.StageOpen && !context.IsFinal,
            context.IsOwn && context.Stage is not null && context.StageOpen && !context.IsFinal && !submitted,
            submitted,
            self?.SubmittedAt,
            visible ? self?.UpdatedAt : null,
            context.Scale.Select(o => new ScaleOptionDto(o.Value, o.Key, o.Label)).ToList(),
            context.Criteria
                .Select(c => new SelfAssessmentCriterionDto(c.Key, c.Label, byKey.GetValueOrDefault(c.Key)?.Level, byKey.GetValueOrDefault(c.Key)?.Comment))
                .ToList(),
            visible ? self?.DevelopmentNeeds : null,
            dueTo,
            !submitted && context.StageOpen && dueTo < DateOnly.FromDateTime(DateTime.Today));
    }
}
