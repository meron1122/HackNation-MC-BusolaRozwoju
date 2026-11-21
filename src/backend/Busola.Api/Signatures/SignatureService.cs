using System.Buffers.Text;
using System.Security.Cryptography;
using System.Text;
using Busola.Database;
using Busola.Database.Entities;
using Microsoft.EntityFrameworkCore;
using SkiaSharp;

namespace Busola.Api.Signatures;

public sealed record SignatureRequestDto(
    Guid Id,
    string Title,
    string SignerName,
    string Status,
    DateTimeOffset CreatedAt,
    DateTimeOffset LinkExpiresAt,
    DateTimeOffset? CompletedAt,
    string? SignerUserAgent);

public enum SignResult { Ok, NotFound, NotPending, InvalidImage }

/// <summary>
/// Podpisy odręczne (demo, docelowo zastąpione dostawcą typu Autenti).
/// Zlecający tworzy prośbę i dostaje jednorazowy link z tokenem; sygnatariusz podpisuje bez logowania.
/// Tę klasę wywołuje też kod (np. flow raportów): CreateAsync, a potem odczyt statusu i obrazu podpisu.
/// </summary>
public sealed class SignatureService(BusolaDbContext db, TimeProvider clock)
{
    public static readonly TimeSpan LinkLifetime = TimeSpan.FromHours(24);
    private const int MaxImageBytes = 1024 * 1024;
    private const int MaxWidth = 4000;
    private const int MaxHeight = 2000;

    public async Task<(SignatureRequestDto Request, string Token)> CreateAsync(
        string title, string signerName, string createdByUserId, CancellationToken ct)
    {
        var token = NewToken();
        var request = new SignatureRequest
        {
            Id = Guid.NewGuid(),
            Title = title,
            SignerName = signerName,
            CreatedByUserId = createdByUserId,
            CreatedAt = clock.GetUtcNow(),
            TokenHash = Hash(token),
            LinkExpiresAt = clock.GetUtcNow() + LinkLifetime,
            Status = SignatureStatus.Pending,
        };
        db.SignatureRequests.Add(request);
        await db.SaveChangesAsync(ct);
        return (ToDto(request), token);
    }

    /// <summary>Nowy link (stary przestaje działać), np. żeby znowu pokazać kod QR. Tylko dla oczekujących.</summary>
    public async Task<string?> RenewLinkAsync(Guid id, CancellationToken ct)
    {
        var request = await db.SignatureRequests.SingleOrDefaultAsync(r => r.Id == id, ct);
        if (request is not { Status: SignatureStatus.Pending })
        {
            return null;
        }

        var token = NewToken();
        request.TokenHash = Hash(token);
        request.LinkExpiresAt = clock.GetUtcNow() + LinkLifetime;
        await db.SaveChangesAsync(ct);
        return token;
    }

    public Task<SignatureRequest?> FindByTokenAsync(string token, CancellationToken ct) =>
        db.SignatureRequests.Include(r => r.CreatedBy).ThenInclude(u => u.Employee)
            .SingleOrDefaultAsync(r => r.TokenHash == Hash(token), ct);

    public async Task<SignResult> SignAsync(string token, string pngDataUrl, string? ip, string? userAgent, CancellationToken ct)
    {
        var request = await db.SignatureRequests.SingleOrDefaultAsync(r => r.TokenHash == Hash(token), ct);
        if (request is null)
        {
            return SignResult.NotFound;
        }

        if (!IsOpen(request))
        {
            return SignResult.NotPending;
        }

        var image = NormalizePng(pngDataUrl);
        if (image is null)
        {
            return SignResult.InvalidImage;
        }

        request.Status = SignatureStatus.Signed;
        request.CompletedAt = clock.GetUtcNow();
        request.Image = image;
        request.SignerIp = ip;
        request.SignerUserAgent = userAgent?[..Math.Min(userAgent.Length, 500)];
        await db.SaveChangesAsync(ct);
        return SignResult.Ok;
    }

    public async Task<SignResult> DeclineAsync(string token, CancellationToken ct)
    {
        var request = await db.SignatureRequests.SingleOrDefaultAsync(r => r.TokenHash == Hash(token), ct);
        if (request is null)
        {
            return SignResult.NotFound;
        }

        if (!IsOpen(request))
        {
            return SignResult.NotPending;
        }

        request.Status = SignatureStatus.Declined;
        request.CompletedAt = clock.GetUtcNow();
        await db.SaveChangesAsync(ct);
        return SignResult.Ok;
    }

    public bool IsOpen(SignatureRequest r) => r.Status == SignatureStatus.Pending && r.LinkExpiresAt > clock.GetUtcNow();

    /// <summary>Status dla UI: oczekująca prośba po wygaśnięciu linku to "Expired" (można wygenerować nowy link).</summary>
    public string StatusOf(SignatureRequest r) =>
        r.Status == SignatureStatus.Pending && !IsOpen(r) ? "Expired" : r.Status.ToString();

    public SignatureRequestDto ToDto(SignatureRequest r) =>
        new(r.Id, r.Title, r.SignerName, StatusOf(r), r.CreatedAt, r.LinkExpiresAt, r.CompletedAt, r.SignerUserAgent);

    private static string NewToken() => Base64Url.EncodeToString(RandomNumberGenerator.GetBytes(32));

    private static string Hash(string token) => Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(token)));

    /// <summary>Data URL PNG z canvasa → zdekodowany i zakodowany od nowa PNG (zapisujemy tylko bajty z naszego enkodera).</summary>
    private static byte[]? NormalizePng(string dataUrl)
    {
        const string prefix = "data:image/png;base64,";
        if (!dataUrl.StartsWith(prefix, StringComparison.Ordinal) || dataUrl.Length > prefix.Length + MaxImageBytes * 4 / 3 + 4)
        {
            return null;
        }

        byte[] bytes;
        try
        {
            bytes = Convert.FromBase64String(dataUrl[prefix.Length..]);
        }
        catch (FormatException)
        {
            return null;
        }

        using var codec = SKCodec.Create(new MemoryStream(bytes));
        if (codec is null || codec.EncodedFormat != SKEncodedImageFormat.Png
            || codec.Info.Width > MaxWidth || codec.Info.Height > MaxHeight)
        {
            return null;
        }

        using var bitmap = SKBitmap.Decode(codec);
        using var image = bitmap is null ? null : SKImage.FromBitmap(bitmap);
        using var encoded = image?.Encode(SKEncodedImageFormat.Png, 100);
        return encoded?.ToArray();
    }
}
