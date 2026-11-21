using System.ComponentModel.DataAnnotations;

namespace Busola.Api.Models;

public sealed record LocationRequest([Required, MaxLength(200)] string Name, int ServiceId);
