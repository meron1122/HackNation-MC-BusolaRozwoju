using System.Runtime.CompilerServices;
using System.Text.Json;
using Busola.Database.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Diagnostics;

namespace Busola.Api.Audit;

/// <summary>
/// Każdy SaveChanges dopisuje do dziennika audytu, co się zmieniło (create/update/delete, stare i nowe wartości pól).
/// Wpisy idą drugim SaveChanges zaraz po pierwszym, bo id nowych wierszy znamy dopiero po zapisie.
/// shortcut: zmiana i wpis audytu nie są w jednej transakcji (chyba że wywołujący ją otworzył); gdyby trzeba było
/// gwarancji „bez wpisu nie ma zmiany”, otwórz transakcję w SavingChanges i zatwierdź w SavedChanges.
/// Nie widzi ExecuteUpdate/ExecuteDelete — usuwanie głównych encji idzie więc przez Remove + SaveChanges.
/// </summary>
public sealed class AuditInterceptor(AuditContext audit) : SaveChangesInterceptor
{
    private const string Masked = "***";
    private const int MaxTextLength = 500;

    // Nie audytujemy samego dziennika ani indeksu wiedzy asystenta (wektory, odtwarzane automatycznie).
    private static readonly HashSet<Type> Skipped = [typeof(AuditEntry), typeof(KnowledgeEmbedding)];

    private readonly ConditionalWeakTable<DbContext, List<Pending>> pending = new();

    /// <summary>Dla „create” Changes i EntityId są null: id (i inne wartości z bazy) znamy dopiero po zapisie.</summary>
    private sealed record Pending(EntityEntry Entry, string Action, string? EntityId, Dictionary<string, object>? Changes);

    public override InterceptionResult<int> SavingChanges(DbContextEventData eventData, InterceptionResult<int> result)
    {
        Collect(eventData.Context);
        return result;
    }

    public override ValueTask<InterceptionResult<int>> SavingChangesAsync(
        DbContextEventData eventData, InterceptionResult<int> result, CancellationToken cancellationToken = default)
    {
        Collect(eventData.Context);
        return ValueTask.FromResult(result);
    }

    public override int SavedChanges(SaveChangesCompletedEventData eventData, int result)
    {
        if (TakeEntries(eventData.Context) is { } context)
        {
            context.SaveChanges();
        }

        return result;
    }

    public override async ValueTask<int> SavedChangesAsync(
        SaveChangesCompletedEventData eventData, int result, CancellationToken cancellationToken = default)
    {
        if (TakeEntries(eventData.Context) is { } context)
        {
            // Bez tokenu żądania: przerwane połączenie nie może zgubić wpisu o zapisanej już zmianie.
            await context.SaveChangesAsync(CancellationToken.None);
        }

        return result;
    }

    public override void SaveChangesFailed(DbContextErrorEventData eventData) => Forget(eventData.Context);

    public override Task SaveChangesFailedAsync(DbContextErrorEventData eventData, CancellationToken cancellationToken = default)
    {
        Forget(eventData.Context);
        return Task.CompletedTask;
    }

    private void Collect(DbContext? context)
    {
        if (context is null)
        {
            return;
        }

        var entries = context.ChangeTracker.Entries().ToList();
        if (entries.Any(e => e.Entity is AuditEntry && e.State is EntityState.Modified or EntityState.Deleted))
        {
            throw new InvalidOperationException("Dziennik audytu jest tylko do dopisywania.");
        }

        var list = new List<Pending>();
        foreach (var entry in entries)
        {
            if (Skipped.Contains(entry.Metadata.ClrType))
            {
                continue;
            }

            var (action, changes) = entry.State switch
            {
                EntityState.Added => ("create", null),
                EntityState.Deleted => ("delete", entry.Properties.ToDictionary(p => p.Metadata.Name, p => Change(entry, p, p.OriginalValue, null))),
                EntityState.Modified => ("update", entry.Properties
                    .Where(p => p.IsModified && !Equals(p.OriginalValue, p.CurrentValue))
                    .ToDictionary(p => p.Metadata.Name, p => Change(entry, p, p.OriginalValue, p.CurrentValue))),
                _ => (null, null),
            };

            if (action == "create" || changes?.Count > 0)
            {
                list.Add(new Pending(entry, action!, action == "create" ? null : KeyOf(entry), changes));
            }
        }

        pending.AddOrUpdate(context, list);
    }

    /// <summary>Dodaje zebrane wpisy do kontekstu; zwraca go, gdy jest co zapisać.</summary>
    private DbContext? TakeEntries(DbContext? context)
    {
        if (context is null || !pending.TryGetValue(context, out var list))
        {
            return null;
        }

        pending.Remove(context);
        if (list.Count == 0)
        {
            return null;
        }

        foreach (var p in list)
        {
            context.Add(audit.Entry(
                p.Action,
                EntityTypeOf(p.Entry),
                p.EntityId ?? KeyOf(p.Entry),
                JsonSerializer.Serialize(p.Changes ?? p.Entry.Properties.ToDictionary(
                    x => x.Metadata.Name, x => Change(p.Entry, x, null, x.CurrentValue)))));
        }

        return context;
    }

    private void Forget(DbContext? context)
    {
        if (context is not null)
        {
            pending.Remove(context);
        }
    }

    private static object Change(EntityEntry entry, PropertyEntry property, object? oldValue, object? newValue) =>
        IsSecret(entry, property.Metadata.Name)
            ? new { old = oldValue is null ? null : Masked, @new = newValue is null ? null : Masked }
            : new { old = Printable(oldValue), @new = Printable(newValue) };

    /// <summary>Hasła, stempel bezpieczeństwa, tokeny (też hash tokenu linku podpisu) i klucze 2FA (user_tokens.value).</summary>
    public static bool IsSecret(EntityEntry entry, string propertyName) =>
        propertyName is "PasswordHash" or "SecurityStamp"
        || propertyName.Contains("Token", StringComparison.OrdinalIgnoreCase)
        || propertyName.Contains("Secret", StringComparison.OrdinalIgnoreCase)
        || (entry.Metadata.GetTableName() == "user_tokens" && propertyName == "Value");

    private static object? Printable(object? value) => value switch
    {
        null => null,
        byte[] bytes => $"<{bytes.Length} B>",
        Enum e => e.ToString(),
        string s when s.Length > MaxTextLength => $"{s[..MaxTextLength]}… ({s.Length} znaków)",
        _ => value,
    };

    private static string EntityTypeOf(EntityEntry entry)
    {
        var table = entry.Metadata.GetTableName() ?? entry.Metadata.ShortName();
        return entry.Metadata.IsOwned() ? $"{table}.{entry.Metadata.ShortName()}" : table;
    }

    private static string KeyOf(EntityEntry entry) =>
        string.Join(",", entry.Metadata.FindPrimaryKey()!.Properties.Select(p => entry.Property(p.Name).CurrentValue));
}
