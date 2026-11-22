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

    /// <summary>
    /// Podlega pierwszej ocenie w służbie cywilnej. Przy zakładaniu pracownika: true — pierwsza ocena,
    /// false — od razu cykl oceny okresowej; oba od daty zatrudnienia.
    /// </summary>
    public bool SubjectToFirstEvaluation { get; set; }

    public int DepartmentId { get; set; }
    public Department Department { get; set; } = null!;

    /// <summary>Stanowisko ze słownika urzędu (opcjonalne).</summary>
    public int? PositionId { get; set; }
    public Position? Position { get; set; }

    /// <summary>Przełożony (opcjonalny).</summary>
    public int? SupervisorId { get; set; }
    public Employee? Supervisor { get; set; }

    public ICollection<Employee> Subordinates { get; set; } = [];
    public ICollection<Absence> Absences { get; set; } = [];

    /// <summary>Konto w systemie (opcjonalne).</summary>
    public User? User { get; set; }
}
