using System.ComponentModel.DataAnnotations;

namespace Busola.Api.Models;

public sealed record TwoFactorCodeRequest([Required] string Code);
