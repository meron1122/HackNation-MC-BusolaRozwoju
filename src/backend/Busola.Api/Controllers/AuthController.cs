using Busola.Api.Audit;
using Busola.Api.Authorization;
using Busola.Api.Models;
using Busola.Database.Entities;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;

namespace Busola.Api.Controllers;

[ApiController]
[Route("api/auth")]
[AllowAnonymous]
public sealed class AuthController(UserManager<User> userManager, TokenService tokens) : ControllerBase
{
    /// <summary>
    /// Bez 2FA: e-mail + hasło → token. Z 2FA: pierwsza odpowiedź ma RequiresTwoFactor, potem klient
    /// wysyła e-mail + hasło + kod z aplikacji (albo kod odzyskiwania). Nieudane hasło i nieudany kod liczą
    /// się do wspólnej blokady konta (5 prób → 5 minut).
    /// </summary>
    [HttpPost("login")]
    public async Task<ActionResult<LoginResponse>> Login(LoginRequest request, CancellationToken ct)
    {
        var user = await userManager.FindByEmailAsync(request.Email);
        AuditContext.SetActor(HttpContext, user?.Id, request.Email);
        if (user is null)
        {
            return Unauthorized();
        }

        if (await userManager.IsLockedOutAsync(user))
        {
            return Problem(
                statusCode: StatusCodes.Status401Unauthorized,
                detail: "Konto jest czasowo zablokowane po zbyt wielu nieudanych próbach. Spróbuj za kilka minut.");
        }

        if (!await userManager.CheckPasswordWithLockoutAsync(user, request.Password))
        {
            return Unauthorized();
        }

        if (user.TwoFactorEnabled)
        {
            if (string.IsNullOrWhiteSpace(request.TwoFactorCode) && string.IsNullOrWhiteSpace(request.RecoveryCode))
            {
                AuditMiddleware.SetAction(HttpContext, "login_2fa_required");
                return new LoginResponse(Token: null, RequiresTwoFactor: true);
            }

            var valid = !string.IsNullOrWhiteSpace(request.TwoFactorCode)
                ? await userManager.VerifyAuthenticatorCodeAsync(user, request.TwoFactorCode)
                : (await userManager.RedeemTwoFactorRecoveryCodeAsync(user, request.RecoveryCode!.Trim().ToUpperInvariant())).Succeeded;

            if (!valid)
            {
                await userManager.AccessFailedAsync(user);
                return Problem(statusCode: StatusCodes.Status401Unauthorized, detail: "Nieprawidłowy kod.");
            }
        }

        await userManager.ResetAccessFailedCountAsync(user);
        return new LoginResponse(await tokens.CreateTokenAsync(user, ct));
    }

    /// <summary>Token JWT jest bezstanowy, więc nic tu nie unieważniamy — endpoint istnieje dla dziennika audytu.</summary>
    [HttpPost("logout")]
    public NoContentResult Logout() => NoContent();
}
