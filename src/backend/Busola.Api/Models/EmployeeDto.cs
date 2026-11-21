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
    int? SupervisorId,
    string? SupervisorName)
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
        e.SupervisorId,
        e.Supervisor != null ? e.Supervisor.FirstName + " " + e.Supervisor.LastName : null);
}
