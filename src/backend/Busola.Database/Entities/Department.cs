namespace Busola.Database.Entities;

/// <summary>Wydział (należy do lokalizacji).</summary>
public class Department
{
    public int Id { get; set; }
    public required string Name { get; set; }

    public int LocationId { get; set; }
    public Location Location { get; set; } = null!;

    public ICollection<Employee> Employees { get; set; } = [];
}
