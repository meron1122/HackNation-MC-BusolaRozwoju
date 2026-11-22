namespace Busola.Database.Entities;

/// <summary>
/// Zmiana terminu w ocenie dokonana decyzją (nie z mocy prawa): kto, kiedy, dlaczego, stary i nowy termin.
/// Do zmian wymagających pisma (§ 5 ust. 4 rozporządzenia z 2015 r., § 8 rozporządzenia z 2016 r.) jest PDF zawiadomienia.
/// </summary>
public class EvaluationTermChange
{
    public int Id { get; set; }

    public int EvaluationId { get; set; }
    public Evaluation Evaluation { get; set; } = null!;

    public TermChangeKind Kind { get; set; }

    /// <summary>Etap, którego termin się zmienił (sprawozdanie / ocena).</summary>
    public required string StageKey { get; set; }

    public DateOnly? OldFrom { get; set; }
    public DateOnly? OldTo { get; set; }
    public DateOnly? NewFrom { get; set; }
    public DateOnly? NewTo { get; set; }

    /// <summary>Przedłużenie umowy (art. 35 ust. 4): nowa data końca umowy.</summary>
    public DateOnly? ContractEnd { get; set; }

    /// <summary>Podstawa zmiany, np. „§ 5 ust. 1”, „art. 81 ust. 8 pkt 2”, „art. 35 ust. 4”.</summary>
    public required string LegalRef { get; set; }

    public required string Reason { get; set; }

    public required string ChangedById { get; set; }
    public User ChangedBy { get; set; } = null!;

    /// <summary>„Imię i nazwisko” — kopia z chwili zmiany (podpis pod zawiadomieniem).</summary>
    public required string ChangedByName { get; set; }

    public DateOnly ChangedOn { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}

/// <summary>
/// ReportTerm: nowy termin sprawozdania (§ 5 ust. 1 — nieobecność / obowiązki poza miejscem pracy, § 5 ust. 2 — po
/// przedłużeniu umowy). EvaluationTerm: zmiana terminu oceny okresowej (art. 81 ust. 8 ustawy).
/// ContractExtension: przedłużenie umowy o czas nieobecności (art. 35 ust. 4 ustawy) — przesuwa okres pierwszej oceny.
/// </summary>
public enum TermChangeKind
{
    ReportTerm,
    EvaluationTerm,
    ContractExtension,
}
