namespace Busola.Database.Entities;

/// <summary>
/// Notatka oceniającego z obserwacji w okresie oceny (sytuacja – działanie – rezultat), opcjonalnie przypięta do
/// wskaźnika behawioralnego. Materiał roboczy, nie część arkusza; oceniany jej nie widzi. Prywatną widzi tylko autor.
/// </summary>
public class EvaluationNote
{
    public int Id { get; set; }

    public int EvaluationId { get; set; }
    public Evaluation Evaluation { get; set; } = null!;

    public required string AuthorId { get; set; }
    public User Author { get; set; } = null!;

    /// <summary>Dzień zdarzenia — decyduje, czy notatka mieści się w okresie oceny.</summary>
    public DateOnly ObservedOn { get; set; }

    public string? Situation { get; set; }
    public string? Action { get; set; }
    public string? Result { get; set; }

    /// <summary>Klucz wskaźnika z competencyModel (np. reliability_2) i jego kryterium; oba null = notatka ogólna.</summary>
    public string? IndicatorKey { get; set; }
    public string? CriterionKey { get; set; }

    public bool IsPrivate { get; set; }
    public bool DiscussedWithEmployee { get; set; }

    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}
