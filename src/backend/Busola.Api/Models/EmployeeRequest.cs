using System.ComponentModel.DataAnnotations;

namespace Busola.Api.Models;

/// <summary>Email jest wymagany przy zakładaniu (z nim powstaje konto pracownika), przy edycji jest ignorowany.</summary>
public sealed record EmployeeRequest(
    [Required, MaxLength(100)] string FirstName,
    [Required, MaxLength(100)] string LastName,
    DateOnly DateOfBirth,
    DateOnly HireDate,
    int DepartmentId,
    int? SupervisorId = null,
    [EmailAddress, MaxLength(256)] string? Email = null);
