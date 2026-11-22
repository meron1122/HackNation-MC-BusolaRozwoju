namespace Busola.Api.Authorization;

public static class BusolaClaims
{
    public const string UserId = "sub";
    public const string Name = "name";
    public const string Role = "role";
    public const string Permission = "permission";
    public const string SecurityStamp = "stamp";

    /// <summary>Nie ma go w tokenie: dokłada go SecurityStampValidation z bazy (aktualny e-mail do dziennika audytu).</summary>
    public const string Email = "email";
}
