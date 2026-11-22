using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Busola.Api.Authorization;
using Busola.Database.Entities;
using Microsoft.AspNetCore.Diagnostics;

namespace Busola.Api.Audit;

/// <summary>Kto, kiedy i skąd — wspólne dla wpisów o zmianach (interceptor) i o dostępie (middleware).</summary>
public sealed class AuditContext(IHttpContextAccessor http, TimeProvider time)
{
    // Niezalogowany przy logowaniu: AuthController zapisuje tu podany e-mail (i id, gdy konto istnieje).
    private const string UserIdKey = "audit.userId";
    private const string EmailKey = "audit.email";

    public static void SetActor(HttpContext context, string? userId, string email)
    {
        context.Items[UserIdKey] = userId;
        context.Items[EmailKey] = email;
    }

    public AuditEntry Entry(string action, string? entityType, string? entityId, string? changes = null)
    {
        var context = http.HttpContext;
        var user = context?.User;
        return new AuditEntry
        {
            At = time.GetUtcNow(),
            UserId = user?.FindFirstValue(BusolaClaims.UserId) ?? context?.Items[UserIdKey] as string,
            UserEmail = Truncate(user?.FindFirstValue(BusolaClaims.Email) ?? context?.Items[EmailKey] as string, 256),
            Action = action,
            EntityType = entityType,
            EntityId = Truncate(entityId, 100),
            Changes = changes,
            Ip = context?.Connection.RemoteIpAddress?.ToString(),
            UserAgent = Truncate(context?.Request.Headers.UserAgent.ToString(), 512),
            Method = context?.Request.Method,
            Path = Truncate(PathOf(context), 512),
        };
    }

    /// <summary>Token linku podpisu to sekret: w ścieżce zostaje tylko początek jego SHA-256 (jak signature_requests.token_hash).</summary>
    private static string? PathOf(HttpContext? context)
    {
        var path = context?.Request.Path.Value;
        return context is not null && RouteValues(context)["token"] is string token && path is not null
            ? path.Replace(token, "sha256:" + Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(token)))[..12])
            : path;
    }

    /// <summary>Wartości z trasy; po wyjątku UseExceptionHandler je czyści, ale zostawia kopię w IExceptionHandlerFeature.</summary>
    public static RouteValueDictionary RouteValues(HttpContext context) =>
        context.Request.RouteValues.Count > 0
            ? context.Request.RouteValues
            : context.Features.Get<IExceptionHandlerFeature>()?.RouteValues ?? context.Request.RouteValues;

    private static string? Truncate(string? value, int max) =>
        string.IsNullOrEmpty(value) ? null : value.Length <= max ? value : value[..max];
}
