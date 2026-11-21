namespace Busola.Database.Entities;

/// <summary>Dni wolne pracownika: zakres dat włącznie z obiema granicami.</summary>
public class Absence
{
    public int Id { get; set; }
    public DateOnly StartDate { get; set; }
    public DateOnly EndDate { get; set; }

    public int ReasonId { get; set; }
    public AbsenceReason Reason { get; set; } = null!;

    public int EmployeeId { get; set; }
    public Employee Employee { get; set; } = null!;
}
