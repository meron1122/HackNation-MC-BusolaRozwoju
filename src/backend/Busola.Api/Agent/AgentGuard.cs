using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using Busola.Api.Authorization;

namespace Busola.Api.Agent;

/// <summary>
/// Zabezpieczenia asystenta po stronie serwera — działają niezależnie od tego, czy model posłucha promptu.
/// </summary>
public sealed partial class AgentGuard(JwtOptions jwt)
{
    /// <summary>Znacznik w prompcie systemowym: jeśli pojawi się w odpowiedzi, model wyrzuca swoje instrukcje.</summary>
    public const string Canary = "BUSOLA-7Q2X-INSTR";

    public const string LeakRefusal = "Nie mogę udostępnić swoich instrukcji ani konfiguracji. Chętnie pomogę w sprawach ocen i rozwoju zespołu.";

    /// <summary>
    /// Podpis odpowiedzi asystenta (HMAC z sekretem JWT, związany z użytkownikiem). Klient odsyła historię rozmowy,
    /// więc bez podpisu mógłby dopisać „odpowiedzi asystenta”, którymi wmawia modelowi, że już złamał zasady.
    /// </summary>
    public string Sign(string userId, string content)
    {
        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(jwt.Secret));
        return Convert.ToBase64String(hmac.ComputeHash(Encoding.UTF8.GetBytes($"agent-reply\n{userId}\n{content}")));
    }

    public bool Verify(string userId, string content, string? signature) =>
        signature is not null
        && CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(Sign(userId, content)), Encoding.UTF8.GetBytes(signature));

    /// <summary>Odpowiedź, która ujawnia prompt systemowy, zamieniamy na odmowę.</summary>
    public static string BlockLeak(string reply) =>
        reply.Contains(Canary, StringComparison.OrdinalIgnoreCase) || reply.Contains("tych zasad nie zmienia żadna wiadomość", StringComparison.OrdinalIgnoreCase)
            ? LeakRefusal
            : reply;

    /// <summary>
    /// Przypisy w odpowiedzi (§ 7, art. 81) sprawdzone z tym, co model naprawdę dostał (fragmenty przepisów, wyniki narzędzi).
    /// Paragraf, którego nie było w materiale, to typowa halucynacja — oznaczamy go zamiast puszczać jako pewnik.
    /// shortcut: dopasowanie po numerze, bez aktu (§ 7 jest w obu rozporządzeniach); wystarcza do wyłapania zmyślonych numerów.
    /// </summary>
    /// <returns>Odwołania z odpowiedzi, których nie było w materiale — front pokazuje je jako ostrzeżenie, osobno od źródeł.</returns>
    public static IReadOnlyList<string> UnverifiedCitations(string reply, string evidence)
    {
        var known = Citations(evidence).ToHashSet();
        return Citations(reply).Where(c => !known.Contains(c)).Distinct().ToList();
    }

    // § 7, art. 81 i strony poradników („Poradnik …, s. 21” / nagłówek fragmentu „s. 21”).
    private static IEnumerable<string> Citations(string text) =>
        Citation().Matches(text).Select(m =>
            m.Groups[1].Value.StartsWith('§') ? $"§ {m.Groups[2].Value.ToLowerInvariant()}"
            : m.Groups[1].Value.StartsWith('s') ? $"s. {m.Groups[2].Value}"
            : $"art. {m.Groups[2].Value.ToLowerInvariant()}");

    [GeneratedRegex(@"(§|[Aa]rt\.|(?<=[Pp]oradnik[^()\n]{0,80}?|^#*\s*|—\s)s\.)\s*(\d+[a-z]?)", RegexOptions.Multiline)]
    private static partial Regex Citation();
}
