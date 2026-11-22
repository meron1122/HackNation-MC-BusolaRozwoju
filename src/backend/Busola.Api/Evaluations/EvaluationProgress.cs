using Busola.Api.Models;
using Busola.Database;
using Busola.Database.Entities;
using Microsoft.EntityFrameworkCore;

namespace Busola.Api.Evaluations;

/// <summary>Faza, etap w toku i termin wielu ocen naraz — dla list i pulpitów (jedno zapytanie + szablony z pamięci).</summary>
public static class EvaluationProgress
{
    public sealed record Row(
        int EvaluationId,
        int EmployeeId,
        string EmployeeName,
        int TemplateId,
        string TemplateTitle,
        DateOnly StartDate,
        string Status,
        EvaluationProgressDto Progress);

    public static async Task<List<Row>> LoadAsync(BusolaDbContext db, IQueryable<Evaluation> query, DateOnly today, CancellationToken ct)
    {
        var rows = await query
            .Select(e => new
            {
                e.Id,
                e.EmployeeId,
                EmployeeName = e.Employee.LastName + " " + e.Employee.FirstName,
                e.TemplateId,
                e.Template.Code,
                e.Template.Kind,
                e.Template.Title,
                e.Status,
                e.StartDate,
                HasProgress = e.Answers.Any() || e.Signatures.Any(),
                Stages = e.Stages.Select(s => new { s.StageKey, s.Status, s.DueFrom, s.DueTo }).ToList(),
                LastReminder = e.Reminders
                    .OrderByDescending(r => r.SentAt)
                    .Select(r => new LastReminderDto(
                        r.SentAt,
                        r.SentBy.Employee != null ? r.SentBy.Employee.FirstName + " " + r.SentBy.Employee.LastName : r.SentBy.Email!,
                        r.Message))
                    .FirstOrDefault(),
            })
            .ToListAsync(ct);

        var schemas = await EvaluationWorkflow.LoadSchemasAsync(db, rows.Select(r => r.TemplateId), ct);
        return rows.Select(r =>
        {
            var schema = schemas[r.TemplateId];
            var isFinal = EvaluationWorkflow.IsFinal(schema, r.Status);
            var current = isFinal ? null : EvaluationWorkflow.CurrentStage(schema, r.Stages.Select(s => (s.StageKey, s.Status)));
            var stage = current is null ? null : r.Stages.Single(s => s.StageKey == current.Key);
            int? daysLeft = stage?.DueTo is { } due ? due.DayNumber - today.DayNumber : null;

            var progress = new EvaluationProgressDto(
                r.Id, r.Code, r.Kind.ToString(),
                EvaluationWorkflow.Phase(schema, r.Status, current, r.HasProgress),
                r.HasProgress, isFinal,
                current?.Key, current?.Title, stage?.DueFrom, stage?.DueTo, daysLeft, daysLeft < 0,
                r.LastReminder);

            return new Row(r.Id, r.EmployeeId, r.EmployeeName, r.TemplateId, r.Title, r.StartDate, r.Status, progress);
        }).ToList();
    }

    /// <summary>Wymaga uwagi: po terminie, termin w ciągu `days` dni albo etap bez terminu do zrobienia niezwłocznie (zapoznanie).</summary>
    public static bool NeedsAttention(EvaluationProgressDto progress, int days) =>
        !progress.IsFinal && progress.StageKey is not null
        && (progress.DaysLeft is null || progress.DaysLeft <= days);
}
