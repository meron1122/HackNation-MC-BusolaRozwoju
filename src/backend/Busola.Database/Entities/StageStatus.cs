namespace Busola.Database.Entities;

public enum StageStatus
{
    Pending,
    Completed,

    /// <summary>Etap opcjonalny, z którego nie skorzystano (np. brak sprzeciwu).</summary>
    Skipped,
}
