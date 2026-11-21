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
    DateOnly? NextDueTo);

/// <summary>StartDate domyślnie: przy pierwszej ocenie data zatrudnienia, przy okresowej — dziś.</summary>
public sealed record CreateEvaluationRequest(int EmployeeId, string TemplateCode, DateOnly? StartDate = null);

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
    bool IsOwn);

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
