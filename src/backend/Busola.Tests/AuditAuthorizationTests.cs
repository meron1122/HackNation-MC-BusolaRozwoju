using System.Reflection;
using System.Security.Claims;
using Busola.Api.Authorization;
using Busola.Api.Controllers;
using Busola.Database;
using Busola.Database.Authorization;
using Busola.Database.Entities;
using Microsoft.AspNetCore.Authorization;
using Microsoft.Extensions.DependencyInjection;

namespace Busola.Tests;

public sealed class AuditAuthorizationTests
{
    private static readonly IAuthorizationService Authorization = new ServiceCollection()
        .AddLogging()
        .AddAuthorization(o => o.AddPermissionPolicies())
        .BuildServiceProvider()
        .GetRequiredService<IAuthorizationService>();

    private static ClaimsPrincipal Principal(params Claim[] claims) =>
        new(new ClaimsIdentity(claims, "test", BusolaClaims.Name, BusolaClaims.Role));

    [Fact]
    public void Controller_requires_audit_permission()
    {
        var attribute = typeof(AuditController).GetCustomAttribute<AuthorizeAttribute>();
        Assert.Equal(Permissions.ReadAuditLog, attribute?.Policy);
        Assert.Null(typeof(AuditController).GetCustomAttribute<AllowAnonymousAttribute>());
    }

    [Theory]
    [InlineData(RoleNames.SuperAdmin, null, true)]
    [InlineData(null, Permissions.ReadAuditLog, true)]
    [InlineData(RoleNames.ServiceAdmin, Permissions.ManageUsers, false)]
    [InlineData(RoleNames.Hr, Permissions.ReadEmployees, false)]
    public async Task Policy_admits_only_holders_of_the_permission(string? role, string? permission, bool allowed)
    {
        var claims = new List<Claim>();
        if (role is not null) claims.Add(new Claim(BusolaClaims.Role, role));
        if (permission is not null) claims.Add(new Claim(BusolaClaims.Permission, permission));

        var result = await Authorization.AuthorizeAsync(Principal([.. claims]), Permissions.ReadAuditLog);

        Assert.Equal(allowed, result.Succeeded);
    }

    [Fact]
    public void Seed_does_not_grant_audit_log_to_any_role()
    {
        // SuperAdmin ma wszystko z urzędu; ServiceAdmin dostaje resztę, ale nie dziennik obejmujący wszystkie służby.
        var seed = typeof(BusolaDbContext).Assembly.GetType("Busola.Database.Authorization.PermissionSeed")!;
        var permissions = (Permission[])seed.GetField("Permissions")!.GetValue(null)!;
        var grants = (RolePermission[])seed.GetField("RolePermissions")!.GetValue(null)!;

        var auditId = permissions.Single(p => p.Key == Permissions.ReadAuditLog).Id;
        Assert.DoesNotContain(grants, g => g.PermissionId == auditId);
    }
}
