namespace Busola.Database.Entities;

/// <summary>Powód dnia wolnego (np. urlop wypoczynkowy, zwolnienie lekarskie).</summary>
public class AbsenceReason
{
    public int Id { get; set; }
    public required string Name { get; set; }

    public ICollection<Absence> Absences { get; set; } = [];
}
