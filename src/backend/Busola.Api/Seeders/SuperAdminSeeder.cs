using Busola.Database.Authorization;
using Busola.Database.Entities;
using Microsoft.AspNetCore.Identity;

namespace Busola.Api.Seeders;

/// <summary>Zakłada pierwsze konto SuperAdmin, jeśli w konfiguracji jest Seed:SuperAdmin i konta jeszcze nie ma.</summary>
public static class SuperAdminSeeder
{
    public static async Task SeedAsync(IServiceProvider services, IConfiguration configuration)
    {
        var email = configuration["Seed:SuperAdmin:Email"];
        var password = configuration["Seed:SuperAdmin:Password"];
        if (string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(password))
        {
            return;
        }

        await using var scope = services.CreateAsyncScope();
        var userManager = scope.ServiceProvider.GetRequiredService<UserManager<User>>();
        if (await userManager.FindByEmailAsync(email) is not null)
        {
            return;
        }

        var user = new User { UserName = email, Email = email };
        var result = await userManager.CreateAsync(user, password);
        if (result.Succeeded)
        {
            result = await userManager.AddToRoleAsync(user, RoleNames.SuperAdmin);
        }

        if (!result.Succeeded)
        {
            throw new InvalidOperationException(
                "Nie udało się utworzyć konta SuperAdmin: " + string.Join("; ", result.Errors.Select(e => e.Description)));
        }
    }
}
