using System.ComponentModel.DataAnnotations;

namespace Busola.Api.Models;

/// <summary>
/// Email jest wymagany przy zakładaniu (z nim powstaje konto pracownika), przy edycji jest ignorowany.
/// PositionId: stanowisko ze słownika służby wydziału pracownika (/api/positions); null = brak.
/// </summary>
public sealed record EmployeeRequest(
    [Required, MaxLength(100)] string FirstName,
    [Required, MaxLength(100)] string LastName,
    DateOnly DateOfBirth,
    DateOnly HireDate,
    int DepartmentId,
    int? SupervisorId = null,
    [EmailAddress, MaxLength(256)] string? Email = null,
    bool SubjectToFirstEvaluation = false,
    int? PositionId = null);
