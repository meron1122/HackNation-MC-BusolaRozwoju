namespace Busola.Api.Models;

public sealed record AccountDto(
    string Id,
    string Email,
    int? EmployeeId,
    string? EmployeeName,
    bool HasAvatar,
    bool TwoFactorEnabled,
    int RecoveryCodesLeft);
