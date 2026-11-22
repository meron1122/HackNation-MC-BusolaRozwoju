using System.Text.Json;

namespace Busola.Api.Models;

public sealed record EvaluationTemplateDto(int Id, string Code, int Version, string Kind, string Title);

public sealed record EvaluationListItemDto(
    int Id,
    int EmployeeId,
    string EmployeeName,
    string TemplateTitle,
    string Status,
    string StatusLabel,
    bool IsFinal,
    DateOnly StartDate,
    string? NextStageTitle,
    DateOnly? NextDueTo,
    string TemplateCode,
    string Phase);

/// <summary>StartDate domyślnie: przy pierwszej ocenie data zatrudnienia, przy okresowej — dziś.</summary>
public sealed record CreateEvaluationRequest(int EmployeeId, string TemplateCode, DateOnly? StartDate = null);

/// <summary>Zmiana ścieżki przed rozpoczęciem oceny; StartDate puste = dotychczasowy start.</summary>
public sealed record ChangeTemplateRequest(string TemplateCode, DateOnly? StartDate = null);

public sealed record EvaluationDetailDto(
    int Id,
    int EmployeeId,
    string EmployeeName,
    string? EvaluatorName,
    string TemplateTitle,
    string Status,
    string StatusLabel,
    bool IsFinal,
    DateOnly StartDate,
    JsonElement Schema,
    IReadOnlyList<StageDto> Stages,
    IReadOnlyList<AnswerDto> Answers,
    IReadOnlyList<SignatureDto> Signatures,
    bool CanEdit,
    bool IsOwn,
    string TemplateCode,
    string Phase,
    string? CurrentStageKey,
    IReadOnlyList<string> LockedSections,
    ScoringDto? Scoring,
    PreviousEvaluationDto? Previous,
    string? UnitHeadName,
    bool CanEditSelfAssessment,
    IReadOnlyList<AnswerDto> Prefill);

/// <summary>
/// Podgląd liczenia: per kryterium sugestia ze wskaźników (średnia ocenionych wskaźników zaokrąglona do najbliższego
/// stopnia skali) i ocena wpisana przez oceniającego (Score — może się różnić od sugestii); średnia, poziom i wynik
/// dopiero, gdy wszystkie kryteria mają ocenę. Przy sporządzeniu oceny te same wartości trafiają do arkusza.
/// </summary>
public sealed record ScoringDto(
    string ScoresField,
    IReadOnlyList<CriterionScoringDto> Criteria,
    decimal? Average,
    string? Level,
    string? LevelLabel,
    string? Result);

public sealed record CriterionScoringDto(
    string Key,
    string Label,
    int RatedIndicators,
    int NoBasisIndicators,
    int TotalIndicators,
    decimal? IndicatorMean,
    int? Suggested,
    decimal? Score);

/// <summary>Ostatnia sporządzona ocena tej osoby w systemie (do „Danych dotyczących poprzedniej oceny”).</summary>
public sealed record PreviousEvaluationDto(int Id, string TemplateTitle, DateOnly Date, string? Result, string? Level, string? LevelLabel, decimal? Average);

public sealed record CheckIssue(string StageKey, string? SectionKey, string? FieldKey, string Message, string? LegalRef, bool Blocking);

/// <summary>Complete = widoczna i bez braków blokujących (ptaszek kroku), Locked = etap sekcji zamknięty.</summary>
public sealed record SectionCheckDto(
    string Key, string Title, string? Part, string StageKey, bool Visible, bool Locked, bool Complete, IReadOnlyList<CheckIssue> Issues);

/// <summary>CanSkip: etap opcjonalny albo sprawozdanie po terminie (oznaczenie jako niezłożone).</summary>
public sealed record StageCheckDto(string Key, string Title, string Status, bool CanComplete, bool CanSkip, IReadOnlyList<CheckIssue> Issues);

public sealed record EvaluationCheckDto(IReadOnlyList<StageCheckDto> Stages, IReadOnlyList<SectionCheckDto> Sections);

/// <summary>Level: klucz stopnia skali arkusza (np. below / meets / above).</summary>
public sealed record SelfAssessmentItemDto(string CriterionKey, string? Level = null, string? Comment = null);

public sealed record SelfAssessmentCriterionDto(string Key, string Label, string? Level, string? Comment);

/// <summary>
/// Samoocena. Oceniany widzi swoją zawsze; pozostali dopiero po przekazaniu (Submitted), wcześniej bez treści.
/// CanEdit: oceniany, etap samooceny w toku, jeszcze nie przekazana.
/// </summary>
public sealed record SelfAssessmentDto(
    string? StageKey,
    bool StageOpen,
    bool CanEdit,
    bool Submitted,
    DateTimeOffset? SubmittedAt,
    DateTimeOffset? UpdatedAt,
    IReadOnlyList<ScaleOptionDto> Scale,
    IReadOnlyList<SelfAssessmentCriterionDto> Criteria,
    string? DevelopmentNeeds);

public sealed record ScaleOptionDto(int Value, string Key, string Label);

public sealed record SaveSelfAssessmentRequest(IReadOnlyList<SelfAssessmentItemDto> Criteria, string? DevelopmentNeeds = null);

public sealed record ReminderDto(int Id, int EvaluationId, string StageKey, string StageTitle, string? RecipientName, string? Message, string SentByName, DateTimeOffset SentAt);

public sealed record SendReminderRequest(string? Message = null);

public sealed record SendRemindersRequest(IReadOnlyList<int> EvaluationIds, string? Message = null);

public sealed record SendRemindersResponse(int Sent, IReadOnlyList<int> Skipped);

public sealed record StageDto(
    string Key,
    string Title,
    string Status,
    bool Optional,
    DateOnly? DueFrom,
    DateOnly? DueTo,
    DateOnly? CompletedOn,
    bool Overdue);

/// <summary>Wartość pola; wszystkie wartości puste = usunięcie wpisu.</summary>
public sealed record AnswerDto(
    string FieldKey,
    string? ItemKey = null,
    string? ValueText = null,
    decimal? ValueNumber = null,
    DateOnly? ValueDate = null,
    DateOnly? ValueDateTo = null);

public sealed record SaveAnswersRequest(IReadOnlyList<AnswerDto> Answers);

public sealed record CompleteStageRequest(DateOnly CompletedOn);

public sealed record SignatureDto(int Id, string FieldKey, string Role, string SignerName, DateOnly SignedOn, string? Place, bool HasImage);

/// <summary>Image: opcjonalny PNG/WebP jako base64 albo data URL (np. canvas.toDataURL()).</summary>
public sealed record SignRequest(string FieldKey, DateOnly SignedOn, string? Place = null, string? Image = null);

/// <summary>Pracownik bez otwartej oceny — nikt nie pilnuje jego terminów.</summary>
public sealed record EmployeeWithoutEvaluationDto(int EmployeeId, string EmployeeName, DateOnly HireDate, bool SubjectToFirstEvaluation);

public sealed record DeadlineDto(
    int EvaluationId,
    int EmployeeId,
    string EmployeeName,
    string TemplateTitle,
    string StageKey,
    string StageTitle,
    DateOnly? DueFrom,
    DateOnly DueTo,
    int DaysLeft,
    bool Overdue);
