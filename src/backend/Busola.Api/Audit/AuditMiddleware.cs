using System.Text.Json;
using Busola.Database;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc.Controllers;

namespace Busola.Api.Audit;

/// <summary>
/// Dziennik dostępu: każde żądanie do /api poza odczytami (GET/HEAD) — kto, skąd, co, z jakim wynikiem; bez treści i query stringa.
/// Stoi przed UseExceptionHandler, żeby widzieć ostateczny status (np. 409 z DbExceptionHandler).
/// </summary>
public sealed class AuditMiddleware(RequestDelegate next, ILogger<AuditMiddleware> logger)
{
    private const string ActionKey = "audit.action";

    // Reszta to „write”. Klucz: kontroler.akcja.
    private static readonly Dictionary<string, string> NamedActions = new()
    {
        ["Auth.Logout"] = "logout",
        ["Account.ChangePassword"] = "password_change",
        ["Account.EnableTwoFactor"] = "two_factor_enable",
        ["Account.DisableTwoFactor"] = "two_factor_disable",
        ["Users.Create"] = "user_create",
        ["Users.UpdateRoles"] = "role_change",
        ["Users.ResetTwoFactor"] = "two_factor_reset",
        ["Sign.Sign"] = "sign",
        ["Sign.Decline"] = "sign_decline",
        ["Agent.Chat"] = "agent_query",
    };

    /// <summary>Gdy sam kontroler wie lepiej, co się stało (np. hasło dobre, czeka na kod 2FA).</summary>
    public static void SetAction(HttpContext context, string action) => context.Items[ActionKey] = action;

    public async Task InvokeAsync(HttpContext context, AuditContext audit, IServiceScopeFactory scopes)
    {
        var method = context.Request.Method;
        if (!context.Request.Path.StartsWithSegments("/api")
            || HttpMethods.IsGet(method) || HttpMethods.IsHead(method) || HttpMethods.IsOptions(method))
        {
            await next(context);
            return;
        }

        var crashed = false;
        try
        {
            await next(context);
        }
        catch
        {
            crashed = true;
            throw;
        }
        finally
        {
            await WriteAsync(context, audit, scopes, crashed ? StatusCodes.Status500InternalServerError : context.Response.StatusCode);
        }
    }

    private async Task WriteAsync(HttpContext context, AuditContext audit, IServiceScopeFactory scopes, int status)
    {
        try
        {
            // Po wyjątku UseExceptionHandler czyści endpoint — oryginał zostaje w IExceptionHandlerFeature.
            var endpoint = context.GetEndpoint() ?? context.Features.Get<IExceptionHandlerFeature>()?.Endpoint;
            var action = endpoint?.Metadata.GetMetadata<ControllerActionDescriptor>();
            var routeValues = AuditContext.RouteValues(context);

            var entry = audit.Entry(
                ActionOf(context, action, status),
                action is null ? null : JsonNamingPolicy.SnakeCaseLower.ConvertName(action.ControllerName),
                (routeValues["id"] ?? routeValues["employeeId"])?.ToString());
            entry.StatusCode = status;

            await using var scope = scopes.CreateAsyncScope();
            var db = scope.ServiceProvider.GetRequiredService<BusolaDbContext>();
            db.AuditEntries.Add(entry);
            await db.SaveChangesAsync(CancellationToken.None);
        }
        catch (Exception e)
        {
            // shortcut: brak wpisu nie blokuje odpowiedzi (fail-open); przy wymogu fail-closed zwracaj tu 503.
            logger.LogError(e, "Nie zapisano wpisu audytu dla {Method} {Path}", context.Request.Method, context.Request.Path);
        }
    }

    private static string ActionOf(HttpContext context, ControllerActionDescriptor? action, int status)
    {
        if (context.Items[ActionKey] is string set)
        {
            return set;
        }

        var key = $"{action?.ControllerName}.{action?.ActionName}";
        if (key == "Auth.Login")
        {
            return status is >= 200 and < 300 ? "login_success" : "login_failed";
        }

        return NamedActions.TryGetValue(key, out var named) ? named : "write";
    }
}
