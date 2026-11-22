namespace Busola.Database.Entities;

/// <summary>
/// Samoocena ocenianego (perspektywa pracownika na rozmowie oceniającej, przy pierwszej ocenie — sprawozdanie).
/// Materiał roboczy, nie pole arkusza: wypełnia ją oceniany w etapie oznaczonym w szablonie jako selfAssessment,
/// a po przekazaniu (SubmittedAt) już jej nie zmienia. Jeden wiersz na ocenę, pozycje w jsonb.
/// </summary>
public class EvaluationSelfAssessment
{
    public int EvaluationId { get; set; }
    public Evaluation Evaluation { get; set; } = null!;

    public List<SelfAssessmentItem> Criteria { get; set; } = [];

    /// <summary>
    /// Treść sprawozdania (pierwsza ocena, formularz z załącznika nr 3): zadania, problemy i sposób ich rozwiązania,
    /// zdobyta wiedza i umiejętności, wnioski. Na formularzu doklejana jest do niej samoocena elementów jako tekst.
    /// </summary>
    public string? Report { get; set; }

    /// <summary>Potrzeby rozwojowe zgłoszone przez ocenianego — materiał do wniosków IPRZ.</summary>
    public string? DevelopmentNeeds { get; set; }

    public DateTimeOffset UpdatedAt { get; set; }

    /// <summary>Przekazanie przełożonemu; od tej chwili samoocena jest tylko do odczytu.</summary>
    public DateTimeOffset? SubmittedAt { get; set; }
}

/// <summary>Samoocena jednego kryterium: Level = klucz stopnia skali arkusza (np. meets), Comment = przykład / uzasadnienie.</summary>
public class SelfAssessmentItem
{
    public required string CriterionKey { get; set; }
    public string? Level { get; set; }
    public string? Comment { get; set; }
}
