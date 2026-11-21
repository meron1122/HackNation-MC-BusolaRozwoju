using System.ComponentModel.DataAnnotations;

namespace Busola.Api.Models;

public sealed record CreateUserRequest(
    [Required, EmailAddress] string Email,
    [Required] string Password,
    IReadOnlyList<string> Roles,
    int? EmployeeId = null);
