namespace Busola.Database.Entities;

/// <summary>Potwierdzenie (podpis) z pola typu „signature” w szablonie. Osobno od wartości, bo to ślad audytowy.</summary>
public class EvaluationSignature
{
    public int Id { get; set; }

    public int EvaluationId { get; set; }
    public Evaluation Evaluation { get; set; } = null!;

    /// <summary>Klucz pola podpisu ze szablonu, np. initialInterviewSupervisorSignature.</summary>
    public required string FieldKey { get; set; }

    public SignatureRole Role { get; set; }

    /// <summary>Konto, które potwierdziło w systemie.</summary>
    public required string SignedById { get; set; }
    public User SignedBy { get; set; } = null!;

    /// <summary>„Imię i nazwisko lub pieczątka” — kopia z chwili podpisu.</summary>
    public required string SignerName { get; set; }

    public DateOnly SignedOn { get; set; }

    /// <summary>Miejscowość.</summary>
    public string? Place { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    /// <summary>
    /// Opcjonalny obraz podpisu (np. złożonego na tablecie); brak = samo potwierdzenie w systemie.
    /// Przy listach podpisów projektuj kolumny bez Image*, żeby nie ciągnąć bajtów.
    /// </summary>
    public byte[]? ImageContent { get; set; }

    /// <summary>Tylko PNG albo WebP — bez SVG, który może zawierać skrypt.</summary>
    public string? ImageContentType { get; set; }

    /// <summary>SHA-256 obrazu liczony przy zapisie — pozwala wykryć późniejszą podmianę.</summary>
    public byte[]? ImageSha256 { get; set; }
}
