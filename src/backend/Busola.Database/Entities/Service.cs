namespace Busola.Database.Entities;

/// <summary>Służba.</summary>
public class Service
{
    public int Id { get; set; }
    public required string Name { get; set; }
    public string? LogoUrl { get; set; }

    public ICollection<Location> Locations { get; set; } = [];
}
