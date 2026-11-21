namespace Busola.Database.Entities;

/// <summary>Konkretna ocena pracownika, prowadzona według jednej wersji szablonu.</summary>
public class Evaluation
{
    public int Id { get; set; }

    public int EmployeeId { get; set; }
    public Employee Employee { get; set; } = null!;

    public int TemplateId { get; set; }
    public EvaluationTemplate Template { get; set; } = null!;

    /// <summary>Klucz ze słownika statuses szablonu.</summary>
    public required string Status { get; set; }

    /// <summary>
    /// Punkt odniesienia terminów (anchor "start"): przy pierwszej ocenie data nawiązania stosunku pracy
    /// (albo ustalenia, że oceniany jej podlega); przy okresowej początek 24-miesięcznego cyklu — dzień
    /// sporządzenia na piśmie poprzedniej oceny albo zatrudnienia na czas nieokreślony.
    /// </summary>
    public DateOnly StartDate { get; set; }

    /// <summary>Oceniający / bezpośredni przełożony w chwili założenia oceny.</summary>
    public int? EvaluatorId { get; set; }
    public Employee? Evaluator { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public ICollection<EvaluationStage> Stages { get; set; } = [];
    public ICollection<EvaluationAnswer> Answers { get; set; } = [];
    public ICollection<EvaluationSignature> Signatures { get; set; } = [];
}
