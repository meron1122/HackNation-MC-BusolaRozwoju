namespace Busola.Database.Entities;

/// <summary>Powód nieobecności (np. urlop wypoczynkowy, zwolnienie lekarskie) — słownik stały, seedowany.</summary>
public class AbsenceReason
{
    public int Id { get; set; }
    public required string Name { get; set; }

    /// <summary>Od rodzaju zależy wpływ na terminy ocen (art. 81 ust. 7 i art. 35 ust. 4 ustawy, § 5 ust. 1 rozporządzenia z 2015 r.).</summary>
    public AbsenceKind Kind { get; set; }

    public ICollection<Absence> Absences { get; set; } = [];
}

/// <summary>
/// Justified: usprawiedliwiona nieobecność w pracy (przedłuża terminy ocen). OfficialDuty: wykonywanie obowiązków
/// służbowych poza miejscem pracy — przy pierwszej ocenie podstawa nowego terminu sprawozdania (§ 5 ust. 1), ale nie jest
/// nieobecnością w rozumieniu art. 81 ust. 7. Unjustified: nie wpływa na terminy.
/// </summary>
public enum AbsenceKind
{
    Justified,
    OfficialDuty,
    Unjustified,
}
