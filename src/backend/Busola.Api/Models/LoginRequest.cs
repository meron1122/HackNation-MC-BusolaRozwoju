using System.ComponentModel.DataAnnotations;

namespace Busola.Api.Models;

public sealed record LoginRequest([Required] string Email, [Required] string Password);
