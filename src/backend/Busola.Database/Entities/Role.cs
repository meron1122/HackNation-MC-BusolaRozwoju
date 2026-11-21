using Microsoft.AspNetCore.Identity;

namespace Busola.Database.Entities;

/// <summary>Rola jak w PIM (zestaw uprawnień), rozszerzona o poziom widoku.</summary>
public class Role : IdentityRole
{
    public DataScope Scope { get; set; }

    public ICollection<RolePermission> Permissions { get; set; } = [];
}
