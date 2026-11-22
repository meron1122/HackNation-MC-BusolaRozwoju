namespace Busola.Database.Entities;

/// <summary>Materiał roboczy per kryterium: dlaczego ocena cząstkowa różni się od sugestii ze wskaźników.</summary>
public class EvaluationCriterionContext
{
    public int EvaluationId { get; set; }
    public Evaluation Evaluation { get; set; } = null!;

    public required string CriterionKey { get; set; }

    public string? ScoreReason { get; set; }

    public DateTimeOffset UpdatedAt { get; set; }
}
