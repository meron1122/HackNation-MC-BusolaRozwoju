using System.ComponentModel.DataAnnotations;

namespace Busola.Api.Models;

public sealed record EmployeeRequest(
    [Required, MaxLength(100)] string FirstName,
    [Required, MaxLength(100)] string LastName,
    DateOnly DateOfBirth,
    DateOnly HireDate,
    int DepartmentId,
    int? SupervisorId = null);
