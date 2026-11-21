namespace Busola.Database.Entities;

/// <summary>Lokalizacja (należy do służby).</summary>
public class Location
{
    public int Id { get; set; }
    public required string Name { get; set; }

    public int ServiceId { get; set; }
    public Service Service { get; set; } = null!;

    public ICollection<Department> Departments { get; set; } = [];
}
