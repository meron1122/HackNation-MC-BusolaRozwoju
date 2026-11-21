namespace Busola.Database.Entities;

/// <summary>Uprawnienie. Id i klucze są stałe — definiowane w <see cref="Authorization.Permissions"/>.</summary>
public class Permission
{
    public int Id { get; set; }
    public required string Key { get; set; }
    public required string Name { get; set; }
}
