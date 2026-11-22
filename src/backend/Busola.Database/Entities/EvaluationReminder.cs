namespace Busola.Database.Entities;

/// <summary>Przypomnienie HR o etapie oceny, pokazywane oceniającemu na pulpicie (bez maili).</summary>
public class EvaluationReminder
{
    public int Id { get; set; }

    public int EvaluationId { get; set; }
    public Evaluation Evaluation { get; set; } = null!;

    /// <summary>Etap, którego dotyczy przypomnienie (etap w toku w chwili wysłania).</summary>
    public required string StageKey { get; set; }

    /// <summary>Adresat — oceniający w chwili wysłania.</summary>
    public int? RecipientId { get; set; }
    public Employee? Recipient { get; set; }

    public string? Message { get; set; }

    public required string SentById { get; set; }
    public User SentBy { get; set; } = null!;
    public DateTimeOffset SentAt { get; set; }
}
