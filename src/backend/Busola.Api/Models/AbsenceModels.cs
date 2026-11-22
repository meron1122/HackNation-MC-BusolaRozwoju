namespace Busola.Api.Models;

/// <summary>Kind: Justified (usprawiedliwiona), OfficialDuty (obowiązki służbowe poza miejscem pracy), Unjustified.</summary>
public sealed record AbsenceReasonDto(int Id, string Name, string Kind);

/// <summary>EndDate = null: nieobecność trwa.</summary>
public sealed record AbsenceDto(int Id, DateOnly StartDate, DateOnly? EndDate, int ReasonId, string ReasonName, string Kind);

public sealed record AbsenceRequest(DateOnly StartDate, DateOnly? EndDate, int ReasonId);

/// <summary>Wiersz listy nieobecności wszystkich pracowników w zakresie (strona „Nieobecności”).</summary>
public sealed record AbsenceListItemDto(
    int Id, int EmployeeId, string EmployeeName, DateOnly StartDate, DateOnly? EndDate, int ReasonId, string ReasonName, string Kind);

/// <summary>Nieobecność ze strony „Nieobecności”: pracownik wybierany w formularzu.</summary>
public sealed record AbsenceEntryRequest(int EmployeeId, DateOnly StartDate, int ReasonId, DateOnly? EndDate = null);

/// <summary>Zmiana terminu z decyzji (historia oceny). HasNotice: jest PDF zawiadomienia (§ 5 ust. 4 / § 8 rozporządzeń).</summary>
public sealed record TermChangeDto(
    int Id,
    string Kind,
    string StageKey,
    string LegalRef,
    DateOnly? OldFrom,
    DateOnly? OldTo,
    DateOnly? NewFrom,
    DateOnly? NewTo,
    DateOnly? ContractEnd,
    string Reason,
    string ChangedByName,
    DateOnly ChangedOn,
    bool HasNotice);

/// <summary>
/// Podpowiedź nowego terminu sprawozdania (§ 5 ust. 1): dotychczasowy koniec + dni nieobecności w terminie.
/// Latest: najpóźniejszy koniec, przy którym ocena zmieści się w okresie oceny (§ 5 ust. 3).
/// </summary>
public sealed record ReportTermSuggestionDto(DateOnly? From, DateOnly To, int AbsenceDays, IReadOnlyList<string> Absences, DateOnly? Latest);

/// <summary>Art. 35 ust. 4: usprawiedliwione nieobecności w pierwszych 12 miesiącach i czy przekraczają próg przedłużenia umowy.</summary>
public sealed record FirstYearAbsenceDto(int JustifiedDays, bool LongContinuous, bool Threshold);

/// <summary>
/// Terminy oceny a nieobecności: nieobecności od początku okresu oceny, historia zmian terminów, podpowiedzi i to,
/// co wolno teraz zrobić (CanChangeReportTerm — pierwsza ocena, sprawozdanie w toku; CanExtendContract — pierwsza ocena
/// przed sporządzeniem; CanChangeEvaluationTerm — okresowa, ocena w toku; EvaluationTermEarliest — art. 81 ust. 8: od dnia
/// po upływie 6 miesięcy od początku okresu oceny).
/// </summary>
public sealed record EvaluationTermsDto(
    IReadOnlyList<AbsenceDto> Absences,
    IReadOnlyList<TermChangeDto> Changes,
    ReportTermSuggestionDto? ReportSuggestion,
    FirstYearAbsenceDto? FirstYear,
    DateOnly? ContractEnd,
    bool CanChangeReportTerm,
    bool CanExtendContract,
    bool CanChangeEvaluationTerm,
    DateOnly? EvaluationTermEarliest);

/// <summary>DueFrom: nowy początek terminu; brak = dotychczasowy.</summary>
public sealed record ReportTermRequest(DateOnly DueTo, string Reason, DateOnly? DueFrom = null, bool AfterContractExtension = false);

/// <summary>Ground: punkt art. 81 ust. 8 ustawy (1 — zmiana oceniającego, 2 — nieobecność ocenianego, 3 — nieobecność oceniającego, 4 — wniosek ocenianego).</summary>
public sealed record EvaluationTermRequest(DateOnly DueTo, int Ground, string Reason);

public sealed record ContractExtensionRequest(DateOnly ContractEnd, string Reason);
