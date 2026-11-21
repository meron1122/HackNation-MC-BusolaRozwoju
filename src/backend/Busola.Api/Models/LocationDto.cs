using System.Linq.Expressions;
using Busola.Database.Entities;

namespace Busola.Api.Models;

public sealed record LocationDto(int Id, string Name, int ServiceId, string ServiceName, string? ServiceLogoUrl)
{
    public static readonly Expression<Func<Location, LocationDto>> Projection =
        l => new LocationDto(l.Id, l.Name, l.ServiceId, l.Service.Name, l.Service.LogoUrl);
}
