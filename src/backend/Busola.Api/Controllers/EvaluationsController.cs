using System.Security.Claims;
using System.Security.Cryptography;
using System.Text.Json;
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
/// Oceny: zakładanie, wypełnianie pól, zamykanie etapów, podpisy. Zakres jak przy pracownikach
/// (przełożony — podwładni, HR — służba). Nikt nie wypełnia własnej oceny; oceniany tylko podpisuje swoje pola.
/// </summary>
[ApiController]
[Route("api/evaluations")]
public sealed class EvaluationsController(BusolaDbContext db, AccessScopeService access) : ControllerBase
{
    private const int MaxSignatureImageBytes = 512 * 1024;

    private string UserId => User.FindFirstValue(BusolaClaims.UserId)!;

    [HttpGet("/api/evaluation-templates")]
    [Authorize(Policy = Permissions.ReadEvaluations)]
    public async Task<IReadOnlyList<EvaluationTemplateDto>> GetTemplates(CancellationToken ct) =>
        await db.EvaluationTemplates
            .Where(t => t.IsActive)
            .OrderBy(t => t.Id)
            .Select(t => new EvaluationTemplateDto(t.Id, t.Code, t.Version, t.Kind.ToString(), t.Title))
            .ToListAsync(ct);

    [HttpGet]
    [Authorize(Policy = Permissions.ReadEvaluations)]
    public async Task<IReadOnlyList<EvaluationListItemDto>> GetAll(int? employeeId, CancellationToken ct)
    {
        var scope = await access.ResolveAsync(Permissions.ReadEvaluations, ct);
        var query = InScope(scope)
            .Where(e => employeeId == null || e.EmployeeId == employeeId)
            .OrderByDescending(e => e.Id);
        var rows = await EvaluationProgress.LoadAsync(db, query, Today, ct);

        var schemas = await EvaluationWorkflow.LoadSchemasAsync(db, rows.Select(r => r.TemplateId), ct);
        return rows.Select(r =>
        {
            var p = r.Progress;
            return new EvaluationListItemDto(
                r.EvaluationId, r.EmployeeId, r.EmployeeName, r.TemplateTitle, r.Status,
                EvaluationWorkflow.StatusLabel(schemas[r.TemplateId], r.Status), p.IsFinal, r.StartDate,
                p.StageTitle, p.DueTo, p.TemplateCode, p.Phase);
        }).ToList();
    }

    /// <summary>
    /// Sprawdzenie przed zamknięciem etapu / podpisem (W11): braki per sekcja i per etap z odwołaniem do przepisu,
    /// blokady sekcji zamkniętych etapów, „ptaszki” kroków (sekcja Complete).
    /// </summary>
    [HttpGet("{id:int}/check")]
    [Authorize(Policy = Permissions.ReadEvaluations)]
    public async Task<ActionResult<EvaluationCheckDto>> Check(int id, CancellationToken ct)
    {
        var scope = await access.ResolveAsync(Permissions.ReadEvaluations, ct);
        var evaluation = await InScope(scope)
            .AsNoTracking()
            .Include(e => e.Template)
            .Include(e => e.Stages)
            .Include(e => e.Answers)
            .SingleOrDefaultAsync(e => e.Id == id, ct);

        if (evaluation is null)
        {
            return NotFound();
        }

        var schema = TemplateSchema.Parse(evaluation.Template.Schema);
        var check = await RunCheckAsync(evaluation, schema, ct);
        var draft = evaluation.EmployeeId == await MyEmployeeIdAsync(ct)
            ? EvaluationWorkflow.DraftSections(schema, evaluation.Stages.Select(s => (s.StageKey, s.Status)))
            : new HashSet<string>();
        if (draft.Count == 0)
        {
            return check;
        }

        // Ocenianemu nie pokazujemy braków roboczej oceny — zdradzałyby wpisane punkty.
        var draftStages = schema.Sections.Where(s => draft.Contains(s.Key)).Select(s => s.Stage).ToHashSet();
        return check with
        {
            Sections = check.Sections.Select(s => draft.Contains(s.Key) ? s with { Complete = false, Issues = [] } : s).ToList(),
            Stages = check.Stages.Select(s => draftStages.Contains(s.Key) ? s with { Issues = [] } : s).ToList(),
        };
    }

