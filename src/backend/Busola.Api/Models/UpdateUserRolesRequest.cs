namespace Busola.Api.Models;

public sealed record UpdateUserRolesRequest(IReadOnlyList<string> Roles);
