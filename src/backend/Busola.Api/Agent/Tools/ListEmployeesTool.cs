using System.Text.Json;
using Busola.Api.Authorization;
using Busola.Api.Models;
using Busola.Database;
using Busola.Database.Authorization;
using Microsoft.EntityFrameworkCore;

namespace Busola.Api.Agent.Tools;

/// <summary>Wzór narzędzia na danych: uprawnienie + zakres jak w EmployeesController, więc agent widzi to samo co użytkownik.</summary>
public sealed class ListEmployeesTool(BusolaDbContext db, AccessScopeService access) : IAgentTool
{
    private const int Limit = 50;

    public string Name => "list_employees";

    public string Description =>
        $"Lista pracowników widocznych dla użytkownika (np. jego podwładnych), z wydziałem, służbą i przełożonym. Maks. {Limit} wyników.";

    public string Parameters => """
        {
          "type": "object",
          "properties": { "name": { "type": "string", "description": "Opcjonalny fragment imienia lub nazwiska" } }
        }
        """;

    public string? RequiredPermission => Permissions.ReadEmployees;

    public async Task<string> ExecuteAsync(JsonElement arguments, CancellationToken ct)
    {
        var scope = await access.ResolveAsync(Permissions.ReadEmployees, ct);
        var query = db.Employees.InScope(scope);

        if (arguments.TryGetProperty("name", out var n) && n.GetString() is { Length: > 0 } name)
        {
            var pattern = $"%{name}%";
            query = query.Where(e => EF.Functions.ILike(e.FirstName, pattern) || EF.Functions.ILike(e.LastName, pattern));
        }

        var employees = await query
            .OrderBy(e => e.LastName).ThenBy(e => e.FirstName)
            .Take(Limit)
            .Select(EmployeeDto.Projection)
            .ToListAsync(ct);

        return JsonSerializer.Serialize(employees);
    }
}
