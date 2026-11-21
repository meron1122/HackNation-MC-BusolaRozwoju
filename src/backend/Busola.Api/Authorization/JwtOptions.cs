using System.Text;
using Microsoft.IdentityModel.Tokens;

namespace Busola.Api.Authorization;

public sealed class JwtOptions
{
    public const string SectionName = "Jwt";

    public string Issuer { get; init; } = "";
    public string Audience { get; init; } = "";
    public string Secret { get; init; } = "";
    public int ExpiresHours { get; init; } = 12;

    public SymmetricSecurityKey SigningKey => new(Encoding.UTF8.GetBytes(Secret));

    public static JwtOptions Load(IConfiguration configuration)
    {
        var options = configuration.GetSection(SectionName).Get<JwtOptions>() ?? new JwtOptions();

        // HS256 wymaga klucza min. 256 bitów.
        if (string.IsNullOrWhiteSpace(options.Issuer) || string.IsNullOrWhiteSpace(options.Audience)
            || Encoding.UTF8.GetByteCount(options.Secret) < 32)
        {
            throw new InvalidOperationException(
                $"Brak konfiguracji {SectionName}: Issuer, Audience i Secret (min. 32 znaki). " +
                $"Secret ustaw przez user secrets albo zmienną środowiskową {SectionName}__Secret.");
        }

        return options;
    }
}
