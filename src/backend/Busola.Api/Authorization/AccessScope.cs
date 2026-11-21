namespace Busola.Api.Authorization;

/// <summary>Czyje dane obejmuje dane uprawnienie dla bieżącego użytkownika (suma zakresów jego ról).</summary>
public sealed record AccessScope(bool All, int? OwnEmployeeId, int? ServiceId, IReadOnlyList<int> SubordinateIds)
{
    public static readonly AccessScope Everything = new(true, null, null, []);
    public static readonly AccessScope Nothing = new(false, null, null, []);

    public bool CoversService(int serviceId) => All || ServiceId == serviceId;
}
