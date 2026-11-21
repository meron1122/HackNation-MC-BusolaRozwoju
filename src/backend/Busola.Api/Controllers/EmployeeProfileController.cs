using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using Busola.Api.Authorization;
using Busola.Api.Models;
using Busola.Database;
using Busola.Database.Authorization;
using Busola.Database.Entities;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Busola.Api.Controllers;

/// <summary>
/// Profil pracownika (zakładki jak w OrangeHRM). Odczyt: read_employees w zakresie (w tym własny rekord).
/// Edycja: edit_employee w zakresie — wszystko; pracownik u siebie — wszystko poza zatrudnieniem
/// oraz imieniem, nazwiskiem i datą urodzenia (to kadry).
/// </summary>
[ApiController]
[Route("api/employees")]
public sealed class EmployeeProfileController(BusolaDbContext db, AccessScopeService access) : ControllerBase
{
    private const int MaxListItems = 50;

    public sealed record PersonalSection(
        [Required, MaxLength(100)] string FirstName,
        [Required, MaxLength(100)] string LastName,
        DateOnly DateOfBirth,
        [MaxLength(100)] string? MiddleName = null,
        [MaxLength(100)] string? EmployeeNumber = null,
        [MaxLength(100)] string? OtherId = null,
        [MaxLength(20)] string? Gender = null,
        [MaxLength(20)] string? MaritalStatus = null,
        [MaxLength(100)] string? Nationality = null,
        [MaxLength(100)] string? DriverLicenseNumber = null,
        DateOnly? DriverLicenseExpiry = null);

    public sealed record ContactSection(
        [MaxLength(200)] string? Street1 = null,
        [MaxLength(200)] string? Street2 = null,
        [MaxLength(100)] string? City = null,
        [MaxLength(100)] string? Province = null,
        [MaxLength(100)] string? PostalCode = null,
        [MaxLength(100)] string? Country = null,
        [MaxLength(100)] string? PhoneHome = null,
        [MaxLength(100)] string? PhoneMobile = null,
        [MaxLength(100)] string? PhoneWork = null,
        [EmailAddress, MaxLength(256)] string? WorkEmail = null,
        [EmailAddress, MaxLength(256)] string? OtherEmail = null);

    public sealed record JobSection(
        [MaxLength(100)] string? JobTitle = null,
        [MaxLength(100)] string? EmploymentType = null,
        DateOnly? ContractStart = null,
        DateOnly? ContractEnd = null);

    public sealed record QualificationsSection(
        [MaxLength(MaxListItems)] List<WorkExperience> WorkExperience,
        [MaxLength(MaxListItems)] List<Education> Education,
        [MaxLength(MaxListItems)] List<Skill> Skills,
        [MaxLength(MaxListItems)] List<LanguageSkill> Languages);

    public sealed record ProfileDto(
        EmployeeDto Employee,
        PersonalSection Personal,
        ContactSection Contact,
        JobSection Job,
        List<EmergencyContact> EmergencyContacts,
        List<Dependent> Dependents,
        QualificationsSection Qualifications,
        bool CanEdit,
        bool IsOwn);

    [HttpGet("me/profile")]
    public async Task<ActionResult<ProfileDto>> GetMine(CancellationToken ct) =>
        await MyEmployeeIdAsync(ct) is { } id
            ? await Get(id, ct)
            : Problem(statusCode: StatusCodes.Status404NotFound, detail: "Twoje konto nie jest powiązane z pracownikiem.");

    [HttpGet("{id:int}/profile")]
    public async Task<ActionResult<ProfileDto>> Get(int id, CancellationToken ct)
    {
        var rights = await RightsAsync(id, ct);
        if (!rights.CanRead)
        {
            return NotFound();
        }

        var employee = await db.Employees.Where(e => e.Id == id).Select(EmployeeDto.Projection).SingleAsync(ct);
        var e = await db.Employees.SingleAsync(x => x.Id == id, ct);
        var p = await db.EmployeeProfiles.AsNoTracking().SingleOrDefaultAsync(x => x.EmployeeId == id, ct) ?? new EmployeeProfile();


        return new ProfileDto(
            employee,
            new PersonalSection(e.FirstName, e.LastName, e.DateOfBirth, p.MiddleName, p.EmployeeNumber, p.OtherId, p.Gender,
                p.MaritalStatus, p.Nationality, p.DriverLicenseNumber, p.DriverLicenseExpiry),
            new ContactSection(p.Street1, p.Street2, p.City, p.Province, p.PostalCode, p.Country, p.PhoneHome, p.PhoneMobile,
                p.PhoneWork, p.WorkEmail, p.OtherEmail),
            new JobSection(p.JobTitle, p.EmploymentType, p.ContractStart, p.ContractEnd),
            p.EmergencyContacts,
            p.Dependents,
            new QualificationsSection(p.WorkExperience, p.Education, p.Skills, p.Languages),
            rights.CanEditAll,
            rights.IsOwn);
    }

