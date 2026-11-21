using System.ComponentModel.DataAnnotations;

namespace Busola.Api.Models;

/// <summary>
/// Przy włączonym 2FA klient wysyła hasło ponownie razem z kodem (jak MapIdentityApi). Nie ma osobnego kroku
/// „weryfikuj kod dla userId”, który pozwalałby pominąć hasło.
/// </summary>
public sealed record LoginRequest(
    [Required] string Email,
    [Required] string Password,
    string? TwoFactorCode = null,
    string? RecoveryCode = null);
