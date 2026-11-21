namespace Busola.Api.Models;

/// <summary>RequiresTwoFactor = hasło poprawne, ale trzeba jeszcze kodu; wtedy Token jest null.</summary>
public sealed record LoginResponse(string? Token, bool RequiresTwoFactor = false);
