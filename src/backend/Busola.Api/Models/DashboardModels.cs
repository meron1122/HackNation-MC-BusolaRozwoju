namespace Busola.Api.Models;

/// <summary>Etap w toku oceny na pulpitach: faza, termin, ile dni zostało, czy po terminie, ostatnie przypomnienie HR.</summary>
public sealed record EvaluationProgressDto(
    int EvaluationId,
    string TemplateCode,
    string Kind,
    string Phase,
    bool Started,
    bool IsFinal,
    string? StageKey,
    string? StageTitle,
    DateOnly? DueFrom,
    DateOnly? DueTo,
    int? DaysLeft,
    bool Overdue,
    LastReminderDto? LastReminder);

public sealed record LastReminderDto(DateTimeOffset SentAt, string SentByName, string? Message);

/// <summary>
/// NeedsAttention: po terminie, termin w ciągu `days` dni albo etap bez terminu, który trzeba zrobić niezwłocznie
/// (zapoznanie z oceną — § 12 ust. 1 / § 11 ust. 1). Evaluation = otwarta ocena, a gdy jej brak — ostatnia.
/// </summary>
public sealed record TeamMemberDto(int EmployeeId, string FirstName, string LastName, bool NeedsAttention, EvaluationProgressDto? Evaluation, string? PositionName = null);

public sealed record TeamDashboardDto(string? DepartmentName, int Count, IReadOnlyList<TeamMemberDto> Members);

public sealed record HrCountersDto(int Overdue, int DueIn7Days, int InProgress, int ClosedInYear, int Year);

/// <summary>AtRisk: po terminie albo termin w ciągu 7 dni (filtr „tylko zagrożone”).</summary>
public sealed record HrEvaluationRowDto(
    int EmployeeId,
    string EmployeeName,
    string? EvaluatorName,
    int DepartmentId,
    string DepartmentName,
    bool AtRisk,
    EvaluationProgressDto Evaluation);

public sealed record HrDashboardDto(HrCountersDto Counters, IReadOnlyList<HrEvaluationRowDto> Rows);

public sealed record DepartmentHeadRequest(int? EmployeeId = null);
