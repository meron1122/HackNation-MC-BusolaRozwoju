namespace Busola.Api.Models;

/// <summary>Hasło tymczasowe jest zwracane tylko tutaj — w bazie jest wyłącznie jego hash. EvaluationId: automatycznie założony cykl.</summary>
public sealed record CreatedEmployeeDto(EmployeeDto Employee, string Email, string TemporaryPassword, int EvaluationId, string EvaluationTitle);
