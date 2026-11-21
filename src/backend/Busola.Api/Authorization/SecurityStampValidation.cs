using System.Security.Claims;
using Busola.Database;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;

namespace Busola.Api.Authorization;

/// <summary>
/// Token jest ważny tylko, dopóki SecurityStamp konta się nie zmienił. Identity zmienia go przy zmianie hasła
/// i włączeniu/wyłączeniu 2FA, a my dodatkowo przy zmianie ról — wtedy wszystkie stare tokeny przestają działać.
/// Koszt: jedno zapytanie po kluczu na żądanie.
/// </summary>
public static class SecurityStampValidation
{
    public static async Task ValidateAsync(TokenValidatedContext context)
    {
        var userId = context.Principal?.FindFirstValue(BusolaClaims.UserId);
        var stamp = context.Principal?.FindFirstValue(BusolaClaims.SecurityStamp);
        var db = context.HttpContext.RequestServices.GetRequiredService<BusolaDbContext>();

        var currentStamp = await db.Users
            .Where(u => u.Id == userId)
            .Select(u => u.SecurityStamp)
            .SingleOrDefaultAsync(context.HttpContext.RequestAborted);

        if (currentStamp is null || currentStamp != stamp)
        {
            context.Fail("Sesja wygasła, zaloguj się ponownie.");
        }
    }
}
