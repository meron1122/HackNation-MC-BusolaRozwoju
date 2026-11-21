using System.ComponentModel.DataAnnotations;

namespace Busola.Api.Models;

public sealed record ChangePasswordRequest([Required] string CurrentPassword, [Required] string NewPassword);
