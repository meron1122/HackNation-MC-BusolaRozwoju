namespace Busola.Database.Entities;

/// <summary>Pracownik.</summary>
public class Employee
{
    public int Id { get; set; }
    public required string FirstName { get; set; }
    public required string LastName { get; set; }
    public DateOnly DateOfBirth { get; set; }

    /// <summary>Data zatrudnienia.</summary>
    public DateOnly HireDate { get; set; }

    public int DepartmentId { get; set; }
    public Department Department { get; set; } = null!;

    /// <summary>Przełożony (opcjonalny).</summary>
    public int? SupervisorId { get; set; }
    public Employee? Supervisor { get; set; }

    public ICollection<Employee> Subordinates { get; set; } = [];
    public ICollection<Absence> Absences { get; set; } = [];
}
