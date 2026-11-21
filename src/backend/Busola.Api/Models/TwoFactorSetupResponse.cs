namespace Busola.Api.Models;

/// <summary>AuthenticatorUri (otpauth://) frontend pokazuje jako kod QR; SharedKey — do wpisania ręcznie.</summary>
public sealed record TwoFactorSetupResponse(string SharedKey, string AuthenticatorUri, string Token);
