namespace Busola.Api.Models;

/// <summary>Hasło tymczasowe jest zwracane tylko tutaj — w bazie jest wyłącznie jego hash.</summary>
public sealed record CreatedEmployeeDto(EmployeeDto Employee, string Email, string TemporaryPassword);
