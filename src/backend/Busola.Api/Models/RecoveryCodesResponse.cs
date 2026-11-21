namespace Busola.Api.Models;

/// <summary>Kody są pokazywane tylko raz — w bazie zostają wyłącznie do jednorazowego użycia.</summary>
public sealed record RecoveryCodesResponse(IReadOnlyList<string> RecoveryCodes, string Token);
