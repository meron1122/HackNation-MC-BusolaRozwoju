using Microsoft.AspNetCore.Identity;

namespace Busola.Api.Infrastructure;

public static class IdentityErrorExtensions
{
    /// <summary>Login = e-mail, więc przy zajętym adresie Identity zgłasza dwa takie same błędy — zostawiamy jeden.</summary>
    public static IEnumerable<IdentityError> WithoutDuplicateUserName(this IEnumerable<IdentityError> errors)
    {
        var list = errors.ToList();
        var hasDuplicateEmail = list.Any(e => e.Code == nameof(IdentityErrorDescriber.DuplicateEmail));
        return list.Where(e => !(hasDuplicateEmail && e.Code == nameof(IdentityErrorDescriber.DuplicateUserName)));
    }
}

/// <summary>Komunikaty Identity trafiają prosto do UI, więc po polsku.</summary>
public sealed class PolishIdentityErrorDescriber : IdentityErrorDescriber
{
    public override IdentityError DefaultError() => Error(nameof(DefaultError), "Wystąpił nieoczekiwany błąd.");

    public override IdentityError PasswordMismatch() => Error(nameof(PasswordMismatch), "Nieprawidłowe hasło.");

    public override IdentityError PasswordTooShort(int length) =>
        Error(nameof(PasswordTooShort), $"Hasło musi mieć co najmniej {length} znaków.");

    public override IdentityError PasswordRequiresDigit() =>
        Error(nameof(PasswordRequiresDigit), "Hasło musi zawierać cyfrę.");

    public override IdentityError PasswordRequiresLower() =>
        Error(nameof(PasswordRequiresLower), "Hasło musi zawierać małą literę.");

    public override IdentityError PasswordRequiresUpper() =>
        Error(nameof(PasswordRequiresUpper), "Hasło musi zawierać wielką literę.");

    public override IdentityError PasswordRequiresNonAlphanumeric() =>
        Error(nameof(PasswordRequiresNonAlphanumeric), "Hasło musi zawierać znak specjalny.");

    public override IdentityError PasswordRequiresUniqueChars(int uniqueChars) =>
        Error(nameof(PasswordRequiresUniqueChars), $"Hasło musi zawierać co najmniej {uniqueChars} różnych znaków.");

    public override IdentityError InvalidEmail(string? email) =>
        Error(nameof(InvalidEmail), $"Adres e-mail „{email}” jest nieprawidłowy.");

    public override IdentityError DuplicateEmail(string email) =>
        Error(nameof(DuplicateEmail), $"Konto z adresem {email} już istnieje.");

    public override IdentityError DuplicateUserName(string userName) =>
        Error(nameof(DuplicateUserName), $"Konto {userName} już istnieje.");

    public override IdentityError RecoveryCodeRedemptionFailed() =>
        Error(nameof(RecoveryCodeRedemptionFailed), "Nieprawidłowy kod odzyskiwania.");

    private static IdentityError Error(string code, string description) => new() { Code = code, Description = description };
}
