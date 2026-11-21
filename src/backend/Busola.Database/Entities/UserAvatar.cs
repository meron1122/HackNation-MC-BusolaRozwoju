namespace Busola.Database.Entities;

/// <summary>
/// Avatar w bazie, nie na dysku — kontener na Renderze ma ulotny system plików.
/// Osobna tabela, żeby zwykłe zapytania o konta nie ciągnęły bajtów obrazu.
/// </summary>
public class UserAvatar
{
    public required string UserId { get; set; }
    public User User { get; set; } = null!;

    public required byte[] Content { get; set; }
    public required string ContentType { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}
