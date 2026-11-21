using System.ComponentModel.DataAnnotations;

namespace Busola.Api.Models;

public sealed record DepartmentRequest([Required, MaxLength(200)] string Name, int LocationId);
