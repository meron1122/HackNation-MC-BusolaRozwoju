using System.Linq.Expressions;
using Busola.Database.Entities;

namespace Busola.Api.Models;

public sealed record DepartmentDto(int Id, string Name, int LocationId, string LocationName, int ServiceId)
{
    public static readonly Expression<Func<Department, DepartmentDto>> Projection =
        d => new DepartmentDto(d.Id, d.Name, d.LocationId, d.Location.Name, d.Location.ServiceId);
}
