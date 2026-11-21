using System.Security.Claims;
using System.Security.Cryptography;
using System.Text.Json;
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
        var rows = await InScope(scope)
            .Where(e => employeeId == null || e.EmployeeId == employeeId)
            .OrderByDescending(e => e.Id)
            .Select(e => new
            {
                e.Id,
                e.EmployeeId,
                EmployeeName = e.Employee.LastName + " " + e.Employee.FirstName,
                e.TemplateId,
                e.Template.Title,
                e.Status,
                e.StartDate,
                Next = e.Stages
                    .Where(s => s.Status == StageStatus.Pending && s.DueTo != null)
                    .OrderBy(s => s.DueTo)
                    .Select(s => new { s.StageKey, s.DueTo })
                    .FirstOrDefault(),
            })
            .ToListAsync(ct);

        var schemas = await EvaluationWorkflow.LoadSchemasAsync(db, rows.Select(r => r.TemplateId), ct);
        return rows.Select(r =>
        {
            var schema = schemas[r.TemplateId];
            var isFinal = EvaluationWorkflow.IsFinal(schema, r.Status);
            return new EvaluationListItemDto(
                r.Id, r.EmployeeId, r.EmployeeName, r.Title, r.Status, EvaluationWorkflow.StatusLabel(schema, r.Status), isFinal,
                r.StartDate,
                isFinal || r.Next is null ? null : EvaluationWorkflow.StageTitle(schema, r.Next.StageKey),
                isFinal ? null : r.Next?.DueTo);
        }).ToList();
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
        var result = await ChangeStageAsync(id, stageKey, ct, (schema, evaluation, stage) =>
        {
            EvaluationWorkflow.Complete(schema, evaluation, stage, request.CompletedOn);
            return null;
        });

        if (result is NoContentResult && stageKey == "evaluation")
        {
            await StartNextPeriodicCycleAsync(id, request.CompletedOn, ct);
        }

        return result;
    }

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

    /// <summary>Tylko etapy opcjonalne (np. brak sprzeciwu).</summary>
    [HttpPost("{id:int}/stages/{stageKey}/skip")]
    [Authorize(Policy = Permissions.EditEvaluation)]
    public Task<IActionResult> SkipStage(int id, string stageKey, CancellationToken ct) =>
        ChangeStageAsync(id, stageKey, ct, (schema, _, stage) =>
        {
            if (!schema.Stages.Single(s => s.Key == stageKey).Optional)
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
        var evaluation = await db.Evaluations.Include(e => e.Template).SingleOrDefaultAsync(e => e.Id == id, ct);
        if (evaluation is null)
        {
            return NotFound();
        }

        var schema = TemplateSchema.Parse(evaluation.Template.Schema);
        var field = schema.Sections.SelectMany(s => s.Fields).SingleOrDefault(f => f.Key == request.FieldKey && f.Type == "signature");
        if (field?.Extra?.GetValueOrDefault("role").GetString() is not { } roleName
            || !Enum.TryParse<SignatureRole>(roleName, ignoreCase: true, out var role))
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, detail: "Szablon nie ma takiego pola podpisu.");
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
            evaluation.Answers
                .Select(a => new AnswerDto(a.FieldKey, a.ItemKey, a.ValueText, a.ValueNumber, a.ValueDate, a.ValueDateTo))
                .ToList(),
            signatures,
            canEdit && !isFinal,
            isOwn);
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
