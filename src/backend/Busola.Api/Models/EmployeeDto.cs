using System.Linq.Expressions;
using Busola.Database.Entities;

namespace Busola.Api.Models;

public sealed record EmployeeDto(
    int Id,
    string FirstName,
    string LastName,
    DateOnly DateOfBirth,
    DateOnly HireDate,
    int DepartmentId,
    string DepartmentName,
    int LocationId,
    string LocationName,
    int ServiceId,
    string ServiceName,
    string? ServiceLogoUrl,
    int? SupervisorId,
    string? SupervisorName,
    bool HasAvatar,
    string? Email,
    bool SubjectToFirstEvaluation,
    int? PositionId,
    string? PositionName)
{
    public static readonly Expression<Func<Employee, EmployeeDto>> Projection = e => new EmployeeDto(
        e.Id,
        e.FirstName,
        e.LastName,
        e.DateOfBirth,
        e.HireDate,
        e.DepartmentId,
        e.Department.Name,
        e.Department.LocationId,
        e.Department.Location.Name,
        e.Department.Location.ServiceId,
        e.Department.Location.Service.Name,
        e.Department.Location.Service.LogoUrl,
        e.SupervisorId,
        e.Supervisor != null ? e.Supervisor.FirstName + " " + e.Supervisor.LastName : null,
        e.User != null && e.User.Avatar != null,
        e.User != null ? e.User.Email : null,
        e.SubjectToFirstEvaluation,
        e.PositionId,
        e.Position != null ? e.Position.Name : null);
}
