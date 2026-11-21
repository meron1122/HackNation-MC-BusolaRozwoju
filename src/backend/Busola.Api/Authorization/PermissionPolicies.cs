using System.Security.Claims;
using Busola.Database.Authorization;
using Microsoft.AspNetCore.Authorization;

namespace Busola.Api.Authorization;

public static class PermissionPolicies
{
    /// <summary>Jedna polityka na każde uprawnienie, nazwana jego kluczem — użycie: [Authorize(Policy = Permissions.X)].</summary>
    public static void AddPermissionPolicies(this AuthorizationOptions options)
    {
        foreach (var permission in Permissions.All)
        {
            options.AddPolicy(permission, policy => policy.RequireAssertion(ctx => ctx.User.HasPermission(permission)));
        }
    }

    public static bool HasPermission(this ClaimsPrincipal user, string permission) =>
        user.IsInRole(RoleNames.SuperAdmin) || user.HasClaim(BusolaClaims.Permission, permission);
}
