namespace Busola.Database.Entities;

public class RolePermission
{
    public required string RoleId { get; set; }
    public Role Role { get; set; } = null!;

    public int PermissionId { get; set; }
    public Permission Permission { get; set; } = null!;
}
