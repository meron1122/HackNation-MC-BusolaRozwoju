using Busola.Database.Entities;
using P = Busola.Database.Authorization.Permissions;

namespace Busola.Database.Authorization;

/// <summary>
/// Domyślny zestaw ról i uprawnień, wgrywany migracją. Nowe uprawnienie: stała w <see cref="Permissions"/>,
/// wiersz tutaj (kolejne Id), przypisanie do ról, nowa migracja.
/// </summary>
internal static class PermissionSeed
{
    public static readonly Role[] Roles =
    [
        NewRole("c0a8e5d2-1f3b-4c6a-9e7d-2b5f8a1c3e01", RoleNames.Employee, DataScope.Own),
        NewRole("c0a8e5d2-1f3b-4c6a-9e7d-2b5f8a1c3e02", RoleNames.Supervisor, DataScope.Subordinates),
        NewRole("c0a8e5d2-1f3b-4c6a-9e7d-2b5f8a1c3e03", RoleNames.Hr, DataScope.Service),
        NewRole("c0a8e5d2-1f3b-4c6a-9e7d-2b5f8a1c3e04", RoleNames.ServiceAdmin, DataScope.Service),
        NewRole("c0a8e5d2-1f3b-4c6a-9e7d-2b5f8a1c3e05", RoleNames.SuperAdmin, DataScope.All),
    ];

    public static readonly Permission[] Permissions =
    [
        new() { Id = 1, Key = P.ReadEmployees, Name = "Podgląd pracowników" },
        new() { Id = 2, Key = P.AddEmployee, Name = "Dodawanie pracowników" },
        new() { Id = 3, Key = P.EditEmployee, Name = "Edycja pracowników" },
        new() { Id = 4, Key = P.DeleteEmployee, Name = "Usuwanie pracowników" },
        new() { Id = 5, Key = P.ReadLocations, Name = "Podgląd lokalizacji" },
        new() { Id = 6, Key = P.AddLocation, Name = "Dodawanie lokalizacji" },
        new() { Id = 7, Key = P.EditLocation, Name = "Edycja lokalizacji" },
        new() { Id = 8, Key = P.DeleteLocation, Name = "Usuwanie lokalizacji" },
        new() { Id = 9, Key = P.ReadDepartments, Name = "Podgląd wydziałów" },
        new() { Id = 10, Key = P.AddDepartment, Name = "Dodawanie wydziałów" },
        new() { Id = 11, Key = P.EditDepartment, Name = "Edycja wydziałów" },
        new() { Id = 12, Key = P.DeleteDepartment, Name = "Usuwanie wydziałów" },
        new() { Id = 13, Key = P.ManageUsers, Name = "Zarządzanie kontami i rolami" },
        new() { Id = 14, Key = P.ReadEvaluations, Name = "Podgląd ocen" },
        new() { Id = 15, Key = P.AddEvaluation, Name = "Zakładanie ocen" },
        new() { Id = 16, Key = P.EditEvaluation, Name = "Wypełnianie ocen i zamykanie etapów" },
        new() { Id = 17, Key = P.RemindEvaluations, Name = "Przypomnienia o terminach ocen" },
        new() { Id = 18, Key = P.ManagePositions, Name = "Słownik stanowisk" },
    ];

    // SuperAdmin nie ma wierszy — ma wszystko z urzędu.
    public static readonly RolePermission[] RolePermissions =
    [
        .. Grant(RoleNames.Employee, P.ReadEmployees, P.ReadEvaluations),
        .. Grant(RoleNames.Supervisor, P.ReadEmployees, P.ReadEvaluations, P.EditEvaluation),
        .. Grant(RoleNames.Hr,
            P.ReadEmployees, P.AddEmployee, P.EditEmployee, P.DeleteEmployee,
            P.ReadLocations, P.ReadDepartments,
            P.ReadEvaluations, P.AddEvaluation, P.EditEvaluation, P.RemindEvaluations, P.ManagePositions),
        .. Grant(RoleNames.ServiceAdmin, Permissions.Select(p => p.Key).ToArray()),
    ];

    private static Role NewRole(string id, string name, DataScope scope) => new()
    {
        Id = id,
        Name = name,
        NormalizedName = name.ToUpperInvariant(),
        ConcurrencyStamp = id,
        Scope = scope,
    };

    private static IEnumerable<RolePermission> Grant(string roleName, params string[] permissionKeys)
    {
        var roleId = Roles.Single(r => r.Name == roleName).Id;
        return permissionKeys.Select(key => new RolePermission
        {
            RoleId = roleId,
            PermissionId = Permissions.Single(p => p.Key == key).Id,
        });
    }
}
