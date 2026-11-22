using System.Text;
using Busola.Api.Authorization;
using Busola.Database;
using Busola.Database.Authorization;
using Busola.Database.Entities;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Busola.Api.Controllers;

/// <summary>
/// Przeglądanie dziennika audytu. Tylko odczyt: dziennika nie da się edytować ani czyścić (AuditInterceptor, trigger w bazie).
/// Wpisy obejmują wszystkie służby, więc poza uprawnieniem wymagany jest zakres All.
/// </summary>
[ApiController]
[Route("api/audit")]
[Authorize(Policy = Permissions.ReadAuditLog)]
public sealed class AuditController(BusolaDbContext db, AccessScopeService access) : ControllerBase
{
    private const int MaxCsvRows = 50_000;

    /// <param name="From">Od (włącznie), z przesunięciem strefy, np. północ czasu polskiego.</param>
    /// <param name="To">Do (wyłącznie).</param>
    /// <param name="User">Fragment e-maila albo dokładne id użytkownika.</param>
    public sealed record AuditQuery(
        DateTimeOffset? From = null,
        DateTimeOffset? To = null,
        string? User = null,
        string? EntityType = null,
        string? EntityId = null,
        string? Action = null,
        string? Ip = null,
        int Page = 1,
        int PageSize = 50);

    public sealed record AuditPage(IReadOnlyList<AuditEntry> Items, int Total);

    [HttpGet]
    public async Task<ActionResult<AuditPage>> Get([FromQuery] AuditQuery query, CancellationToken ct)
    {
        if (!(await access.ResolveAsync(Permissions.ReadAuditLog, ct)).All)
        {
            return Forbid();
        }

        var pageSize = Math.Clamp(query.PageSize, 1, 200);
        var filtered = Filter(query);
        var items = await filtered
            .OrderByDescending(a => a.Id)
            .Skip((Math.Max(query.Page, 1) - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(ct);

        return new AuditPage(items, await filtered.CountAsync(ct));
    }

    /// <summary>Te same filtry co lista, bez stronicowania (najnowsze <see cref="MaxCsvRows"/>), do analizy w arkuszu.</summary>
    [HttpGet("csv")]
    public async Task<IActionResult> Csv([FromQuery] AuditQuery query, CancellationToken ct)
    {
        if (!(await access.ResolveAsync(Permissions.ReadAuditLog, ct)).All)
        {
            return Forbid();
        }

        var rows = await Filter(query).OrderByDescending(a => a.Id).Take(MaxCsvRows).ToListAsync(ct);

        var csv = new StringBuilder("id,at_utc,user_id,user_email,action,entity_type,entity_id,status,method,path,ip,user_agent,changes\r\n");
        foreach (var a in rows)
        {
            csv.AppendJoin(',', new[]
            {
                a.Id.ToString(), a.At.UtcDateTime.ToString("yyyy-MM-dd HH:mm:ss"), a.UserId, a.UserEmail, a.Action, a.EntityType,
                a.EntityId, a.StatusCode?.ToString(), a.Method, a.Path, a.Ip, a.UserAgent, a.Changes,
            }.Select(Cell)).Append("\r\n");
        }

        // BOM: Excel bez niego czyta UTF-8 jako ANSI i psuje polskie znaki.
        return File(Encoding.UTF8.GetPreamble().Concat(Encoding.UTF8.GetBytes(csv.ToString())).ToArray(),
            "text/csv; charset=utf-8", $"dziennik-audytu-{DateTime.UtcNow:yyyyMMdd-HHmm}.csv");
    }

    private IQueryable<AuditEntry> Filter(AuditQuery q)
    {
        var entries = db.AuditEntries.AsNoTracking();
        if (q.From is { } from)
        {
            entries = entries.Where(a => a.At >= from.ToUniversalTime());
        }

        if (q.To is { } to)
        {
            entries = entries.Where(a => a.At < to.ToUniversalTime());
        }

        if (!string.IsNullOrWhiteSpace(q.User))
        {
            var user = q.User.Trim();
            entries = entries.Where(a => a.UserId == user || EF.Functions.ILike(a.UserEmail!, $"%{Escape(user)}%"));
        }

        if (!string.IsNullOrWhiteSpace(q.EntityType))
        {
            entries = entries.Where(a => a.EntityType == q.EntityType.Trim());
        }

        if (!string.IsNullOrWhiteSpace(q.EntityId))
        {
            entries = entries.Where(a => a.EntityId == q.EntityId.Trim());
        }

        if (!string.IsNullOrWhiteSpace(q.Action))
        {
            entries = entries.Where(a => a.Action == q.Action.Trim());
        }

        if (!string.IsNullOrWhiteSpace(q.Ip))
        {
            entries = entries.Where(a => a.Ip!.StartsWith(q.Ip.Trim()));
        }

        return entries;
    }

    private static string Escape(string like) => like.Replace(@"\", @"\\").Replace("%", @"\%").Replace("_", @"\_");

    /// <summary>Cudzysłowy wg RFC 4180; wiodące =+-@ neutralizowane, żeby arkusz nie wykonał formuły (CSV injection).</summary>
    private static string Cell(string? value)
    {
        if (string.IsNullOrEmpty(value))
        {
            return "";
        }

        if (value[0] is '=' or '+' or '-' or '@' or '\t' or '\r')
        {
            value = "'" + value;
        }

        return $"\"{value.Replace("\"", "\"\"")}\"";
    }
}
