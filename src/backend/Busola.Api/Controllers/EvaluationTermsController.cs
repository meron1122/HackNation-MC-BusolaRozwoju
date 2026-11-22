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
/// Terminy oceny a nieobecności. Odczyt: nieobecności od początku okresu oceny, historia zmian terminów i podpowiedzi.
/// Decyzje (oceniający / kadry z edit_evaluation, nie we własnej ocenie):
/// - pierwsza ocena: nowy termin sprawozdania (§ 5 ust. 1–3 rozporządzenia z 2015 r.) i przedłużenie umowy o czas
///   nieobecności (art. 35 ust. 4 ustawy), które przesuwa okres oceny;
/// - ocena okresowa: zmiana terminu (art. 81 ust. 8 ustawy). Przedłużenie z art. 81 ust. 7 dzieje się samo
///   (<see cref="AbsenceDeadlines.RecalculateAsync"/>).
/// Do zmian wymagających pisma jest PDF zawiadomienia (§ 5 ust. 4 / § 8 rozporządzenia z 2016 r.).
/// </summary>
[ApiController]
[Route("api/evaluations/{id:int}/terms")]
[Authorize(Policy = Permissions.ReadEvaluations)]
public sealed class EvaluationTermsController(BusolaDbContext db, AccessScopeService access) : ControllerBase
{
    private const int MaxReasonLength = 1000;

    private static readonly string[] Grounds =
    [
        "zmiana na stanowisku oceniającego",
        "przewidywana dłuższa usprawiedliwiona nieobecność ocenianego",
        "przewidywana dłuższa usprawiedliwiona nieobecność oceniającego",
        "wniosek ocenianego",
    ];

    private string UserId => User.FindFirstValue(BusolaClaims.UserId)!;

    private static DateOnly Today => DateOnly.FromDateTime(DateTime.Today);

    [HttpGet]
    public async Task<ActionResult<EvaluationTermsDto>> Get(int id, CancellationToken ct)
    {
        var evaluation = await LoadAsync(Permissions.ReadEvaluations, id, ct);
        if (evaluation is null)
        {
            return NotFound();
        }

        var schema = TemplateSchema.Parse(evaluation.Template.Schema);
        var isFirst = evaluation.Template.Kind == EvaluationKind.First;
        var isFinal = EvaluationWorkflow.IsFinal(schema, evaluation.Status);
        var report = ReportStage(schema, evaluation);
        var rating = RatingStage(schema, evaluation);
        var canEdit = await CanEditAsync(evaluation, ct);

        var periods = await AbsenceDeadlines.LoadAsync(db, evaluation.EmployeeId, ct);
        var absences = await db.Absences
            .Where(a => a.EmployeeId == evaluation.EmployeeId && (a.EndDate == null || a.EndDate >= evaluation.StartDate))
            .OrderBy(a => a.StartDate)
            .Select(a => new AbsenceDto(a.Id, a.StartDate, a.EndDate, a.ReasonId, a.Reason.Name, a.Reason.Kind.ToString()))
            .ToListAsync(ct);

        var changes = await ChangesAsync(id, ct);
        ReportTermSuggestionDto? suggestion = null;
        if (isFirst && report is { Status: StageStatus.Pending, DueTo: { } reportTo })
        {
            // § 5 ust. 1: usprawiedliwiona nieobecność albo obowiązki służbowe poza miejscem pracy. Liczymy od pierwotnego
            // terminu (sprzed pierwszej zmiany) do obecnego końca — nieobecność już uwzględniona w nowym terminie nie podpowiada
            // kolejnego przedłużenia, a nowa w przedłużonym terminie tak.
            var original = changes.FirstOrDefault(c => c.Kind == nameof(TermChangeKind.ReportTerm));
            var originalFrom = original is null ? report.DueFrom : original.OldFrom;
            var originalTo = original?.OldTo ?? reportTo;
            var blocks = AbsenceDeadlines.Blocks(periods, k => k is AbsenceKind.Justified or AbsenceKind.OfficialDuty);
            var (days, inWindow) = AbsenceDeadlines.InWindow(originalFrom ?? evaluation.StartDate, reportTo, blocks, Today);
            var suggested = PolishCalendar.ToWorkingDay(originalTo.AddDays(days));
            if (days > 0 && suggested > reportTo)
            {
                suggestion = new ReportTermSuggestionDto(report.DueFrom, suggested, days,
                    inWindow.Select(b => $"{b.Text} ({string.Join(", ", b.Reasons)})").ToList(), rating?.DueTo);
            }
        }

        FirstYearAbsenceDto? firstYear = null;
        if (isFirst)
        {
            var (days, longContinuous, threshold) = AbsenceDeadlines.FirstYear(
                evaluation.StartDate, AbsenceDeadlines.Blocks(periods, k => k == AbsenceKind.Justified), Today);
            firstYear = new FirstYearAbsenceDto(days, longContinuous, threshold);
        }

        return new EvaluationTermsDto(
            absences,
            changes,
            suggestion,
            firstYear,
            await db.EmployeeProfiles.Where(p => p.EmployeeId == evaluation.EmployeeId).Select(p => p.ContractEnd).SingleOrDefaultAsync(ct),
            canEdit && isFirst && !isFinal && report?.Status == StageStatus.Pending,
            canEdit && isFirst && !isFinal && rating?.Status == StageStatus.Pending,
            canEdit && !isFirst && !isFinal && rating?.Status == StageStatus.Pending,
            isFirst ? null : evaluation.StartDate.AddMonths(6).AddDays(1));
    }