    [HttpPut("{id:int}/profile/personal")]
    public Task<IActionResult> PutPersonal(int id, PersonalSection s, CancellationToken ct) =>
        SaveAsync(id, selfAllowed: true, ct, (e, p, all) =>
        {
            // Dane identyfikujące zmieniają kadry; pracownik u siebie ich nie nadpisze.
            if (all)
            {
                e.FirstName = s.FirstName;
                e.LastName = s.LastName;
                e.DateOfBirth = s.DateOfBirth;
            }

            p.MiddleName = s.MiddleName;
            p.EmployeeNumber = all ? s.EmployeeNumber : p.EmployeeNumber;
            p.OtherId = s.OtherId;
            p.Gender = s.Gender;
            p.MaritalStatus = s.MaritalStatus;
            p.Nationality = s.Nationality;
            p.DriverLicenseNumber = s.DriverLicenseNumber;
            p.DriverLicenseExpiry = s.DriverLicenseExpiry;
        });

    [HttpPut("{id:int}/profile/contact")]
    public Task<IActionResult> PutContact(int id, ContactSection s, CancellationToken ct) =>
        SaveAsync(id, selfAllowed: true, ct, (_, p, _) =>
        {
            p.Street1 = s.Street1;
            p.Street2 = s.Street2;
            p.City = s.City;
            p.Province = s.Province;
            p.PostalCode = s.PostalCode;
            p.Country = s.Country;
            p.PhoneHome = s.PhoneHome;
            p.PhoneMobile = s.PhoneMobile;
            p.PhoneWork = s.PhoneWork;
            p.WorkEmail = s.WorkEmail;
            p.OtherEmail = s.OtherEmail;
        });

    [HttpPut("{id:int}/profile/job")]
    public Task<IActionResult> PutJob(int id, JobSection s, CancellationToken ct) =>
        SaveAsync(id, selfAllowed: false, ct, (_, p, _) =>
        {
            p.JobTitle = s.JobTitle;
            p.EmploymentType = s.EmploymentType;
            p.ContractStart = s.ContractStart;
            p.ContractEnd = s.ContractEnd;
        });

    [HttpPut("{id:int}/profile/emergency-contacts")]
    public Task<IActionResult> PutEmergencyContacts(int id, [MaxLength(MaxListItems)] List<EmergencyContact> items, CancellationToken ct) =>
        SaveAsync(id, selfAllowed: true, ct, (_, p, _) => p.EmergencyContacts = items);

    [HttpPut("{id:int}/profile/dependents")]
    public Task<IActionResult> PutDependents(int id, [MaxLength(MaxListItems)] List<Dependent> items, CancellationToken ct) =>
        SaveAsync(id, selfAllowed: true, ct, (_, p, _) => p.Dependents = items);

    [HttpPut("{id:int}/profile/qualifications")]
    public Task<IActionResult> PutQualifications(int id, QualificationsSection s, CancellationToken ct) =>
        SaveAsync(id, selfAllowed: true, ct, (_, p, _) =>
        {
            p.WorkExperience = s.WorkExperience;
            p.Education = s.Education;
            p.Skills = s.Skills;
            p.Languages = s.Languages;
        });

    private async Task<IActionResult> SaveAsync(
        int id, bool selfAllowed, CancellationToken ct, Action<Employee, EmployeeProfile, bool> apply)
    {
        var rights = await RightsAsync(id, ct);
        if (!rights.CanRead)
        {
            return NotFound();
        }

        if (!rights.CanEditAll && !(selfAllowed && rights.IsOwn))
        {
            return Forbid();
        }

        var employee = await db.Employees.SingleAsync(e => e.Id == id, ct);
        var profile = await db.EmployeeProfiles.SingleOrDefaultAsync(p => p.EmployeeId == id, ct);
        if (profile is null)
        {
            profile = new EmployeeProfile { EmployeeId = id };
            db.EmployeeProfiles.Add(profile);
        }

        apply(employee, profile, rights.CanEditAll);
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    private async Task<(bool CanRead, bool CanEditAll, bool IsOwn)> RightsAsync(int id, CancellationToken ct)
    {
        var isOwn = await MyEmployeeIdAsync(ct) == id;
        var canRead = isOwn || (User.HasPermission(Permissions.ReadEmployees)
            && await db.Employees.InScope(await access.ResolveAsync(Permissions.ReadEmployees, ct)).AnyAsync(e => e.Id == id, ct));
        var canEditAll = canRead && User.HasPermission(Permissions.EditEmployee)
            && await db.Employees.InScope(await access.ResolveAsync(Permissions.EditEmployee, ct)).AnyAsync(e => e.Id == id, ct);
        return (canRead, canEditAll, isOwn);
    }

    private Task<int?> MyEmployeeIdAsync(CancellationToken ct)
    {
        var userId = User.FindFirstValue(BusolaClaims.UserId);
        return db.Users.Where(u => u.Id == userId).Select(u => u.EmployeeId).SingleOrDefaultAsync(ct);
    }
}
