using Busola.Database.Entities;
using Microsoft.AspNetCore.Identity;

namespace Busola.Api.Authorization;

public static class UserManagerExtensions
{
    /// <summary>
    /// Jak CheckPasswordAsync, ale błędne hasło liczy się do blokady konta, a poprawne NIE zeruje licznika —
    /// zeruje go dopiero pełne logowanie. Inaczej przy 2FA każda próba z dobrym hasłem kasowałaby
    /// nieudane próby kodu i dałoby się zgadywać kod bez końca.
    /// </summary>
    public static async Task<bool> CheckPasswordWithLockoutAsync(this UserManager<User> userManager, User user, string password)
    {
        if (await userManager.IsLockedOutAsync(user))
        {
            return false;
        }

        if (await userManager.CheckPasswordAsync(user, password))
        {
            return true;
        }

        await userManager.AccessFailedAsync(user);
        return false;
    }

    /// <summary>Aplikacje pokazują kod jako „123 456”, więc spacje i myślniki pomijamy.</summary>
    public static Task<bool> VerifyAuthenticatorCodeAsync(this UserManager<User> userManager, User user, string code) =>
        userManager.VerifyTwoFactorTokenAsync(
            user,
            TokenOptions.DefaultAuthenticatorProvider,
            code.Replace(" ", "").Replace("-", ""));
}
