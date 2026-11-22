namespace Busola.Database.Entities;

/// <summary>
/// Wpis dziennika audytu: zmiana encji (create/update/delete, z <see cref="Changes"/>) albo dostęp do API
/// (read/write, login_*, logout itd., ze <see cref="StatusCode"/>). Tylko dopisywany: aplikacja odrzuca edycję
/// i usuwanie (AuditInterceptor), a baza ma trigger blokujący UPDATE, DELETE i TRUNCATE.
/// </summary>
public class AuditEntry
{
    public long Id { get; set; }
    public DateTimeOffset At { get; set; }

    /// <summary>Null = system (seed, zadanie w tle) albo niezalogowany.</summary>
    public string? UserId { get; set; }

    /// <summary>E-mail w chwili zdarzenia; przy logowaniu — podany w formularzu, także nieudanym.</summary>
    public string? UserEmail { get; set; }

    public required string Action { get; set; }
    public string? EntityType { get; set; }
    public string? EntityId { get; set; }

    /// <summary>JSON { "Pole": { "old": …, "new": … } }; sekrety jako „***”.</summary>
    public string? Changes { get; set; }

    public string? Ip { get; set; }
    public string? UserAgent { get; set; }
    public string? Method { get; set; }
    public string? Path { get; set; }
    public int? StatusCode { get; set; }
}
