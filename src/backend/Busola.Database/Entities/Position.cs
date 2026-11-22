namespace Busola.Database.Entities;

/// <summary>
/// Stanowisko pracy ze słownika urzędu (służby). Pracownik ma jedno stanowisko; HR wybiera je z listy,
/// a arkusz oceny bierze stąd „Stanowisko pracy” (dane ocenianego, oceniającego, kierującego).
/// </summary>
public class Position
{
    public int Id { get; set; }
    public required string Name { get; set; }

    public int ServiceId { get; set; }
    public Service Service { get; set; } = null!;

    public ICollection<Employee> Employees { get; set; } = [];
}
