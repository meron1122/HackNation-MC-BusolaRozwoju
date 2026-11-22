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
/// Przypomnienia HR o etapie oceny (W14 „Przypomnij”, „Wyślij przypomnienia”). Adresat to oceniający; widzi je
/// na pulpicie (W01 „Przypomnienie od HR”). Bez maili — tylko w aplikacji.
/// </summary>
[ApiController]
[Route("api/evaluations")]
public sealed class RemindersController(BusolaDbContext db, AccessScopeService access) : ControllerBase
{
    private const int MaxMessageLength = 1000;

    private string UserId => User.FindFirstValue(BusolaClaims.UserId)!;

    [HttpGet("{id:int}/reminders")]
    [Authorize(Policy = Permissions.ReadEvaluations)]
    public async Task<ActionResult<IReadOnlyList<ReminderDto>>> GetAll(int id, CancellationToken ct)
    {
        var scope = await access.ResolveAsync(Permissions.ReadEvaluations, ct);
        var evaluation = await InScope(scope).Where(e => e.Id == id).Select(e => new { e.Template.Schema }).SingleOrDefaultAsync(ct);
        if (evaluation is null)
        {
            return NotFound();
        }

        var schema = TemplateSchema.Parse(evaluation.Schema);
        var reminders = await db.EvaluationReminders
            .Where(r => r.EvaluationId == id)
            .OrderByDescending(r => r.SentAt)
            .Select(r => new
            {
                r.Id,
                r.StageKey,
                RecipientName = r.Recipient != null ? r.Recipient.FirstName + " " + r.Recipient.LastName : null,
                r.Message,
                SentByName = r.SentBy.Employee != null ? r.SentBy.Employee.FirstName + " " + r.SentBy.Employee.LastName : r.SentBy.Email!,
                r.SentAt,
            })
            .ToListAsync(ct);

        return reminders
            .Select(r => new ReminderDto(r.Id, id, r.StageKey, EvaluationWorkflow.StageTitle(schema, r.StageKey), r.RecipientName, r.Message, r.SentByName, r.SentAt))
            .ToList();
    }

    [HttpPost("{id:int}/reminders")]
    [Authorize(Policy = Permissions.RemindEvaluations)]
    public async Task<ActionResult<ReminderDto>> Send(int id, SendReminderRequest request, CancellationToken ct)
    {
        if (request.Message?.Length > MaxMessageLength)
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, detail: $"Wiadomość może mieć najwyżej {MaxMessageLength} znaków.");
        }

        var (sent, skipped) = await SendAsync([id], request.Message, ct);
        if (sent.Count == 0)
        {
            return skipped.Count > 0 && skipped[0].NotFound
                ? NotFound()
                : Problem(statusCode: StatusCodes.Status409Conflict, detail: "Ocena jest zamknięta — nie ma etapu, o którym można przypomnieć.");
        }

        return (await GetAll(id, ct)).Value!.First(r => r.Id == sent[0]);
    }

    /// <summary>Hurtowo, np. do wszystkich zagrożonych z panelu HR. Pomija oceny spoza zakresu i zamknięte.</summary>
    [HttpPost("reminders")]
    [Authorize(Policy = Permissions.RemindEvaluations)]
    public async Task<ActionResult<SendRemindersResponse>> SendMany(SendRemindersRequest request, CancellationToken ct)
    {
        if (request.Message?.Length > MaxMessageLength)
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, detail: $"Wiadomość może mieć najwyżej {MaxMessageLength} znaków.");
        }

        if (request.EvaluationIds.Count is 0 or > 500)
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, detail: "Podaj od 1 do 500 ocen.");
        }

        var (sent, skipped) = await SendAsync(request.EvaluationIds.Distinct().ToList(), request.Message, ct);
        return new SendRemindersResponse(sent.Count, skipped.Select(s => s.EvaluationId).ToList());
    }

    private async Task<(List<int> Sent, List<(int EvaluationId, bool NotFound)> Skipped)> SendAsync(
        IReadOnlyList<int> ids, string? message, CancellationToken ct)
    {
        var scope = await access.ResolveAsync(Permissions.RemindEvaluations, ct);
        var evaluations = await InScope(scope)
            .Where(e => ids.Contains(e.Id))
            .Include(e => e.Template)
            .Include(e => e.Stages)
            .Include(e => e.Employee)
            .ToListAsync(ct);

        var now = DateTimeOffset.UtcNow;
        var reminders = new List<EvaluationReminder>();
        var skipped = ids.Where(id => evaluations.All(e => e.Id != id)).Select(id => (id, true)).ToList();
        foreach (var evaluation in evaluations)
        {
            var schema = TemplateSchema.Parse(evaluation.Template.Schema);
            var current = EvaluationWorkflow.IsFinal(schema, evaluation.Status)
                ? null
                : EvaluationWorkflow.CurrentStage(schema, evaluation.Stages.Select(s => (s.StageKey, s.Status)));
            if (current is null)
            {
                skipped.Add((evaluation.Id, false));
                continue;
            }

            reminders.Add(new EvaluationReminder
            {
                EvaluationId = evaluation.Id,
                StageKey = current.Key,
                RecipientId = evaluation.EvaluatorId ?? evaluation.Employee.SupervisorId,
                Message = string.IsNullOrWhiteSpace(message) ? null : message.Trim(),
                SentById = UserId,
                SentAt = now,
            });
        }

        db.EvaluationReminders.AddRange(reminders);
        await db.SaveChangesAsync(ct);
        return (reminders.Select(r => r.Id).ToList(), skipped);
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
}
