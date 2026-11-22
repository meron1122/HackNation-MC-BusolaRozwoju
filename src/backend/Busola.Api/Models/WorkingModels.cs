namespace Busola.Api.Models;

/// <summary>InPeriod: data zdarzenia mieści się w okresie oceny (od zamknięcia pierwszego etapu do dziś) — tylko takie liczą się jako dowody.</summary>
public sealed record NoteDto(
    int Id,
    DateOnly ObservedOn,
    string? Situation,
    string? Action,
    string? Result,
    string? IndicatorKey,
    string? CriterionKey,
    bool IsPrivate,
    bool DiscussedWithEmployee,
    string AuthorName,
    DateTimeOffset CreatedAt,
    bool CanEdit,
    bool InPeriod);

public sealed record NoteRequest(
    DateOnly ObservedOn,
    string? Situation = null,
    string? Action = null,
    string? Result = null,
    string? IndicatorKey = null,
    bool IsPrivate = false,
    bool DiscussedWithEmployee = false);

public sealed record IndicatorEvidenceDto(string IndicatorKey, string? CriterionKey, int Count);

/// <summary>
/// Dowody w okresie oceny: liczba notatek per wskaźnik (W06 „4 notatki / brak dowodów”), udział notatek z ostatnich
/// 4 miesięcy (ostrzeżenie o efekcie świeżości) i liczba notatek spoza okresu.
/// </summary>
public sealed record EvidenceDto(DateOnly PeriodStart, IReadOnlyList<IndicatorEvidenceDto> Indicators, int InPeriod, decimal? RecentShare, int OutsidePeriod);

public sealed record NotesDto(IReadOnlyList<NoteDto> Notes, EvidenceDto Evidence);

/// <summary>Frequency: once / sometimes / regularly, Complexity: typical / high. W żądaniu PUT: null = bez zmian, "" = wyczyść.</summary>
public sealed record IndicatorContextDto(string IndicatorKey, string? Expectation, string? Frequency, string? Complexity);

public sealed record CriterionContextDto(string CriterionKey, string? ScoreReason);

/// <summary>Oceniany dostaje tylko oczekiwania (Expectation); reszta to materiał oceniającego.</summary>
public sealed record WorkingContextDto(IReadOnlyList<IndicatorContextDto> Indicators, IReadOnlyList<CriterionContextDto> Criteria);

public sealed record IndicatorContextRequest(string? Expectation = null, string? Frequency = null, string? Complexity = null);

public sealed record CriterionContextRequest(string? ScoreReason = null);
