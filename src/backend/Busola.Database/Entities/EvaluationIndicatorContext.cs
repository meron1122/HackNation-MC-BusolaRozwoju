namespace Busola.Database.Entities;

/// <summary>
/// Materiał roboczy oceniającego per wskaźnik: przykład oczekiwania z rozmowy rozpoczynającej (widzi go też oceniany)
/// oraz kontekst wybranego zachowania przy ocenie — jak często (once/sometimes/regularly) i złożoność (typical/high).
/// </summary>
public class EvaluationIndicatorContext
{
    public int EvaluationId { get; set; }
    public Evaluation Evaluation { get; set; } = null!;

    public required string IndicatorKey { get; set; }

    public string? Expectation { get; set; }
    public string? Frequency { get; set; }
    public string? Complexity { get; set; }

    public DateTimeOffset UpdatedAt { get; set; }
}
