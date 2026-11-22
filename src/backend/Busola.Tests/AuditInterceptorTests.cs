using System.Security.Claims;
using System.Text.Json;
using Busola.Api.Audit;
using Busola.Api.Authorization;
using Busola.Database.Entities;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;

namespace Busola.Tests;

public sealed class AuditInterceptorTests
{
    private sealed class Account
    {
        public int Id { get; set; }
        public required string Name { get; set; }
        public string? PasswordHash { get; set; }
        public string? TokenHash { get; set; }
    }

    private sealed class TestDb(DbContextOptions<TestDb> options) : DbContext(options)
    {
        public DbSet<Account> Accounts => Set<Account>();
        public DbSet<AuditEntry> AuditEntries => Set<AuditEntry>();

        protected override void OnModelCreating(ModelBuilder b) => b.Entity<Account>().ToTable("accounts");
    }

    private static TestDb NewDb()
    {
        var http = new HttpContextAccessor
        {
            HttpContext = new DefaultHttpContext
            {
                User = new ClaimsPrincipal(new ClaimsIdentity(
                    [new Claim(BusolaClaims.UserId, "u-1"), new Claim(BusolaClaims.Email, "admin@example.pl")], "test")),
            },
        };
        var options = new DbContextOptionsBuilder<TestDb>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .AddInterceptors(new AuditInterceptor(new AuditContext(http, TimeProvider.System)))
            .Options;
        return new TestDb(options);
    }

    private static JsonElement Changes(AuditEntry entry) => JsonDocument.Parse(entry.Changes!).RootElement;

    [Fact]
    public async Task Create_logs_all_fields_with_real_id_and_masks_secrets()
    {
        await using var db = NewDb();
        var account = new Account { Name = "Jan", PasswordHash = "AQAAAAI-hash", TokenHash = "abc" };
        db.Accounts.Add(account);
        await db.SaveChangesAsync();

        var entry = Assert.Single(db.AuditEntries);
        Assert.Equal("create", entry.Action);
        Assert.Equal("accounts", entry.EntityType);
        Assert.Equal(account.Id.ToString(), entry.EntityId);
        Assert.Equal("u-1", entry.UserId);
        Assert.Equal("admin@example.pl", entry.UserEmail);
        Assert.Equal("Jan", Changes(entry).GetProperty("Name").GetProperty("new").GetString());
        Assert.Equal("***", Changes(entry).GetProperty("PasswordHash").GetProperty("new").GetString());
        Assert.Equal("***", Changes(entry).GetProperty("TokenHash").GetProperty("new").GetString());
        Assert.DoesNotContain("AQAAAAI-hash", entry.Changes);
    }

    [Fact]
    public async Task Update_logs_only_changed_fields_with_old_and_new_value()
    {
        await using var db = NewDb();
        var account = new Account { Name = "Jan", PasswordHash = "old-hash" };
        db.Accounts.Add(account);
        await db.SaveChangesAsync();

        account.Name = "Janusz";
        account.PasswordHash = "new-hash";
        await db.SaveChangesAsync();

        var entry = db.AuditEntries.AsEnumerable().Single(a => a.Action == "update");
        var changes = Changes(entry);
        Assert.Equal(["Name", "PasswordHash"], changes.EnumerateObject().Select(p => p.Name).Order());
        Assert.Equal("Jan", changes.GetProperty("Name").GetProperty("old").GetString());
        Assert.Equal("Janusz", changes.GetProperty("Name").GetProperty("new").GetString());
        Assert.Equal("***", changes.GetProperty("PasswordHash").GetProperty("old").GetString());
        Assert.DoesNotContain("hash", entry.Changes);
    }

    [Fact]
    public async Task Delete_logs_old_values()
    {
        await using var db = NewDb();
        var account = new Account { Name = "Jan" };
        db.Accounts.Add(account);
        await db.SaveChangesAsync();
        var id = account.Id.ToString();

        db.Accounts.Remove(account);
        await db.SaveChangesAsync();

        var entry = db.AuditEntries.AsEnumerable().Single(a => a.Action == "delete");
        Assert.Equal(id, entry.EntityId);
        Assert.Equal("Jan", Changes(entry).GetProperty("Name").GetProperty("old").GetString());
    }

    [Fact]
    public async Task Audit_entries_cannot_be_modified_or_deleted()
    {
        await using var db = NewDb();
        db.Accounts.Add(new Account { Name = "Jan" });
        await db.SaveChangesAsync();
        var entry = db.AuditEntries.Single();

        entry.UserEmail = "someone-else@example.pl";
        await Assert.ThrowsAsync<InvalidOperationException>(() => db.SaveChangesAsync());

        db.Entry(entry).State = EntityState.Deleted;
        await Assert.ThrowsAsync<InvalidOperationException>(() => db.SaveChangesAsync());
    }
}
