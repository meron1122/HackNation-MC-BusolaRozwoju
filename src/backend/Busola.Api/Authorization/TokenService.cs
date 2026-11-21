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

        if (user.EmployeeId is { } employeeId)
        {
            roles.Add(RoleNames.Employee);
            if (await db.Employees.AnyAsync(e => e.SupervisorId == employeeId, ct))
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
                [BusolaClaims.Name] = user.UserName!,
                [BusolaClaims.Role] = roleList,
                [BusolaClaims.Permission] = permissions,
                [BusolaClaims.SecurityStamp] = user.SecurityStamp!,
            },
        };

        return new JsonWebTokenHandler().CreateToken(descriptor);
    }
}
