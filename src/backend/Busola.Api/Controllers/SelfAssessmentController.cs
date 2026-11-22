using System.Globalization;
using System.Security.Claims;
using Busola.Api.Authorization;
using Busola.Api.Evaluations;
using Busola.Api.Models;
using Busola.Api.Pdf;
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
/// Sprawozdanie (etap zamykany przez ocenianego) ma formularz z załącznika nr 3 do rozporządzenia z 23.07.2015 r.:
/// nagłówek z arkusza, treść wpisaną przez ocenianego z doklejoną samooceną, podpis; składa się je w terminie
/// wyznaczonym przez przełożonego na rozmowie wstępnej (nie wcześniej), a PDF formularza jest do pobrania.
/// </summary>
[ApiController]
[Route("api/evaluations/{id:int}/self-assessment")]
[Authorize(Policy = Permissions.ReadEvaluations)]
public sealed class SelfAssessmentController(BusolaDbContext db, AccessScopeService access) : ControllerBase
{
    private const int MaxCommentLength = 2000;

    // Jak kolumna evaluation_self_assessments.report.
    private const int MaxReportLength = 20000;

    private static readonly CultureInfo Polish = CultureInfo.GetCultureInfo("pl-PL");

    private string UserId => User.FindFirstValue(BusolaClaims.UserId)!;

    private static DateOnly Today => DateOnly.FromDateTime(DateTime.Today);

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

