using System.Linq.Expressions;
using Busola.Database.Entities;

namespace Busola.Api.Models;

/// <summary>HeadId/HeadName: kierujący komórką organizacyjną (opcjonalny).</summary>
public sealed record DepartmentDto(int Id, string Name, int LocationId, string LocationName, int ServiceId, int? HeadId, string? HeadName)
{
    public static readonly Expression<Func<Department, DepartmentDto>> Projection =
        d => new DepartmentDto(d.Id, d.Name, d.LocationId, d.Location.Name, d.Location.ServiceId,
            d.HeadId, d.Head != null ? d.Head.FirstName + " " + d.Head.LastName : null);
}
