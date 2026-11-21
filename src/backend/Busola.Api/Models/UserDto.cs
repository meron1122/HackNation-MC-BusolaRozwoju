namespace Busola.Api.Models;

/// <summary>Roles to tylko role przypisane ręcznie — Employee/Supervisor wynikają z danych.</summary>
public sealed record UserDto(string Id, string Email, int? EmployeeId, IReadOnlyList<string> Roles, bool TwoFactorEnabled);
