namespace Busola.Database.Entities;

public enum SignatureStatus
{
    Pending = 0,
    Signed = 1,
    Declined = 2,
}

/// <summary>
/// Prośba o podpis odręczny: zlecający tworzy ją w systemie, sygnatariusz podpisuje przez link (telefon, ekran dotykowy).
/// Link to sekret: w bazie jest tylko hash tokenu. Podpis (PNG) trzymamy w bazie, bo dysk na Renderze jest ulotny.
/// </summary>
public class SignatureRequest
{
    public Guid Id { get; set; }
    public required string Title { get; set; }
    public required string SignerName { get; set; }

    public required string CreatedByUserId { get; set; }
    public User CreatedBy { get; set; } = null!;
    public DateTimeOffset CreatedAt { get; set; }

    public required string TokenHash { get; set; }
    public DateTimeOffset LinkExpiresAt { get; set; }

    /// <summary>
    /// Opcjonalnie: pole podpisu w ocenie. Po podpisaniu obraz trafia do evaluation_signatures
    /// (konto potwierdzające = zlecający, czyli osoba, która zebrała podpis w systemie).
    /// </summary>
    public int? EvaluationId { get; set; }
    public Evaluation? Evaluation { get; set; }
    public string? EvaluationFieldKey { get; set; }
    public SignatureRole? EvaluationRole { get; set; }

    public SignatureStatus Status { get; set; }
    public DateTimeOffset? CompletedAt { get; set; }
    public byte[]? Image { get; set; }
    public string? SignerIp { get; set; }
    public string? SignerUserAgent { get; set; }
}
