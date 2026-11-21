namespace Busola.Database.Entities;

/// <summary>
/// Etap konkretnej oceny. Terminy są liczone z reguł szablonu przy zakładaniu oceny i zapisywane tutaj,
/// bo bywają przesuwane indywidualnie (np. o nieobecności). „Po terminie” wynika z DueTo i dzisiejszej daty — nie jest zapisywane.
/// </summary>
public class EvaluationStage
{
    public int Id { get; set; }

    public int EvaluationId { get; set; }
    public Evaluation Evaluation { get; set; } = null!;

    /// <summary>Klucz etapu ze szablonu (np. initial_interview, criteria).</summary>
    public required string StageKey { get; set; }

    public StageStatus Status { get; set; }

    /// <summary>Nie wcześniej niż (okno, np. pierwsza ocena od 8. miesiąca).</summary>
    public DateOnly? DueFrom { get; set; }

    /// <summary>Nie później niż.</summary>
    public DateOnly? DueTo { get; set; }

    public DateOnly? CompletedOn { get; set; }
}
