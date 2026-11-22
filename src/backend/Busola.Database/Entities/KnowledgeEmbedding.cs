namespace Busola.Database.Entities;

/// <summary>
/// Wektor fragmentu bazy wiedzy agenta (przepisy, Q&amp;A). Treść fragmentów żyje w plikach Agent/Knowledge,
/// tu jest tylko cache embeddingów: klucz = skrót treści fragmentu + model, więc zmiana pliku albo modelu
/// liczy wektory tylko dla zmienionych fragmentów.
/// </summary>
public class KnowledgeEmbedding
{
    public required string Hash { get; set; }

    public required string Model { get; set; }

    public required float[] Vector { get; set; }
}
