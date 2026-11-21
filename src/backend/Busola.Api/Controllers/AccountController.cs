using System.Security.Claims;
using Busola.Api.Authorization;
using Busola.Api.Infrastructure;
using Busola.Api.Models;
using Busola.Database;
using Busola.Database.Entities;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Busola.Api.Controllers;

/// <summary>Własne konto zalogowanego użytkownika: avatar, hasło, weryfikacja dwuetapowa (TOTP).</summary>
[ApiController]
[Route("api/account")]
public sealed class AccountController(BusolaDbContext db, UserManager<User> userManager, TokenService tokens)
    : ControllerBase
{
    private const int RecoveryCodeCount = 10;
    private const string AuthenticatorIssuer = "Busola Rozwoju";

    private string UserId => User.FindFirstValue(BusolaClaims.UserId)!;

    [HttpGet]
    public async Task<ActionResult<AccountDto>> Get(CancellationToken ct)
    {
        if (await userManager.FindByIdAsync(UserId) is not { } user)
        {
            return Unauthorized();
        }

        var details = await db.Users
            .Where(u => u.Id == user.Id)
            .Select(u => new
            {
                HasAvatar = u.Avatar != null,
                EmployeeName = u.Employee != null ? u.Employee.FirstName + " " + u.Employee.LastName : null,
            })
            .SingleAsync(ct);

        var recoveryCodesLeft = user.TwoFactorEnabled ? await userManager.CountRecoveryCodesAsync(user) : 0;

        return new AccountDto(user.Id, user.Email!, user.EmployeeId, details.EmployeeName, details.HasAvatar,
            user.TwoFactorEnabled, recoveryCodesLeft);
    }

    [HttpPost("password")]
    public async Task<ActionResult<TokenResponse>> ChangePassword(ChangePasswordRequest request, CancellationToken ct)
    {
        if (await userManager.FindByIdAsync(UserId) is not { } user)
        {
            return Unauthorized();
        }

        if (!await userManager.CheckPasswordWithLockoutAsync(user, request.CurrentPassword))
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, detail: "Obecne hasło jest nieprawidłowe.");
        }

        var result = await userManager.ChangePasswordAsync(user, request.CurrentPassword, request.NewPassword);
        if (!result.Succeeded)
        {
            return IdentityErrors(result);
        }

        return new TokenResponse(await tokens.CreateTokenAsync(user, ct));
    }

    [HttpGet("avatar")]
    public async Task<IActionResult> GetAvatar(CancellationToken ct)
    {
        var avatar = await db.UserAvatars.AsNoTracking().SingleOrDefaultAsync(a => a.UserId == UserId, ct);
        return avatar is null ? NotFound() : avatar.ToFileResult(this);
    }

    [HttpPut("avatar")]
    [RequestSizeLimit(AvatarImage.MaxUploadBytes)]
    public async Task<IActionResult> UploadAvatar(IFormFile file, CancellationToken ct)
    {
        if (file.Length == 0)
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, detail: "Nie wybrano pliku.");
        }

        if (file.Length > AvatarImage.MaxBytes)
        {
            return Problem(
                statusCode: StatusCodes.Status400BadRequest,
                detail: $"Plik jest za duży (najwyżej {AvatarImage.MaxBytes / 1024 / 1024} MB).");
        }

        using var buffer = new MemoryStream();
        await file.CopyToAsync(buffer, ct);

        byte[] content;
        string contentType;
        try
        {
            (content, contentType) = AvatarImage.Normalize(buffer.ToArray());
        }
        catch (InvalidDataException ex)
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, detail: ex.Message);
        }

        var avatar = await db.UserAvatars.SingleOrDefaultAsync(a => a.UserId == UserId, ct);
        if (avatar is null)
        {
            avatar = new UserAvatar { UserId = UserId, Content = content, ContentType = contentType };
            db.UserAvatars.Add(avatar);
        }

        avatar.Content = content;
        avatar.ContentType = contentType;
        avatar.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);

        return NoContent();
    }

    [HttpDelete("avatar")]
    public async Task<IActionResult> DeleteAvatar(CancellationToken ct)
    {
        await db.UserAvatars.Where(a => a.UserId == UserId).ExecuteDeleteAsync(ct);
        return NoContent();
    }

    [HttpPost("two-factor/setup")]
    public async Task<ActionResult<TwoFactorSetupResponse>> SetupTwoFactor(CancellationToken ct)
    {
        if (await userManager.FindByIdAsync(UserId) is not { } user)
        {
            return Unauthorized();
        }

        if (user.TwoFactorEnabled)
        {
            return Problem(statusCode: StatusCodes.Status409Conflict, detail: "Weryfikacja dwuetapowa jest już włączona.");
        }

        // Nowy klucz przy każdej próbie — klucz z porzuconej konfiguracji mógł wyciec (np. zrzut ekranu z kodem QR).
        await userManager.ResetAuthenticatorKeyAsync(user);
        var key = (await userManager.GetAuthenticatorKeyAsync(user))!;

        var label = Uri.EscapeDataString($"{AuthenticatorIssuer}:{user.Email}");
        var uri = $"otpauth://totp/{label}?secret={key}&issuer={Uri.EscapeDataString(AuthenticatorIssuer)}&digits=6";
        var formattedKey = string.Join(" ", key.Chunk(4).Select(chunk => new string(chunk))).ToLowerInvariant();

        return new TwoFactorSetupResponse(formattedKey, uri, await tokens.CreateTokenAsync(user, ct));
    }

    [HttpPost("two-factor/enable")]
    public async Task<ActionResult<RecoveryCodesResponse>> EnableTwoFactor(TwoFactorCodeRequest request, CancellationToken ct)
    {
        if (await userManager.FindByIdAsync(UserId) is not { } user)
        {
            return Unauthorized();
        }

        if (user.TwoFactorEnabled)
        {
            return Problem(statusCode: StatusCodes.Status409Conflict, detail: "Weryfikacja dwuetapowa jest już włączona.");
        }

        if (!await userManager.VerifyAuthenticatorCodeAsync(user, request.Code))
        {
            return Problem(
                statusCode: StatusCodes.Status400BadRequest,
                detail: "Nieprawidłowy kod. Sprawdź, czy zegar w telefonie jest ustawiony automatycznie.");
        }

        await userManager.SetTwoFactorEnabledAsync(user, true);
        var codes = await userManager.GenerateNewTwoFactorRecoveryCodesAsync(user, RecoveryCodeCount);

        return new RecoveryCodesResponse(codes!.ToList(), await tokens.CreateTokenAsync(user, ct));
    }

    [HttpPost("two-factor/disable")]
    public async Task<ActionResult<TokenResponse>> DisableTwoFactor(PasswordRequest request, CancellationToken ct)
    {
        if (await userManager.FindByIdAsync(UserId) is not { } user)
        {
            return Unauthorized();
        }

        if (!user.TwoFactorEnabled)
        {
            return Problem(statusCode: StatusCodes.Status409Conflict, detail: "Weryfikacja dwuetapowa nie jest włączona.");
        }

        if (!await userManager.CheckPasswordWithLockoutAsync(user, request.Password))
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, detail: "Nieprawidłowe hasło.");
        }

        await userManager.SetTwoFactorEnabledAsync(user, false);
        await userManager.ResetAuthenticatorKeyAsync(user);

        return new TokenResponse(await tokens.CreateTokenAsync(user, ct));
    }

    [HttpPost("two-factor/recovery-codes")]
    public async Task<ActionResult<RecoveryCodesResponse>> RegenerateRecoveryCodes(PasswordRequest request, CancellationToken ct)
    {
        if (await userManager.FindByIdAsync(UserId) is not { } user)
        {
            return Unauthorized();
        }

        if (!user.TwoFactorEnabled)
        {
            return Problem(statusCode: StatusCodes.Status409Conflict, detail: "Weryfikacja dwuetapowa nie jest włączona.");
        }

        if (!await userManager.CheckPasswordWithLockoutAsync(user, request.Password))
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, detail: "Nieprawidłowe hasło.");
        }

        var codes = await userManager.GenerateNewTwoFactorRecoveryCodesAsync(user, RecoveryCodeCount);
        return new RecoveryCodesResponse(codes!.ToList(), await tokens.CreateTokenAsync(user, ct));
    }

    private ActionResult IdentityErrors(IdentityResult result)
    {
        foreach (var error in result.Errors)
        {
            ModelState.AddModelError(error.Code, error.Description);
        }

        return ValidationProblem(ModelState);
    }
}
