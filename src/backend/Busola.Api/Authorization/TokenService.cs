using Busola.Database;
using Busola.Database.Authorization;
using Busola.Database.Entities;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

namespace Busola.Api.Authorization;

public sealed class TokenService(BusolaDbContext db, UserManager<User> userManager, JwtOptions jwt)
{
    public async Task<string> CreateTokenAsync(User user, CancellationToken ct)
    {
        var roles = (await userManager.GetRolesAsync(user)).ToHashSet();

        // Nazwa do wyświetlania: imię i nazwisko pracownika, a konto bez pracownika — e-mail.
        var displayName = user.UserName!;

        if (user.EmployeeId is { } employeeId)
        {
            displayName = await db.Employees
                .Where(e => e.Id == employeeId)
                .Select(e => e.FirstName + " " + e.LastName)
                .SingleOrDefaultAsync(ct) ?? displayName;

            roles.Add(RoleNames.Employee);
            // Przełożony: ma podwładnych albo kieruje komórką organizacyjną.
            if (await db.Employees.AnyAsync(e => e.SupervisorId == employeeId, ct)
                || await db.Departments.AnyAsync(d => d.HeadId == employeeId, ct))
            {
                roles.Add(RoleNames.Supervisor);
            }
        }

        var roleList = roles.ToList();
        var permissions = await db.RolePermissions
            .Where(rp => roleList.Contains(rp.Role.Name!))
            .Select(rp => rp.Permission.Key)
            .Distinct()
            .ToArrayAsync(ct);

        var descriptor = new SecurityTokenDescriptor
        {
            Issuer = jwt.Issuer,
            Audience = jwt.Audience,
            Expires = DateTime.UtcNow.AddHours(jwt.ExpiresHours),
            SigningCredentials = new SigningCredentials(jwt.SigningKey, SecurityAlgorithms.HmacSha256),
            Claims = new Dictionary<string, object>
            {
                [BusolaClaims.UserId] = user.Id,
                [BusolaClaims.Name] = displayName,
                [BusolaClaims.Role] = roleList,
                [BusolaClaims.Permission] = permissions,
                [BusolaClaims.SecurityStamp] = user.SecurityStamp!,
            },
        };

        return new JsonWebTokenHandler().CreateToken(descriptor);
    }
}