        if (request.Report?.Length > MaxReportLength)
        {
            errors.Add($"Sprawozdanie może mieć najwyżej {MaxReportLength} znaków.");
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

        // Treść sprawozdania tylko tam, gdzie jest formularz (pierwsza ocena); w okresowej pole jest pomijane.
        selfAssessment.Report = context.Report is null || string.IsNullOrWhiteSpace(request.Report) ? null : request.Report.Trim();
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
            || (selfAssessment.Criteria.Count == 0 && selfAssessment.DevelopmentNeeds is null && selfAssessment.Report is null))
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, detail: "Samoocena jest pusta.");
        }

        if (context.Report is { } report)
        {
            if (report.SubmitBlockedReason is { } blocked)
            {
                return Problem(statusCode: StatusCodes.Status409Conflict, detail: blocked);
            }

            if (selfAssessment.Report is null)
            {
                return Problem(statusCode: StatusCodes.Status400BadRequest,
                    detail: "Opisz w sprawozdaniu zadania realizowane w przepracowanym okresie (§ 6, załącznik nr 3).");
            }

            if (report.SignatureFieldKey is not null && !report.Signed)
            {
                return Problem(statusCode: StatusCodes.Status400BadRequest, detail: "Podpisz sprawozdanie przed złożeniem.");
            }
        }

        selfAssessment.SubmittedAt = DateTimeOffset.UtcNow;

        // Przy pierwszej ocenie przekazanie samooceny = złożenie sprawozdania: zamyka etap (data złożenia = dziś).
        if (context.Stage!.CompletedByEvaluated)
        {
            var stage = context.Evaluation.Stages.Single(s => s.StageKey == context.Stage.Key);
            EvaluationWorkflow.Complete(context.Schema, context.Evaluation, stage, Today);
        }

        await db.SaveChangesAsync(ct);
        return ToDto(context with { StageOpen = !context.Stage.CompletedByEvaluated });
    }

    /// <summary>
    /// Formularz sprawozdania (załącznik nr 3) jako PDF. Oceniany pobiera go zawsze (też wersję roboczą do przejrzenia),
    /// pozostali dopiero po złożeniu.
    /// </summary>
    [HttpGet("pdf")]
    public async Task<IActionResult> GetPdf(int id, CancellationToken ct)
    {
        var context = await LoadAsync(id, ct);
        if (context is null)
        {
            return NotFound();
        }

        if (context.Report is not { } report)
        {
            return Problem(statusCode: StatusCodes.Status404NotFound, detail: "Ta ocena nie ma formularza sprawozdania.");
        }

        if (!context.IsOwn && context.SelfAssessment?.SubmittedAt is null)
        {
            return Problem(statusCode: StatusCodes.Status409Conflict, detail: "Sprawozdanie nie zostało jeszcze złożone.");
        }

        var signature = report.SignatureFieldKey is null
            ? null
            : await db.EvaluationSignatures
                .Where(s => s.EvaluationId == id && s.FieldKey == report.SignatureFieldKey)
                .Select(s => new SheetSignature(s.FieldKey, s.SignerName, s.SignedOn, s.Place, s.ImageContent))
                .SingleOrDefaultAsync(ct);

        var form = ToDto(context).ReportForm!;
        var pdf = EvaluationSheetPdf.RenderReport(form, signature);
        return File(pdf, "application/pdf", $"sprawozdanie-{form.LastName}-{form.FirstName}-{id}.pdf");
    }

    /// <summary>Nagłówek formularza sprawozdania i stan podpisu / terminu (tylko etap zamykany przez ocenianego).</summary>
    private sealed record ReportContext(
        string? Office,
        string? FirstName,
        string? LastName,
        string? Department,
        string? Position,
        DateOnly? PeriodFrom,
        DateOnly? PeriodTo,
        string? SignatureFieldKey,
        bool Signed,
        string? SubmitBlockedReason);

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
        TemplateSchema Schema,
        ReportContext? Report);

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
        var stored = evaluation.Answers.Select(a => new AnswerDto(a.FieldKey, a.ItemKey, a.ValueText, a.ValueNumber, a.ValueDate, a.ValueDateTo)).ToList();
        var answers = new AnswerSet(stored);

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
            schema,
            stage is { CompletedByEvaluated: true } ? await LoadReportAsync(schema, evaluation, stage, stored, ct) : null);
    }

    /// <summary>
    /// Nagłówek z arkusza (z kartoteki, dopóki nie zapisany): urząd, dane ocenianego, termin z rozmowy wstępnej
    /// (przed jej zamknięciem — termin etapu).
    /// </summary>
    private async Task<ReportContext> LoadReportAsync(
        TemplateSchema schema, Evaluation evaluation, StageDefinition stage, List<AnswerDto> stored, CancellationToken ct)
    {
        var answers = new AnswerSet(EvaluationPrefill.Merge(stored, await EvaluationPrefill.LoadAsync(db, evaluation.Id, schema, stored, ct)));
        var fields = schema.Sections.SelectMany(s => s.Fields).ToList();
        var person = fields.FirstOrDefault(f => f.Type == "person" && f.SignatureRole() == SignatureRole.Evaluated)?.Key;
        var office = fields.FirstOrDefault(f => f.ExtraString("prefill") == EvaluationPrefill.OfficePrefill || (f.Type == "text" && f.Key == "office"))?.Key;
        var periodField = fields.FirstOrDefault(f => f.Type == "dateRange" && f.ExtraString("prefill") == DeadlineRule.StageAnchorPrefix + stage.Key)?.Key;
        var period = periodField is null ? null : answers.Get(periodField);
        var row = evaluation.Stages.Single(s => s.StageKey == stage.Key);
        var signatureKey = schema.Sections
            .Where(s => s.Stage == stage.Key)
            .SelectMany(s => s.Fields)
            .FirstOrDefault(f => f.Type == "signature" && f.SignatureRole() == SignatureRole.Evaluated)?.Key;
        var signed = signatureKey is not null
            && await db.EvaluationSignatures.AnyAsync(s => s.EvaluationId == evaluation.Id && s.FieldKey == signatureKey, ct);

        return new ReportContext(
            office is null ? null : answers.Text(office),
            person is null ? null : answers.Text(person, "firstName"),
            person is null ? null : answers.Text(person, "lastName"),
            person is null ? null : answers.Text(person, "department"),
            person is null ? null : answers.Text(person, "position"),
            period?.ValueDate ?? row.DueFrom,
            period?.ValueDateTo ?? row.DueTo,
            signatureKey,
            signed,
            SubmitBlockedReason(schema, evaluation, stage, row));
    }

    /// <summary>
    /// Sprawozdanie składa się w terminie wyznaczonym przez bezpośredniego przełożonego na rozmowie wstępnej
    /// (§ 4 ust. 1–2): nie przed zamknięciem tej rozmowy i nie przed początkiem terminu. Po końcu terminu złożyć
    /// nadal można — wtedy w arkuszu „sprawozdanie złożone w wyznaczonym terminie” = nie.
    /// </summary>
    private static string? SubmitBlockedReason(TemplateSchema schema, Evaluation evaluation, StageDefinition stage, EvaluationStage row)
    {
        var earlier = schema.Stages.TakeWhile(s => s.Key != stage.Key)
            .FirstOrDefault(s => !s.Optional && evaluation.Stages.Any(x => x.StageKey == s.Key && x.Status == StageStatus.Pending));
        if (earlier is not null)
        {
            return $"Sprawozdanie złożysz po etapie „{earlier.Title}” — przełożony wyznacza wtedy termin jego złożenia.";
        }

        return row.DueFrom is { } from && Today < from
            ? $"Sprawozdanie można złożyć od {from:dd.MM.yyyy} — od początku terminu wyznaczonego przez przełożonego."
            : null;
    }

    /// <summary>
    /// Treść formularza: tekst wpisany przez ocenianego, pod nim samoocena elementów (stopień i przykłady) i potrzeby
    /// rozwojowe — jako zwykły tekst, tak jak trafia do PDF.
    /// </summary>
    private static string ComposeReport(string? report, IEnumerable<SelfAssessmentCriterionDto> criteria, IReadOnlyList<ScaleOption> scale, string? needs)
    {
        var parts = new List<string>();
        if (!string.IsNullOrWhiteSpace(report))
        {
            parts.Add(report.Trim());
        }

        var lines = criteria
            .Where(c => c.Level is not null || c.Comment is not null)
            .Select(c =>
            {
                var level = scale.FirstOrDefault(o => o.Key == c.Level)?.Label.ToLower(Polish);
                var text = string.Join(". ", new[] { level, c.Comment?.Trim() }.Where(t => !string.IsNullOrEmpty(t)));
                return $"{c.Label} – {text}{(char.IsPunctuation(text[^1]) ? "" : ".")}";
            })
            .ToList();
        if (lines.Count > 0)
        {
            parts.Add("Samoocena w elementach oceny:\n" + string.Join("\n", lines));
        }

        if (!string.IsNullOrWhiteSpace(needs))
        {
            parts.Add($"Potrzeby rozwojowe: {needs.Trim()}");
        }

        return string.Join("\n\n", parts);
    }

    private static SelfAssessmentDto ToDto(Context context)
    {
        var self = context.SelfAssessment;
        var submitted = self?.SubmittedAt is not null;
        var visible = context.IsOwn || submitted;
        var byKey = visible ? self?.Criteria.ToDictionary(c => c.CriterionKey) ?? [] : [];
        var dueTo = EvaluationWorkflow.SelfAssessmentDueTo(context.Stage, context.Evaluation.Stages.SingleOrDefault(s => s.StageKey == context.Stage?.Key)?.DueTo);
        var criteria = context.Criteria
            .Select(c => new SelfAssessmentCriterionDto(c.Key, c.Label, byKey.GetValueOrDefault(c.Key)?.Level, byKey.GetValueOrDefault(c.Key)?.Comment))
            .ToList();
        var needs = visible ? self?.DevelopmentNeeds : null;
        var report = context.Report is { } r
            ? new ReportFormDto(r.Office, r.FirstName, r.LastName, r.Department, r.Position, r.PeriodFrom, r.PeriodTo,
                visible ? self?.Report : null,
                visible ? ComposeReport(self?.Report, criteria, context.Scale, needs) : "",
                r.SignatureFieldKey, r.Signed, submitted ? null : r.SubmitBlockedReason)
            : null;

        return new SelfAssessmentDto(
            context.Stage?.Key,
            context.StageOpen && !context.IsFinal,
            context.IsOwn && context.Stage is not null && context.StageOpen && !context.IsFinal && !submitted,
            submitted,
            self?.SubmittedAt,
            visible ? self?.UpdatedAt : null,
            context.Scale.Select(o => new ScaleOptionDto(o.Value, o.Key, o.Label)).ToList(),
            criteria,
            needs,
            dueTo,
            !submitted && context.StageOpen && dueTo < Today,
            report);
    }
}
