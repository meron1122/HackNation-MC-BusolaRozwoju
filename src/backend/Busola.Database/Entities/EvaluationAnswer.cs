namespace Busola.Database.Entities;

/// <summary>
/// Jedna wartość pola arkusza. Typ pola określa szablon, a wartość trafia do kolumny odpowiedniego typu.
/// Dane osób (blok „person”) są kopią z chwili wypełnienia, nie odwołaniem do pracownika — arkusz to dokument.
/// </summary>
public class EvaluationAnswer
{
    public int Id { get; set; }

    public int EvaluationId { get; set; }
    public Evaluation Evaluation { get; set; } = null!;

    /// <summary>Klucz pola ze szablonu, np. result, evaluationInterviewDate.</summary>
    public required string FieldKey { get; set; }

    /// <summary>
    /// Pozycja wewnątrz pola, null dla zwykłych pól: element/kryterium w „scores”, wybrane kryterium
    /// w „criteriaSelection”, firstName/lastName/department/position w „person”.
    /// </summary>
    public string? ItemKey { get; set; }

    /// <summary>text, longText, choice (klucz opcji), nazwa kryterium dodatkowego, część bloku osoby.</summary>
    public string? ValueText { get; set; }

    /// <summary>scores, average, year. Średnia i poziom są zapisywane przy sporządzeniu oceny, żeby dokument się nie zmienił.</summary>
    public decimal? ValueNumber { get; set; }

    /// <summary>date, początek dateRange.</summary>
    public DateOnly? ValueDate { get; set; }

    /// <summary>Koniec dateRange.</summary>
    public DateOnly? ValueDateTo { get; set; }

    public required string UpdatedById { get; set; }
    public User UpdatedBy { get; set; } = null!;
    public DateTimeOffset UpdatedAt { get; set; }
}
