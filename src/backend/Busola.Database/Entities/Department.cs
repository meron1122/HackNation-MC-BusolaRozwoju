namespace Busola.Database.Entities;

/// <summary>Wydział (należy do lokalizacji).</summary>
public class Department
{
    public int Id { get; set; }
    public required string Name { get; set; }

    public int LocationId { get; set; }
    public Location Location { get; set; } = null!;

    /// <summary>
    /// Kierujący komórką organizacyjną (opcjonalny). Przy pierwszej ocenie współtworzy ją z bezpośrednim
    /// przełożonym, może być na rozmowie oceniającej i podpisuje arkusz (§ 8 ust. 2, § 10 ust. 6 rozporządzenia z 2015 r.).
    /// </summary>
    public int? HeadId { get; set; }
    public Employee? Head { get; set; }

    public ICollection<Employee> Employees { get; set; } = [];
}
