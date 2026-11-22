using System.ComponentModel.DataAnnotations;

namespace Busola.Api.Models;

/// <summary>Stanowisko ze słownika urzędu; EmployeesCount — ilu pracowników je ma (usunąć można tylko nieużywane).</summary>
public sealed record PositionDto(int Id, string Name, int ServiceId, string ServiceName, int EmployeesCount);

/// <summary>ServiceId puste = służba użytkownika (HR); SuperAdmin musi ją wskazać.</summary>
public sealed record PositionRequest([Required, MaxLength(200)] string Name, int? ServiceId = null);
