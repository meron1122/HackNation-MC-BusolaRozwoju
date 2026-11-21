using Busola.Database.Entities;

namespace Busola.Api.Authorization;

/// <summary>Struktura organizacyjna jest widoczna w zakresie Service albo All — Own/Subordinates jej nie obejmują.</summary>
public static class ScopeQueryExtensions
{
    public static IQueryable<Employee> InScope(this IQueryable<Employee> query, AccessScope scope)
    {
        if (scope.All)
        {
            return query;
        }

        var ownId = scope.OwnEmployeeId;
        var serviceId = scope.ServiceId;
        var subordinateIds = scope.SubordinateIds;

        return query.Where(e =>
            e.Id == ownId
            || e.Department.Location.ServiceId == serviceId
            || subordinateIds.Contains(e.Id));
    }

    public static IQueryable<Location> InScope(this IQueryable<Location> query, AccessScope scope) =>
        scope.All ? query : query.Where(l => l.ServiceId == scope.ServiceId);

    public static IQueryable<Department> InScope(this IQueryable<Department> query, AccessScope scope) =>
        scope.All ? query : query.Where(d => d.Location.ServiceId == scope.ServiceId);
}
