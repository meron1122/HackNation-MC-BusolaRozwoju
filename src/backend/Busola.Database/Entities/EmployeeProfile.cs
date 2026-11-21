namespace Busola.Database.Entities;

/// <summary>
/// Kartoteka pracownika w układzie jak w OrangeHRM (dane osobowe, kontakt, zatrudnienie, listy).
/// Osobna tabela 1:1, żeby zwykłe zapytania o pracowników jej nie ciągnęły. Listy są w jsonb (pokazywane tylko w profilu).
/// Imię, nazwisko, data urodzenia, data zatrudnienia, wydział i przełożony są w Employee.
/// </summary>
public class EmployeeProfile
{
    public int EmployeeId { get; set; }
    public Employee Employee { get; set; } = null!;

    // Dane osobowe
    public string? MiddleName { get; set; }
    public string? EmployeeNumber { get; set; }
    public string? OtherId { get; set; }
    public string? Gender { get; set; }
    public string? MaritalStatus { get; set; }
    public string? Nationality { get; set; }
    public string? DriverLicenseNumber { get; set; }
    public DateOnly? DriverLicenseExpiry { get; set; }

    // Kontakt
    public string? Street1 { get; set; }
    public string? Street2 { get; set; }
    public string? City { get; set; }
    public string? Province { get; set; }
    public string? PostalCode { get; set; }
    public string? Country { get; set; }
    public string? PhoneHome { get; set; }
    public string? PhoneMobile { get; set; }
    public string? PhoneWork { get; set; }
    public string? WorkEmail { get; set; }
    public string? OtherEmail { get; set; }

    // Zatrudnienie
    public string? JobTitle { get; set; }
    public string? EmploymentType { get; set; }
    public DateOnly? ContractStart { get; set; }
    public DateOnly? ContractEnd { get; set; }

    public List<EmergencyContact> EmergencyContacts { get; set; } = [];
    public List<Dependent> Dependents { get; set; } = [];
    public List<WorkExperience> WorkExperience { get; set; } = [];
    public List<Education> Education { get; set; } = [];
    public List<Skill> Skills { get; set; } = [];
    public List<LanguageSkill> Languages { get; set; } = [];
}

public class EmergencyContact
{
    public required string Name { get; set; }
    public string? Relationship { get; set; }
    public string? PhoneHome { get; set; }
    public string? PhoneMobile { get; set; }
    public string? PhoneWork { get; set; }
}

public class Dependent
{
    public required string Name { get; set; }
    public string? Relationship { get; set; }
    public DateOnly? DateOfBirth { get; set; }
}

public class WorkExperience
{
    public required string Company { get; set; }
    public string? JobTitle { get; set; }
    public DateOnly? From { get; set; }
    public DateOnly? To { get; set; }
    public string? Comment { get; set; }
}

public class Education
{
    public required string Level { get; set; }
    public string? Institution { get; set; }
    public string? Specialization { get; set; }
    public int? Year { get; set; }
}

public class Skill
{
    public required string Name { get; set; }
    public int? YearsOfExperience { get; set; }
    public string? Comment { get; set; }
}

public class LanguageSkill
{
    public required string Language { get; set; }
    public string? Level { get; set; }
}
