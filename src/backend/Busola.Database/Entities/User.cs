using Microsoft.AspNetCore.Identity;

namespace Busola.Database.Entities;

/// <summary>
/// Konto w systemie. Role Pracownik i Przełożony nie są zapisywane — wynikają z powiązanego pracownika
/// (ma rekord / ma podwładnych). Pozostałe role przypisuje się normalnie przez Identity.
/// </summary>
public class User : IdentityUser
{
    public int? EmployeeId { get; set; }
    public Employee? Employee { get; set; }

    public UserAvatar? Avatar { get; set; }
}