    [HttpPost]
    [Authorize(Policy = Permissions.AddEvaluation)]
    public async Task<ActionResult<EvaluationDetailDto>> Create(CreateEvaluationRequest request, CancellationToken ct)
    {
        var scope = await access.ResolveAsync(Permissions.AddEvaluation, ct);
        var employee = await db.Employees.InScope(scope).SingleOrDefaultAsync(e => e.Id == request.EmployeeId, ct);
        if (employee is null)
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, detail: "Nie ma takiego pracownika w Twoim zakresie.");
        }

        if (employee.Id == await MyEmployeeIdAsync(ct))
        {
            return Problem(statusCode: StatusCodes.Status403Forbidden, detail: "Nie możesz zakładać własnej oceny.");
        }

        var template = await db.EvaluationTemplates.SingleOrDefaultAsync(t => t.Code == request.TemplateCode && t.IsActive, ct);
        if (template is null)
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, detail: "Nie ma takiego szablonu.");
        }

        var start = request.StartDate
            ?? (template.Kind == EvaluationKind.First ? employee.HireDate : DateOnly.FromDateTime(DateTime.Today));

        var evaluation = await EvaluationWorkflow.StartAsync(db, employee, template.Code, start, ct);
        await db.SaveChangesAsync(ct);

        return CreatedAtAction(nameof(Get), new { id = evaluation.Id }, (await LoadDetailAsync(evaluation.Id, scope, ct))!);
    }

    [HttpGet("{id:int}")]
    [Authorize(Policy = Permissions.ReadEvaluations)]
    public async Task<ActionResult<EvaluationDetailDto>> Get(int id, CancellationToken ct)
    {
        var scope = await access.ResolveAsync(Permissions.ReadEvaluations, ct);
        var detail = await LoadDetailAsync(id, scope, ct);
        return detail is null ? NotFound() : detail;
    }

    [HttpPut("{id:int}/answers")]
    [Authorize(Policy = Permissions.EditEvaluation)]
    public async Task<IActionResult> SaveAnswers(int id, SaveAnswersRequest request, CancellationToken ct)
    {
        var (evaluation, schema, error) = await LoadForEditAsync(id, ct, includeAnswers: true);
        if (error is not null)
        {
            return error;
        }

        if (EvaluationWorkflow.IsFinal(schema!, evaluation!.Status))
        {
            return Problem(statusCode: StatusCodes.Status409Conflict, detail: "Ocena jest zamknięta.");
        }

        var editable = schema!.Sections.SelectMany(s => s.Fields)
            .Where(f => f.Type is not ("signature" or "notice"))
            .Select(f => f.Key)
            .ToHashSet();
        var unknown = request.Answers.Select(a => a.FieldKey).Where(k => !editable.Contains(k)).Distinct().ToList();
        if (unknown.Count > 0)
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, detail: $"Szablon nie ma pól: {string.Join(", ", unknown)}.");
        }

        // Po zamknięciu etapu jego sekcje są zablokowane (np. część I po podpisach, uzasadnienie po sporządzeniu oceny).
        var locked = request.Answers
            .Select(a => schema.SectionOf(a.FieldKey)!)
            .DistinctBy(s => s.Key)
            .Where(s => evaluation.Stages.SingleOrDefault(st => st.StageKey == s.Stage)?.Status is not (null or StageStatus.Pending))
            .ToList();
        if (locked.Count > 0)
        {
            return Problem(statusCode: StatusCodes.Status409Conflict,
                detail: $"Etap jest już zamknięty, więc tych sekcji nie można zmieniać: {string.Join(", ", locked.Select(s => s.Title))}.");
        }

        var now = DateTimeOffset.UtcNow;
        foreach (var answer in request.Answers)
        {
            var existing = evaluation.Answers.FirstOrDefault(a => a.FieldKey == answer.FieldKey && a.ItemKey == answer.ItemKey);
            var text = string.IsNullOrWhiteSpace(answer.ValueText) ? null : answer.ValueText;
            if (text is null && answer.ValueNumber is null && answer.ValueDate is null)
            {
                if (existing is not null)
                {
                    db.EvaluationAnswers.Remove(existing);
                }

                continue;
            }

            if (existing is null)
            {
                existing = new EvaluationAnswer
                {
                    EvaluationId = evaluation.Id,
                    FieldKey = answer.FieldKey,
                    ItemKey = answer.ItemKey,
                    UpdatedById = UserId,
                };
                evaluation.Answers.Add(existing);
            }

            existing.ValueText = text;
            existing.ValueNumber = answer.ValueNumber;
            existing.ValueDate = answer.ValueDate;
            existing.ValueDateTo = answer.ValueDateTo;
            existing.UpdatedById = UserId;
            existing.UpdatedAt = now;
        }

        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    [HttpPost("{id:int}/stages/{stageKey}/complete")]
    [Authorize(Policy = Permissions.EditEvaluation)]
    public async Task<IActionResult> CompleteStage(int id, string stageKey, CompleteStageRequest request, CancellationToken ct)
    {
        var (evaluation, schema, error) = await LoadForEditAsync(id, ct, includeAnswers: true);
        if (error is not null)
        {
            return error;
        }

        var stage = evaluation!.Stages.SingleOrDefault(s => s.StageKey == stageKey);
        if (stage is null)
        {
            return NotFound();
        }

        if (stage.Status != StageStatus.Pending)
        {
            return Problem(statusCode: StatusCodes.Status409Conflict, detail: "Etap jest już zamknięty.");
        }

        var definition = schema!.Stages.Single(s => s.Key == stageKey);
        if (EvaluationWorkflow.IsFinal(schema, evaluation.Status) && !definition.Optional)
        {
            return Problem(statusCode: StatusCodes.Status409Conflict, detail: "Ocena jest zamknięta.");
        }

        // Sprawozdanie składa oceniany (§ 2 pkt 3, § 6 rozporządzenia z 2015 r.) — etap zamyka jego przekazanie.
        if (definition.CompletedByEvaluated)
        {
            return Problem(statusCode: StatusCodes.Status409Conflict,
                detail: "Ten etap zamyka oceniany, przekazując sprawozdanie. Po upływie terminu możesz oznaczyć sprawozdanie jako niezłożone.");
        }

        // Te same reguły co „Sprawdź przed podpisaniem”: braki blokujące nie pozwalają zamknąć etapu.
        var blocking = (await RunCheckAsync(evaluation, schema, ct)).Stages
            .Single(s => s.Key == stageKey).Issues.Where(i => i.Blocking).ToList();
        if (blocking.Count > 0)
        {
            var problem = ProblemDetailsFactory.CreateProblemDetails(HttpContext, StatusCodes.Status400BadRequest,
                detail: "Nie można zamknąć etapu: " + string.Join("; ", blocking.Select(i => i.LegalRef is null ? i.Message : $"{i.Message} ({i.LegalRef})")) + ".");
            problem.Extensions["issues"] = blocking;
            return new ObjectResult(problem) { StatusCode = problem.Status };
        }

        // Dane z kartoteki (osoby, urząd, data zatrudnienia) dla pustych pól sekcji tego etapu — kopia z chwili podpisu.
        var stageFields = schema.Sections.Where(s => s.Stage == stageKey).SelectMany(s => s.Fields).Select(f => f.Key).ToHashSet();
        foreach (var value in await EvaluationPrefill.LoadAsync(db, evaluation.Id, schema, evaluation.Answers.Select(ToDto), ct))
        {
            if (stageFields.Contains(value.FieldKey))
            {
                Upsert(evaluation, value);
            }
        }

        // Sporządzenie oceny: średnia, poziom i wynik liczy backend z ocen cząstkowych, dane poprzedniej oceny
        // z ostatniej sporządzonej — zapisane, żeby dokument się nie zmienił.
        if (EvaluationScoring.ScoresField(schema) is { } scores && schema.SectionOf(scores.Key)?.Stage == stageKey)
        {
            var current = new AnswerSet(evaluation.Answers.Select(ToDto));
            foreach (var computed in EvaluationScoring.ComputedAnswers(schema, EvaluationScoring.Compute(schema, current)))
            {
                Upsert(evaluation, computed);
            }

            var previous = await LoadPreviousAsync(evaluation, ct);
            foreach (var field in schema.Sections.SelectMany(s => s.Fields))
            {
                var value = field.ExtraString("prefill") switch
                {
                    "previous.result" => new AnswerDto(field.Key, ValueText: previous?.Result),
                    "previous.level" => new AnswerDto(field.Key, ValueText: previous?.Level),
                    "previous.date" => new AnswerDto(field.Key, ValueDate: previous?.Date),
                    _ => null,
                };

                if (value is not null && current.Get(field.Key) is null)
                {
                    Upsert(evaluation, value);
                }
            }
        }

        EvaluationWorkflow.Complete(schema, evaluation, stage, request.CompletedOn);
        EvaluationWorkflow.ApplyDeadlinesFromAnswers(schema, evaluation, stageKey, new AnswerSet(evaluation.Answers.Select(ToDto)));
        await db.SaveChangesAsync(ct);

        if (stageKey == "evaluation")
        {
            await StartNextPeriodicCycleAsync(id, request.CompletedOn, ct);
        }

        return NoContent();
    }

    private static AnswerDto ToDto(EvaluationAnswer a) => new(a.FieldKey, a.ItemKey, a.ValueText, a.ValueNumber, a.ValueDate, a.ValueDateTo);

    /// <summary>Zapis wartości pola na załadowanej ocenie; same nulle = usunięcie wpisu.</summary>
    private void Upsert(Evaluation evaluation, AnswerDto value)
    {
        var existing = evaluation.Answers.FirstOrDefault(a => a.FieldKey == value.FieldKey && a.ItemKey == value.ItemKey);
        if (value.ValueText is null && value.ValueNumber is null && value.ValueDate is null)
        {
            if (existing is not null)
            {
                db.EvaluationAnswers.Remove(existing);
                evaluation.Answers.Remove(existing);
            }

            return;
        }

        if (existing is null)
        {
            existing = new EvaluationAnswer { EvaluationId = evaluation.Id, FieldKey = value.FieldKey, ItemKey = value.ItemKey, UpdatedById = UserId };
            evaluation.Answers.Add(existing);
        }

        existing.ValueText = value.ValueText;
        existing.ValueNumber = value.ValueNumber;
        existing.ValueDate = value.ValueDate;
        existing.ValueDateTo = value.ValueDateTo;
        existing.UpdatedById = UserId;
        existing.UpdatedAt = DateTimeOffset.UtcNow;
    }

    private async Task<EvaluationCheckDto> RunCheckAsync(Evaluation evaluation, TemplateSchema schema, CancellationToken ct)
    {
        var signed = (await db.EvaluationSignatures
            .Where(s => s.EvaluationId == evaluation.Id)
            .Select(s => s.FieldKey)
            .ToListAsync(ct)).ToHashSet();
        var submitted = await db.EvaluationSelfAssessments.AnyAsync(s => s.EvaluationId == evaluation.Id && s.SubmittedAt != null, ct);

        // Pola uzupełniane z kartoteki nie są brakiem — zapiszą się przy zamknięciu etapu.
        var stored = evaluation.Answers.Select(ToDto).ToList();
        var prefill = await EvaluationPrefill.LoadAsync(db, evaluation.Id, schema, stored, ct);

        return EvaluationCheck.Run(
            schema,
            evaluation.Stages.Select(s => new StageState(s.StageKey, s.Status, s.DueFrom, s.DueTo)).ToList(),
            EvaluationPrefill.Merge(stored, prefill),
            signed,
            EvaluationWorkflow.IsFinal(schema, evaluation.Status),
            submitted);
    }

    /// <summary>
    /// Ostatnia sporządzona ocena tego samego rodzaju (okresowa → poprzednia okresowa), sporządzona nie później niż
    /// start bieżącej. Data = zamknięcie etapu, w którym są oceny cząstkowe; wynik i poziom z jej zapisanych pól.
    /// </summary>
    private async Task<PreviousEvaluationDto?> LoadPreviousAsync(Evaluation evaluation, CancellationToken ct)
    {
        var kind = evaluation.Template?.Kind ?? await db.EvaluationTemplates.Where(t => t.Id == evaluation.TemplateId).Select(t => t.Kind).SingleAsync(ct);
        var candidates = await db.Evaluations
            .AsNoTracking()
            .Where(e => e.EmployeeId == evaluation.EmployeeId && e.Id != evaluation.Id && e.Template.Kind == kind)
            .Select(e => new
            {
                e.Id,
                e.Template.Title,
                e.Template.Schema,
                Stages = e.Stages.Where(s => s.Status == StageStatus.Completed).Select(s => new { s.StageKey, s.CompletedOn }).ToList(),
                Answers = e.Answers.Select(a => new AnswerDto(a.FieldKey, a.ItemKey, a.ValueText, a.ValueNumber, a.ValueDate, a.ValueDateTo)).ToList(),
            })
            .ToListAsync(ct);

        return candidates
            .Select(c =>
            {
                var schema = TemplateSchema.Parse(c.Schema);
                var scoringStage = EvaluationScoring.ScoresField(schema) is { } scores ? schema.SectionOf(scores.Key)?.Stage : null;
                var date = c.Stages.FirstOrDefault(s => s.StageKey == scoringStage)?.CompletedOn;
                if (date is null || date > evaluation.StartDate)
                {
                    return null;
                }

                var rules = EvaluationScoring.Rules(schema);
                var answers = new AnswerSet(c.Answers);
                var level = rules?.Level is { } levelKey ? answers.Text(levelKey) : null;
                return new PreviousEvaluationDto(
                    c.Id, c.Title, date.Value,
                    rules?.Result is { } resultKey ? answers.Text(resultKey) : null,
                    level,
                    rules?.Levels?.FirstOrDefault(l => l.Key == level)?.Label,
                    rules?.Average is { } averageKey ? answers.Get(averageKey)?.ValueNumber : null);
            })
            .Where(p => p is not null)
            .MaxBy(p => p!.Date);
    }

    private static DateOnly Today => DateOnly.FromDateTime(DateTime.Today);

    /// <summary>
    /// Sporządzenie oceny okresowej na piśmie otwiera kolejny 24-miesięczny cykl (od tego dnia),
    /// żeby pracownik nie wypadł z pilnowania terminów.
    /// </summary>
    private async Task StartNextPeriodicCycleAsync(int evaluationId, DateOnly start, CancellationToken ct)
    {
        var finished = await db.Evaluations
            .Include(e => e.Employee)
            .Include(e => e.Template)
            .SingleAsync(e => e.Id == evaluationId, ct);

        var alreadyStarted = await db.Evaluations.AnyAsync(e =>
            e.EmployeeId == finished.EmployeeId && e.StartDate == start && e.Template.Kind == EvaluationKind.Periodic, ct);
        if (finished.Template.Kind != EvaluationKind.Periodic || alreadyStarted)
        {
            return;
        }

        var templateCode = await EvaluationWorkflow.PeriodicTemplateCodeAsync(db, finished.EmployeeId, ct);
        await EvaluationWorkflow.StartAsync(db, finished.Employee, templateCode, start, ct);
        await db.SaveChangesAsync(ct);
    }

    /// <summary>
    /// Pominięcie: etap opcjonalny (np. brak sprzeciwu) albo sprawozdanie niezłożone w terminie — po jego upływie
    /// rozmowę oceniającą przeprowadza się bez sprawozdania (§ 8 ust. 1 rozporządzenia z 2015 r.).
    /// </summary>
    [HttpPost("{id:int}/stages/{stageKey}/skip")]
    [Authorize(Policy = Permissions.EditEvaluation)]
    public Task<IActionResult> SkipStage(int id, string stageKey, CancellationToken ct) =>
        ChangeStageAsync(id, stageKey, ct, (schema, _, stage) =>
        {
            var definition = schema.Stages.Single(s => s.Key == stageKey);
            if (definition.CompletedByEvaluated)
            {
                if (stage.DueTo is not { } due || due >= Today)
                {
                    return $"Sprawozdanie można oznaczyć jako niezłożone dopiero po upływie terminu{(stage.DueTo is { } d ? $" ({d:dd.MM.yyyy})" : "")}.";
                }
            }
            else if (!definition.Optional)
            {
                return "Pominąć można tylko etap opcjonalny.";
            }

            stage.Status = StageStatus.Skipped;
            return null;
        });

    /// <summary>
    /// Podpis pola „signature”. Pola ocenianego podpisuje wyłącznie oceniany; pozostałe — osoba z prawem
    /// wypełniania oceny w swoim zakresie.
    /// </summary>
    [HttpPost("{id:int}/signatures")]
    public async Task<ActionResult<SignatureDto>> Sign(int id, SignRequest request, CancellationToken ct)
    {
        var evaluation = await db.Evaluations.Include(e => e.Template).Include(e => e.Stages).SingleOrDefaultAsync(e => e.Id == id, ct);
        if (evaluation is null)
        {
            return NotFound();
        }

        var schema = TemplateSchema.Parse(evaluation.Template.Schema);
        var field = schema.Sections.SelectMany(s => s.Fields).SingleOrDefault(f => f.Key == request.FieldKey && f.Type == "signature");
        if (field?.SignatureRole() is not { } role)
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, detail: "Szablon nie ma takiego pola podpisu.");
        }

        var sectionStage = schema.SectionOf(field.Key)!.Stage;
        if (evaluation.Stages.SingleOrDefault(s => s.StageKey == sectionStage)?.Status is not (null or StageStatus.Pending))
        {
            return Problem(statusCode: StatusCodes.Status409Conflict, detail: "Etap tego podpisu jest już zamknięty.");
        }

        var me = await db.Users
            .Where(u => u.Id == UserId)
            .Select(u => new { u.EmployeeId, Name = u.Employee != null ? u.Employee.FirstName + " " + u.Employee.LastName : u.Email! })
            .SingleAsync(ct);

        if (role == SignatureRole.Evaluated)
        {
            if (me.EmployeeId != evaluation.EmployeeId)
            {
                return Problem(statusCode: StatusCodes.Status403Forbidden, detail: "To pole podpisuje oceniany.");
            }
        }
        else
        {
            if (!User.HasPermission(Permissions.EditEvaluation))
            {
                return Forbid();
            }

            var scope = await access.ResolveAsync(Permissions.EditEvaluation, ct);
            if (!await db.Employees.InScope(scope).AnyAsync(e => e.Id == evaluation.EmployeeId, ct))
            {
                return NotFound();
            }

            if (me.EmployeeId == evaluation.EmployeeId)
            {
                return Problem(statusCode: StatusCodes.Status403Forbidden, detail: "Nie możesz podpisywać własnej oceny za oceniającego.");
            }

            // Gdy wydział ma wskazanego kierującego komórką, jego pole podpisuje tylko on.
            if (role == SignatureRole.UnitHead
                && await db.Employees.Where(e => e.Id == evaluation.EmployeeId).Select(e => e.Department.HeadId).SingleAsync(ct) is { } headId
                && headId != me.EmployeeId)
            {
                return Problem(statusCode: StatusCodes.Status403Forbidden, detail: "To pole podpisuje kierujący komórką organizacyjną.");
            }
        }

        if (EvaluationWorkflow.IsFinal(schema, evaluation.Status))
        {
            return Problem(statusCode: StatusCodes.Status409Conflict, detail: "Ocena jest zamknięta.");
        }

        var signature = new EvaluationSignature
        {
            EvaluationId = evaluation.Id,
            FieldKey = request.FieldKey,
            Role = role,
            SignedById = UserId,
            SignerName = me.Name,
            SignedOn = request.SignedOn,
            Place = string.IsNullOrWhiteSpace(request.Place) ? null : request.Place.Trim(),
            CreatedAt = DateTimeOffset.UtcNow,
        };

        if (!string.IsNullOrWhiteSpace(request.Image))
        {
            if (!TryDecodeImage(request.Image, out var bytes, out var contentType, out var problem))
            {
                return Problem(statusCode: StatusCodes.Status400BadRequest, detail: problem);
            }

            signature.ImageContent = bytes;
            signature.ImageContentType = contentType;
            signature.ImageSha256 = SHA256.HashData(bytes);
        }

        db.EvaluationSignatures.Add(signature);
        await db.SaveChangesAsync(ct);

        return new SignatureDto(signature.Id, signature.FieldKey, role.ToString(), signature.SignerName, signature.SignedOn,
            signature.Place, signature.ImageContent is not null);
    }

    /// <summary>
    /// Zmiana ścieżki / arkusza (W02: okresowa B/C albo pierwsza) — tylko zanim ocena się zaczęła: bez wpisów, podpisów,
    /// samooceny, notatek i kontekstu. Etapy i terminy liczą się od nowa według aktywnej wersji wybranego szablonu,
    /// od StartDate z żądania albo dotychczasowego. Danych kadrowych pracownika (SubjectToFirstEvaluation) nie zmienia.
    /// </summary>
    [HttpPut("{id:int}/template")]
    [Authorize(Policy = Permissions.EditEvaluation)]
    public async Task<ActionResult<EvaluationDetailDto>> ChangeTemplate(int id, ChangeTemplateRequest request, CancellationToken ct)
    {
        var (evaluation, schema, error) = await LoadForEditAsync(id, ct, includeAnswers: true);
        if (error is not null)
        {
            return error;
        }

        if (EvaluationWorkflow.IsFinal(schema!, evaluation!.Status))
        {
            return Problem(statusCode: StatusCodes.Status409Conflict, detail: "Ocena jest zamknięta.");
        }

        var template = await db.EvaluationTemplates.SingleOrDefaultAsync(t => t.Code == request.TemplateCode && t.IsActive, ct);
        if (template is null)
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, detail: "Nie ma takiego szablonu.");
        }

        var started = evaluation.Answers.Count > 0
            || evaluation.Stages.Any(s => s.Status != StageStatus.Pending)
            || await db.EvaluationSignatures.AnyAsync(s => s.EvaluationId == id, ct)
            || await db.EvaluationSelfAssessments.AnyAsync(s => s.EvaluationId == id, ct)
            || await db.EvaluationNotes.AnyAsync(n => n.EvaluationId == id, ct)
            || await db.EvaluationIndicatorContexts.AnyAsync(c => c.EvaluationId == id, ct)
            || await db.EvaluationCriterionContexts.AnyAsync(c => c.EvaluationId == id, ct);
        if (started)
        {
            return Problem(statusCode: StatusCodes.Status409Conflict,
                detail: "Ścieżkę można zmienić tylko przed rozpoczęciem oceny — są już wpisy, podpisy albo notatki.");
        }

        if (template.Id != evaluation.TemplateId || request.StartDate is not null)
        {
            var start = request.StartDate ?? evaluation.StartDate;
            var newSchema = TemplateSchema.Parse(template.Schema);

            // Dwa zapisy w transakcji: unikalny (ocena, etap) nie może zderzyć starych etapów z nowymi.
            await using var transaction = await db.Database.BeginTransactionAsync(ct);
            db.EvaluationStages.RemoveRange(evaluation.Stages);
            await db.SaveChangesAsync(ct);

            evaluation.TemplateId = template.Id;
            evaluation.Template = template;
            evaluation.Status = newSchema.InitialStatus;
            evaluation.StartDate = start;
            evaluation.Stages = EvaluationWorkflow.CreateStages(newSchema, start);
            await db.SaveChangesAsync(ct);
            await transaction.CommitAsync(ct);
        }

        var scope = await access.ResolveAsync(Permissions.ReadEvaluations, ct);
        return (await LoadDetailAsync(id, scope, ct))!;
    }

    /// <summary>Arkusz oceny jako PDF (do pobrania i do akt) — według szablonu oceny i bieżących wartości.</summary>
    [HttpGet("{id:int}/pdf")]
    [Authorize(Policy = Permissions.ReadEvaluations)]
    public async Task<IActionResult> GetPdf(int id, CancellationToken ct)
    {
        var scope = await access.ResolveAsync(Permissions.ReadEvaluations, ct);
        var evaluation = await InScope(scope)
            .AsNoTracking()
            .Include(e => e.Template)
            .Include(e => e.Employee)
            .Include(e => e.Answers)
            .SingleOrDefaultAsync(e => e.Id == id, ct);
        if (evaluation is null)
        {
            return NotFound();
        }

        var signatures = await db.EvaluationSignatures
            .Where(s => s.EvaluationId == id)
            .Select(s => new SheetSignature(s.FieldKey, s.SignerName, s.SignedOn, s.Place, s.ImageContent))
            .ToListAsync(ct);

        var schema = TemplateSchema.Parse(evaluation.Template.Schema);
        var stages = await db.EvaluationStages.Where(s => s.EvaluationId == id).Select(s => new { s.StageKey, s.Status }).ToListAsync(ct);
        var draft = evaluation.EmployeeId == await MyEmployeeIdAsync(ct)
            ? EvaluationWorkflow.DraftSections(schema, stages.Select(s => (s.StageKey, s.Status)))
            : new HashSet<string>();

        var stored = evaluation.Answers.Select(ToDto).ToList();
        var answers = EvaluationPrefill.Merge(stored, await EvaluationPrefill.LoadAsync(db, id, schema, stored, ct));
        var pdf = EvaluationSheetPdf.Render(schema, evaluation.Template.Code,
            EvaluationWorkflow.WithoutDraft(schema, draft, answers, a => a.FieldKey),
            EvaluationWorkflow.WithoutDraft(schema, draft, signatures, s => s.FieldKey).ToList());

        return File(pdf, "application/pdf", $"ocena-{evaluation.Employee.LastName}-{evaluation.Employee.FirstName}-{id}.pdf");
    }

    [HttpGet("{id:int}/signatures/{signatureId:int}/image")]
    [Authorize(Policy = Permissions.ReadEvaluations)]
    public async Task<IActionResult> GetSignatureImage(int id, int signatureId, CancellationToken ct)
    {
        var scope = await access.ResolveAsync(Permissions.ReadEvaluations, ct);
        var image = await InScope(scope)
            .Where(e => e.Id == id)
            .SelectMany(e => e.Signatures)
            .Where(s => s.Id == signatureId && s.ImageContent != null)
            .Select(s => new { s.ImageContent, s.ImageContentType })
            .SingleOrDefaultAsync(ct);

        return image is null ? NotFound() : File(image.ImageContent!, image.ImageContentType!);
    }

    private IQueryable<Evaluation> InScope(AccessScope scope)
    {
        if (scope.All)
        {
            return db.Evaluations;
        }

        var employeeIds = db.Employees.InScope(scope).Select(e => e.Id);
        return db.Evaluations.Where(e => employeeIds.Contains(e.EmployeeId));
    }

    private Task<int?> MyEmployeeIdAsync(CancellationToken ct) =>
        db.Users.Where(u => u.Id == UserId).Select(u => u.EmployeeId).SingleAsync(ct);

    private async Task<(Evaluation? Evaluation, TemplateSchema? Schema, ActionResult? Error)> LoadForEditAsync(
        int id, CancellationToken ct, bool includeAnswers = false)
    {
        var scope = await access.ResolveAsync(Permissions.EditEvaluation, ct);
        var query = InScope(scope).Include(e => e.Template).Include(e => e.Stages);
        var evaluation = includeAnswers
            ? await query.Include(e => e.Answers).SingleOrDefaultAsync(e => e.Id == id, ct)
            : await query.SingleOrDefaultAsync(e => e.Id == id, ct);

        if (evaluation is null)
        {
            return (null, null, NotFound());
        }

        if (evaluation.EmployeeId == await MyEmployeeIdAsync(ct))
        {
            return (null, null, Problem(statusCode: StatusCodes.Status403Forbidden, detail: "Nie możesz wypełniać własnej oceny."));
        }

        return (evaluation, TemplateSchema.Parse(evaluation.Template.Schema), null);
    }

    // action zwraca komunikat błędu albo null.
    private async Task<IActionResult> ChangeStageAsync(
        int id, string stageKey, CancellationToken ct, Func<TemplateSchema, Evaluation, EvaluationStage, string?> action)
    {
        var (evaluation, schema, error) = await LoadForEditAsync(id, ct);
        if (error is not null)
        {
            return error;
        }

        var stage = evaluation!.Stages.SingleOrDefault(s => s.StageKey == stageKey);
        if (stage is null)
        {
            return NotFound();
        }

        if (stage.Status != StageStatus.Pending)
        {
            return Problem(statusCode: StatusCodes.Status409Conflict, detail: "Etap jest już zamknięty.");
        }

        // Etap opcjonalny (sprzeciw) może przyjść już po zakończeniu oceny.
        var optional = schema!.Stages.Single(s => s.Key == stageKey).Optional;
        if (EvaluationWorkflow.IsFinal(schema, evaluation.Status) && !optional)
        {
            return Problem(statusCode: StatusCodes.Status409Conflict, detail: "Ocena jest zamknięta.");
        }

        if (action(schema, evaluation, stage) is { } problem)
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, detail: problem);
        }

        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    private async Task<EvaluationDetailDto?> LoadDetailAsync(int id, AccessScope scope, CancellationToken ct)
    {
        var evaluation = await InScope(scope)
            .AsNoTracking()
            .Include(e => e.Template)
            .Include(e => e.Employee)
            .Include(e => e.Evaluator)
            .Include(e => e.Stages)
            .Include(e => e.Answers)
            .SingleOrDefaultAsync(e => e.Id == id, ct);

        if (evaluation is null)
        {
            return null;
        }

        var signatures = await db.EvaluationSignatures
            .Where(s => s.EvaluationId == id)
            .OrderBy(s => s.Id)
            .Select(s => new SignatureDto(s.Id, s.FieldKey, s.Role.ToString(), s.SignerName, s.SignedOn, s.Place, s.ImageContent != null))
            .ToListAsync(ct);

        var schema = TemplateSchema.Parse(evaluation.Template.Schema);
        var isFinal = EvaluationWorkflow.IsFinal(schema, evaluation.Status);
        var isOwn = evaluation.EmployeeId == await MyEmployeeIdAsync(ct);
        var canEdit = !isOwn && User.HasPermission(Permissions.EditEvaluation)
            && await db.Employees.InScope(await access.ResolveAsync(Permissions.EditEvaluation, ct))
                .AnyAsync(e => e.Id == evaluation.EmployeeId, ct);
        var today = DateOnly.FromDateTime(DateTime.Today);

        // Kolejność etapów jak w szablonie.
        var stages = schema.Stages
            .Select(definition => (definition, stage: evaluation.Stages.SingleOrDefault(s => s.StageKey == definition.Key)))
            .Where(x => x.stage is not null)
            .Select(x => new StageDto(
                x.definition.Key, x.definition.Title, x.stage!.Status.ToString(), x.definition.Optional,
                x.stage.DueFrom, x.stage.DueTo, x.stage.CompletedOn,
                x.stage.Status == StageStatus.Pending && x.stage.DueTo < today && !isFinal))
            .ToList();

        // Oceniany nie widzi roboczej oceny (punkty, wynik, uzasadnienie), dopóki nie jest sporządzona.
        var draft = isOwn ? EvaluationWorkflow.DraftSections(schema, evaluation.Stages.Select(s => (s.StageKey, s.Status))) : new HashSet<string>();
        var visibleAnswers = EvaluationWorkflow.WithoutDraft(schema, draft, evaluation.Answers.Select(ToDto), a => a.FieldKey).ToList();
        var answers = new AnswerSet(visibleAnswers);
        var current = isFinal ? null : EvaluationWorkflow.CurrentStage(schema, evaluation.Stages.Select(s => (s.StageKey, s.Status)));
        var lockedSections = schema.Sections
            .Where(s => isFinal || evaluation.Stages.SingleOrDefault(st => st.StageKey == s.Stage)?.Status is not (null or StageStatus.Pending))
            .Select(s => s.Key)
            .ToList();
        var selfStage = schema.Stages.FirstOrDefault(s => s.SelfAssessment);
        var canEditSelfAssessment = isOwn && !isFinal && selfStage is not null
            && evaluation.Stages.SingleOrDefault(s => s.StageKey == selfStage.Key)?.Status == StageStatus.Pending
            && !await db.EvaluationSelfAssessments.AnyAsync(s => s.EvaluationId == id && s.SubmittedAt != null, ct);
        var unitHead = await db.Employees
            .Where(e => e.Id == evaluation.EmployeeId && e.Department.Head != null)
            .Select(e => e.Department.Head!.FirstName + " " + e.Department.Head.LastName)
            .SingleOrDefaultAsync(ct);
        var prefill = EvaluationWorkflow.WithoutDraft(schema, draft,
            await EvaluationPrefill.LoadAsync(db, id, schema, evaluation.Answers.Select(ToDto), ct), a => a.FieldKey).ToList();

        return new EvaluationDetailDto(
            evaluation.Id,
            evaluation.EmployeeId,
            $"{evaluation.Employee.FirstName} {evaluation.Employee.LastName}",
            evaluation.Evaluator is null ? null : $"{evaluation.Evaluator.FirstName} {evaluation.Evaluator.LastName}",
            evaluation.Template.Title,
            evaluation.Status,
            EvaluationWorkflow.StatusLabel(schema, evaluation.Status),
            isFinal,
            evaluation.StartDate,
            JsonDocument.Parse(evaluation.Template.Schema).RootElement.Clone(),
            stages,
            visibleAnswers,
            signatures,
            canEdit && !isFinal,
            isOwn,
            evaluation.Template.Code,
            EvaluationWorkflow.Phase(schema, evaluation.Status, current, evaluation.Answers.Count > 0 || signatures.Count > 0),
            current?.Key,
            lockedSections,
            draft.Count > 0 ? null : EvaluationScoring.Compute(schema, answers),
            await LoadPreviousAsync(evaluation, ct),
            unitHead,
            canEditSelfAssessment,
            prefill);
    }

    private static bool TryDecodeImage(string value, out byte[] bytes, out string contentType, out string problem)
    {
        bytes = [];
        contentType = "";
        problem = "";

        var base64 = value.Contains(',') ? value[(value.IndexOf(',') + 1)..] : value;
        try
        {
            bytes = Convert.FromBase64String(base64);
        }
        catch (FormatException)
        {
            problem = "Obraz podpisu nie jest poprawnym base64.";
            return false;
        }

        if (bytes.Length == 0 || bytes.Length > MaxSignatureImageBytes)
        {
            problem = $"Obraz podpisu może mieć najwyżej {MaxSignatureImageBytes / 1024} KB.";
            return false;
        }

        // Typ z sygnatury pliku, nie z deklaracji klienta.
        if (bytes is [0x89, 0x50, 0x4E, 0x47, ..])
        {
            contentType = "image/png";
        }
        else if (bytes.Length > 12 && bytes[..4].SequenceEqual("RIFF"u8.ToArray()) && bytes[8..12].SequenceEqual("WEBP"u8.ToArray()))
        {
            contentType = "image/webp";
        }
        else
        {
            problem = "Obraz podpisu musi być w formacie PNG albo WebP.";
            return false;
        }

        return true;
    }
}
