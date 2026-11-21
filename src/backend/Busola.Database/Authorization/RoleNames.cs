namespace Busola.Database.Authorization;

public static class RoleNames
{
    public const string Employee = "Employee";
    public const string Supervisor = "Supervisor";
    public const string Hr = "Hr";
    public const string ServiceAdmin = "ServiceAdmin";

    /// <summary>Omija wszystkie sprawdzenia uprawnień, jak Admin w PIM.</summary>
    public const string SuperAdmin = "SuperAdmin";

    /// <summary>Nadawane przy logowaniu na podstawie danych pracownika, nie przypisuje się ich ręcznie.</summary>
    public static IReadOnlySet<string> Derived { get; } = new HashSet<string> { Employee, Supervisor };
}
