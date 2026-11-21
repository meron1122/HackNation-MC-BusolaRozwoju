using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Busola.Database;

/// <summary>Używane tylko przez dotnet-ef (migrations add / database update).</summary>
public class DesignTimeDbContextFactory : IDesignTimeDbContextFactory<BusolaDbContext>
{
    public BusolaDbContext CreateDbContext(string[] args)
    {
        var connectionString = Environment.GetEnvironmentVariable("BUSOLA_CONNECTION_STRING")
            ?? "Host=localhost;Port=5432;Database=busola;Username=postgres;Password=postgres";

        var options = new DbContextOptionsBuilder<BusolaDbContext>()
            .UseNpgsql(connectionString)
            .Options;

        return new BusolaDbContext(options);
    }
}
