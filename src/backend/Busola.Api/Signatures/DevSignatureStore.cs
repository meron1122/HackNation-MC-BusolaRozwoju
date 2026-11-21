using System.Buffers.Text;
using System.Collections.Concurrent;
using System.Security.Cryptography;
using Busola.Database.Entities;

namespace Busola.Api.Signatures;

/// <summary>
/// Piaskownica podpisów dla zakładki Dev (SuperAdmin): ten sam flow co prawdziwe prośby, ale tylko w pamięci procesu.
/// Nic nie trafia do bazy; wpisy znikają po godzinie albo po restarcie. Przy wielu instancjach każda ma własną pamięć.
/// </summary>
public sealed class DevSignatureStore(TimeProvider clock)
{
    private static readonly TimeSpan Lifetime = TimeSpan.FromHours(1);
    private const int MaxEntries = 200;

    private readonly ConcurrentDictionary<Guid, Entry> entries = new();

    public (SignatureRequestDto Request, string Token) Create(string title, string signerName)
    {
        Prune();
        if (entries.Count >= MaxEntries)
        {
            throw new InvalidOperationException("Za dużo testowych próśb naraz. Spróbuj za chwilę.");
        }

        var now = clock.GetUtcNow();
        var entry = new Entry(Guid.NewGuid(), title, signerName, Base64Url.EncodeToString(RandomNumberGenerator.GetBytes(32)), now, now + Lifetime);
        entries[entry.Id] = entry;
        return (ToDto(entry), entry.Token);
    }

    public Entry? Get(Guid id) => entries.TryGetValue(id, out var e) && !Expired(e) ? e : null;

    public Entry? FindByToken(string token) =>
        entries.Values.FirstOrDefault(e => !Expired(e) && CryptographicOperations.FixedTimeEquals(
            System.Text.Encoding.UTF8.GetBytes(e.Token), System.Text.Encoding.UTF8.GetBytes(token)));

    public SignResult Sign(string token, string pngDataUrl, string? userAgent)
    {
        var entry = FindByToken(token);
        if (entry is null)
        {
            return SignResult.NotFound;
        }

        var image = SignatureService.NormalizePng(pngDataUrl);
        if (image is null)
        {
            return SignResult.InvalidImage;
        }

        lock (entry)
        {
            if (entry.Status != SignatureStatus.Pending)
            {
                return SignResult.NotPending;
            }

            entry.Status = SignatureStatus.Signed;
            entry.CompletedAt = clock.GetUtcNow();
            entry.Image = image;
            entry.UserAgent = userAgent?[..Math.Min(userAgent.Length, 500)];
        }

        return SignResult.Ok;
    }

    public SignResult Decline(string token)
    {
        var entry = FindByToken(token);
        if (entry is null)
        {
            return SignResult.NotFound;
        }

        lock (entry)
        {
            if (entry.Status != SignatureStatus.Pending)
            {
                return SignResult.NotPending;
            }

            entry.Status = SignatureStatus.Declined;
            entry.CompletedAt = clock.GetUtcNow();
        }

        return SignResult.Ok;
    }

    public SignatureRequestDto ToDto(Entry e) =>
        new(e.Id, e.Title, e.SignerName, e.Status.ToString(), e.CreatedAt, e.ExpiresAt, e.CompletedAt, e.UserAgent, null, null);

    private bool Expired(Entry e) => e.ExpiresAt <= clock.GetUtcNow();

    private void Prune()
    {
        foreach (var e in entries.Values.Where(Expired))
        {
            entries.TryRemove(e.Id, out _);
        }
    }

    public sealed class Entry(Guid id, string title, string signerName, string token, DateTimeOffset createdAt, DateTimeOffset expiresAt)
    {
        public Guid Id { get; } = id;
        public string Title { get; } = title;
        public string SignerName { get; } = signerName;
        public string Token { get; } = token;
        public DateTimeOffset CreatedAt { get; } = createdAt;
        public DateTimeOffset ExpiresAt { get; } = expiresAt;
        public SignatureStatus Status { get; set; }
        public DateTimeOffset? CompletedAt { get; set; }
        public byte[]? Image { get; set; }
        public string? UserAgent { get; set; }
    }
}
