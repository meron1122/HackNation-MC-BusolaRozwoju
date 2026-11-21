using System.ComponentModel.DataAnnotations;

namespace Busola.Api.Models;

/// <summary>Potwierdzenie hasłem przed operacją, która osłabia zabezpieczenia konta.</summary>
public sealed record PasswordRequest([Required] string Password);
