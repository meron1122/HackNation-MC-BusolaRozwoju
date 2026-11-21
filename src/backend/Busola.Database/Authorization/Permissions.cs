namespace Busola.Database.Authorization;

/// <summary>Klucze uprawnień (jak Permissions w PIM). Każdy klucz jest też nazwą polityki autoryzacji w API.</summary>
public static class Permissions
{
    public const string ReadEmployees = "read_employees";
    public const string AddEmployee = "add_employee";
    public const string EditEmployee = "edit_employee";
    public const string DeleteEmployee = "delete_employee";

    public const string ReadLocations = "read_locations";
    public const string AddLocation = "add_location";
    public const string EditLocation = "edit_location";
    public const string DeleteLocation = "delete_location";

    public const string ReadDepartments = "read_departments";
    public const string AddDepartment = "add_department";
    public const string EditDepartment = "edit_department";
    public const string DeleteDepartment = "delete_department";

    public const string ManageUsers = "manage_users";

    public static IReadOnlyList<string> All { get; } = PermissionSeed.Permissions.Select(p => p.Key).ToArray();
}