    /// <summary>Pierwsza ocena: nowy termin sprawozdania (§ 5 ust. 1 — nieobecność / obowiązki poza miejscem pracy; ust. 2 — po przedłużeniu umowy).</summary>
    [HttpPost("report")]
    [Authorize(Policy = Permissions.EditEvaluation)]
    public async Task<ActionResult<TermChangeDto>> ChangeReportTerm(int id, ReportTermRequest request, CancellationToken ct)
    {
        var (evaluation, schema, error) = await LoadForEditAsync(id, ct);
        if (error is not null)
        {
            return error;
        }

        var report = ReportStage(schema!, evaluation!);
        if (evaluation!.Template.Kind != EvaluationKind.First || report is null)
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, detail: "Nowy termin sprawozdania wyznacza się tylko w pierwszej ocenie.");
        }

        if (report.Status != StageStatus.Pending)
        {
            return Problem(statusCode: StatusCodes.Status409Conflict, detail: "Sprawozdanie zostało już złożone albo oznaczone jako niezłożone.");
        }

        var from = request.DueFrom ?? report.DueFrom;
        var latest = RatingStage(schema!, evaluation)?.DueTo;
        var problem = ReasonProblem(request.Reason)
            ?? (from > request.DueTo ? "Początek terminu jest późniejszy niż koniec." : null)
            ?? (report.DueTo is { } oldTo && request.DueTo <= oldTo
                ? $"Nowy termin przedłuża dotychczasowy (§ 5 ust. 1), więc musi kończyć się później niż {Date(oldTo)}."
                : null)
            ?? (latest is { } last && request.DueTo > last
                ? $"Termin może kończyć się najpóźniej {Date(last)}, żeby ocenę dało się dokonać najpóźniej miesiąc przed zakończeniem stosunku pracy (§ 5 ust. 3)."
                : null);
        if (problem is not null)
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, detail: problem);
        }

        var legalRef = request.AfterContractExtension ? "§ 5 ust. 2" : "§ 5 ust. 1";
        var change = await RecordAsync(evaluation, TermChangeKind.ReportTerm, report, legalRef, request.Reason, from, request.DueTo, null, ct);
        report.DueFrom = from;
        report.DueTo = request.DueTo;
        report.DueNote = $"Nowy termin wyznaczony {Date(Today)} ({legalRef}); zawiadomienie w historii terminów.";
        await db.SaveChangesAsync(ct);

        return ToDto(change);
    }

    /// <summary>Ocena okresowa: zmiana terminu decyzją oceniającego (art. 81 ust. 8), gdy od początku okresu oceny minęło ponad 6 miesięcy.</summary>
    [HttpPost("evaluation")]
    [Authorize(Policy = Permissions.EditEvaluation)]
    public async Task<ActionResult<TermChangeDto>> ChangeEvaluationTerm(int id, EvaluationTermRequest request, CancellationToken ct)
    {
        var (evaluation, schema, error) = await LoadForEditAsync(id, ct);
        if (error is not null)
        {
            return error;
        }

        var rating = RatingStage(schema!, evaluation!);
        if (evaluation!.Template.Kind != EvaluationKind.Periodic || rating is null)
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, detail: "Zmiana terminu z art. 81 ust. 8 dotyczy oceny okresowej.");
        }

        if (rating.Status != StageStatus.Pending)
        {
            return Problem(statusCode: StatusCodes.Status409Conflict, detail: "Ocena jest już sporządzona.");
        }

        var earliest = evaluation.StartDate.AddMonths(6).AddDays(1);
        var problem = ReasonProblem(request.Reason)
            ?? (request.Ground is < 1 or > 4 ? "Wskaż podstawę: art. 81 ust. 8 pkt 1–4." : null)
            ?? (request.DueTo < earliest
                ? $"Termin można zmienić na dzień, w którym od początku okresu oceny upłynie ponad 6 miesięcy — najwcześniej {Date(earliest)} (art. 81 ust. 8)."
                : null);
        if (problem is not null)
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, detail: problem);
        }

        var legalRef = $"art. 81 ust. 8 pkt {request.Ground}";
        var change = await RecordAsync(evaluation, TermChangeKind.EvaluationTerm, rating, legalRef,
            $"{Grounds[request.Ground - 1]}: {request.Reason.Trim()}", rating.DueFrom, request.DueTo, null, ct);
        rating.BaseDueTo = null;
        rating.DueTo = request.DueTo;
        if (rating.DueFrom > request.DueTo)
        {
            rating.DueFrom = null;
        }

        rating.DueNote = $"Termin zmieniony {Date(Today)} ({legalRef}); przedłużenie z art. 81 ust. 7 już nie działa.";
        await db.SaveChangesAsync(ct);

        return ToDto(change);
    }

    /// <summary>
    /// Pierwsza ocena: przedłużenie umowy o czas usprawiedliwionej nieobecności (art. 35 ust. 4) — nowy koniec umowy
    /// w profilu i okres oceny do miesiąca przed nim. Potem przełożony wyznacza nowy termin sprawozdania (§ 5 ust. 2).
    /// </summary>
    [HttpPost("contract")]
    [Authorize(Policy = Permissions.EditEvaluation)]
    public async Task<ActionResult<TermChangeDto>> ExtendContract(int id, ContractExtensionRequest request, CancellationToken ct)
    {
        var (evaluation, schema, error) = await LoadForEditAsync(id, ct);
        if (error is not null)
        {
            return error;
        }

        var rating = RatingStage(schema!, evaluation!);
        if (evaluation!.Template.Kind != EvaluationKind.First || rating is null)
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, detail: "Przedłużenie umowy z art. 35 ust. 4 dotyczy pierwszej oceny.");
        }

        if (rating.Status != StageStatus.Pending)
        {
            return Problem(statusCode: StatusCodes.Status409Conflict, detail: "Pierwsza ocena jest już dokonana.");
        }

        var profile = await db.EmployeeProfiles.SingleOrDefaultAsync(p => p.EmployeeId == evaluation.EmployeeId, ct);
        var currentEnd = profile?.ContractEnd ?? evaluation.StartDate.AddMonths(12).AddDays(-1);
        var problem = ReasonProblem(request.Reason)
            ?? (request.ContractEnd <= currentEnd ? $"Nowy koniec umowy musi być późniejszy niż {Date(currentEnd)}." : null);
        if (problem is not null)
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, detail: problem);
        }

        if (profile is null)
        {
            profile = new EmployeeProfile { EmployeeId = evaluation.EmployeeId };
            db.EmployeeProfiles.Add(profile);
        }

        var newDue = PolishCalendar.ToWorkingDay(request.ContractEnd.AddMonths(-1));
        var change = await RecordAsync(evaluation, TermChangeKind.ContractExtension, rating, "art. 35 ust. 4", request.Reason,
            rating.DueFrom, newDue, request.ContractEnd, ct);
        profile.ContractEnd = request.ContractEnd;
        rating.DueTo = newDue;
        rating.DueNote = $"Umowa przedłużona do {Date(request.ContractEnd)} (art. 35 ust. 4); ocena najpóźniej miesiąc przed jej końcem.";
        await db.SaveChangesAsync(ct);

        return ToDto(change);
    }

    /// <summary>Zawiadomienie ocenianego o nowym terminie (§ 5 ust. 4 rozporządzenia z 2015 r. / § 8 rozporządzenia z 2016 r.).</summary>
    [HttpGet("changes/{changeId:int}/pdf")]
    public async Task<IActionResult> GetNotice(int id, int changeId, CancellationToken ct)
    {
        var evaluation = await LoadAsync(Permissions.ReadEvaluations, id, ct);
        var change = await db.EvaluationTermChanges.SingleOrDefaultAsync(c => c.Id == changeId && c.EvaluationId == id, ct);
        if (evaluation is null || change is null || change.Kind == TermChangeKind.ContractExtension)
        {
            return NotFound();
        }

        var employee = await db.Employees
            .Where(e => e.Id == evaluation.EmployeeId)
            .Select(e => new
            {
                Name = e.FirstName + " " + e.LastName,
                Position = e.Position != null ? e.Position.Name : null,
                Department = e.Department.Name,
                Office = e.Department.Location.Service.Name,
            })
            .SingleAsync(ct);

        var report = change.Kind == TermChangeKind.ReportTerm;
        string[] paragraphs = report
            ?
            [
                $"Na podstawie {change.LegalRef} rozporządzenia Prezesa Rady Ministrów z dnia 23 lipca 2015 r. w sprawie szczegółowych " +
                "warunków i sposobu dokonywania pierwszej oceny w służbie cywilnej (Dz. U. poz. 1144) wyznaczam nowy termin na złożenie " +
                $"sprawozdania dotyczącego zadań realizowanych w trakcie przepracowanego okresu: od {Date(change.NewFrom)} do {Date(change.NewTo)}.",
                $"Dotychczasowy termin: od {Date(change.OldFrom)} do {Date(change.OldTo)}.",
                $"Uzasadnienie: {change.Reason}",
            ]
            :
            [
                $"Na podstawie {change.LegalRef} ustawy z dnia 21 listopada 2008 r. o służbie cywilnej zawiadamiam o zmianie terminu " +
                $"sporządzenia oceny okresowej na piśmie na dzień {Date(change.NewTo)} (dotychczas: {Date(change.OldTo)}).",
                $"Przyczyna: {change.Reason}",
            ];

        var pdf = EvaluationSheetPdf.RenderNotice(new TermNotice(
            employee.Office,
            employee.Name,
            string.Join(", ", new[] { employee.Position, employee.Department }.Where(x => !string.IsNullOrEmpty(x))),
            report ? "Zawiadomienie o wyznaczeniu nowego terminu na złożenie sprawozdania" : "Zawiadomienie o zmianie terminu sporządzenia oceny okresowej",
            paragraphs,
            change.ChangedByName,
            report ? "podpis bezpośredniego przełożonego" : "podpis oceniającego",
            change.ChangedOn,
            report
                ? "Oryginał otrzymuje oceniany, kopię dołącza się do arkusza pierwszej oceny (§ 5 ust. 4 rozporządzenia z 2015 r.)."
                : "Kopię pisma dołącza się do arkusza oceny (§ 8 rozporządzenia Prezesa Rady Ministrów z dnia 4 kwietnia 2016 r.)."));

        return File(pdf, "application/pdf", $"zawiadomienie-termin-{id}-{changeId}.pdf");
    }

    private async Task<EvaluationTermChange> RecordAsync(
        Evaluation evaluation, TermChangeKind kind, EvaluationStage stage, string legalRef, string reason,
        DateOnly? newFrom, DateOnly? newTo, DateOnly? contractEnd, CancellationToken ct)
    {
        var name = await db.Users
            .Where(u => u.Id == UserId)
            .Select(u => u.Employee != null ? u.Employee.FirstName + " " + u.Employee.LastName : u.Email!)
            .SingleAsync(ct);
        var change = new EvaluationTermChange
        {
            EvaluationId = evaluation.Id,
            Kind = kind,
            StageKey = stage.StageKey,
            LegalRef = legalRef,
            OldFrom = stage.DueFrom,
            OldTo = stage.DueTo,
            NewFrom = newFrom,
            NewTo = newTo,
            ContractEnd = contractEnd,
            Reason = reason.Trim(),
            ChangedById = UserId,
            ChangedByName = name,
            ChangedOn = Today,
            CreatedAt = DateTimeOffset.UtcNow,
        };
        db.EvaluationTermChanges.Add(change);
        return change;
    }

    private async Task<IReadOnlyList<TermChangeDto>> ChangesAsync(int id, CancellationToken ct) =>
        (await db.EvaluationTermChanges.Where(c => c.EvaluationId == id).OrderBy(c => c.Id).ToListAsync(ct)).Select(ToDto).ToList();

    private static TermChangeDto ToDto(EvaluationTermChange c) =>
        new(c.Id, c.Kind.ToString(), c.StageKey, c.LegalRef, c.OldFrom, c.OldTo, c.NewFrom, c.NewTo, c.ContractEnd, c.Reason,
            c.ChangedByName, c.ChangedOn, c.Kind != TermChangeKind.ContractExtension);

    private static string? ReasonProblem(string? reason) =>
        string.IsNullOrWhiteSpace(reason) ? "Podaj uzasadnienie (np. okres i rodzaj nieobecności)."
        : reason.Length > MaxReasonLength ? $"Uzasadnienie może mieć najwyżej {MaxReasonLength} znaków."
        : null;

    private static string Date(DateOnly? date) => date?.ToString("dd.MM.yyyy", CultureInfo.InvariantCulture) ?? "—";

    /// <summary>Etap sprawozdania (zamykany przez ocenianego) — tylko pierwsza ocena.</summary>
    private static EvaluationStage? ReportStage(TemplateSchema schema, Evaluation evaluation) =>
        schema.Stages.FirstOrDefault(s => s.CompletedByEvaluated) is { } definition
            ? evaluation.Stages.SingleOrDefault(s => s.StageKey == definition.Key)
            : null;

    /// <summary>Etap z ocenami cząstkowymi: jego termin to okres pierwszej oceny albo termin oceny okresowej.</summary>
    private static EvaluationStage? RatingStage(TemplateSchema schema, Evaluation evaluation) =>
        EvaluationScoring.ScoresField(schema) is { } scores && schema.SectionOf(scores.Key)?.Stage is { } key
            ? evaluation.Stages.SingleOrDefault(s => s.StageKey == key)
            : null;

    private async Task<Evaluation?> LoadAsync(string permission, int id, CancellationToken ct)
    {
        var scope = await access.ResolveAsync(permission, ct);
        var employeeIds = db.Employees.InScope(scope).Select(e => e.Id);
        return await db.Evaluations
            .Include(e => e.Template)
            .Include(e => e.Stages)
            .SingleOrDefaultAsync(e => e.Id == id && (scope.All || employeeIds.Contains(e.EmployeeId)), ct);
    }

    private async Task<bool> CanEditAsync(Evaluation evaluation, CancellationToken ct) =>
        User.HasPermission(Permissions.EditEvaluation)
        && evaluation.EmployeeId != await MyEmployeeIdAsync(ct)
        && await db.Employees.InScope(await access.ResolveAsync(Permissions.EditEvaluation, ct)).AnyAsync(e => e.Id == evaluation.EmployeeId, ct);

    private async Task<(Evaluation? Evaluation, TemplateSchema? Schema, ActionResult? Error)> LoadForEditAsync(int id, CancellationToken ct)
    {
        var evaluation = await LoadAsync(Permissions.EditEvaluation, id, ct);
        if (evaluation is null)
        {
            return (null, null, NotFound());
        }

        if (evaluation.EmployeeId == await MyEmployeeIdAsync(ct))
        {
            return (null, null, Problem(statusCode: StatusCodes.Status403Forbidden, detail: "Nie możesz zmieniać terminów własnej oceny."));
        }

        var schema = TemplateSchema.Parse(evaluation.Template.Schema);
        return EvaluationWorkflow.IsFinal(schema, evaluation.Status)
            ? (null, null, Problem(statusCode: StatusCodes.Status409Conflict, detail: "Ocena jest zamknięta."))
            : (evaluation, schema, null);
    }

    private Task<int?> MyEmployeeIdAsync(CancellationToken ct) =>
        db.Users.Where(u => u.Id == UserId).Select(u => u.EmployeeId).SingleAsync(ct);
}
