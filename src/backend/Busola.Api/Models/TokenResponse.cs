namespace Busola.Api.Models;

/// <summary>Nowy token po operacji, która unieważnia stare (zmiana hasła, 2FA).</summary>
public sealed record TokenResponse(string Token);
