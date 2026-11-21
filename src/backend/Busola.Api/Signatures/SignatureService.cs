using System.Buffers.Text;
using System.Security.Cryptography;
using System.Text;
using Busola.Database;
using Busola.Database.Entities;
using Busola.Database.EvaluationTemplates;
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
    string? SignerUserAgent,
    int? EvaluationId,
    string? EvaluationFieldKey);

public enum SignResult { Ok, NotFound, NotPending, InvalidImage }

public sealed record SignatureFieldDto(string Key, string? Label, string Role, bool Signed);

/// <summary>Pole podpisu w ocenie (klucz pola typu "signature" ze szablonu).</summary>
public sealed record EvaluationTarget(int EvaluationId, string FieldKey);

/// <summary>Nie da się zlecić podpisu dla tego pola oceny; StatusCode to 400 albo 409.</summary>
public sealed class SignatureTargetException(int statusCode, string message) : Exception(message)
{
    public int StatusCode { get; } = statusCode;
}

/// <summary>
/// Podpisy odręczne (demo, docelowo zastąpione dostawcą typu Autenti).
/// Zlecający tworzy prośbę i dostaje jednorazowy link z tokenem; sygnatariusz podpisuje bez logowania.
/// Tę klasę wywołuje też kod (np. flow raportów): CreateAsync, a potem odczyt statusu i obrazu podpisu.
/// </summary>
public sealed class SignatureService(BusolaDbContext db, TimeProvider clock)
{
    public static readonly TimeSpan LinkLifetime = TimeSpan.FromHours(24);
    private const int MaxImageBytes = 1024 * 1024;

    // Limit z check constraintu evaluation_signatures.
    private const int MaxEvaluationImageBytes = 512 * 1024;
    private const int MaxWidth = 4000;
    private const int MaxHeight = 2000;

    /// <exception cref="SignatureTargetException">Pole oceny nie istnieje, nie jest podpisem albo jest już podpisane.</exception>
    public async Task<(SignatureRequestDto Request, string Token)> CreateAsync(
        string title, string signerName, string createdByUserId, EvaluationTarget? target, CancellationToken ct)
    {
        var role = target is null ? (SignatureRole?)null : await ResolveTargetAsync(target, ct);
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
            EvaluationId = target?.EvaluationId,
            EvaluationFieldKey = target?.FieldKey,
            EvaluationRole = role,
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

        if (request.EvaluationId is { } evaluationId)
        {
            if (image.Length > MaxEvaluationImageBytes)
            {
                return SignResult.InvalidImage;
            }

            // Pole mogło zostać podpisane inną drogą w międzyczasie; unikalny indeks i tak by to zablokował.
            if (await db.EvaluationSignatures.AnyAsync(s => s.EvaluationId == evaluationId && s.FieldKey == request.EvaluationFieldKey, ct))
            {
                return SignResult.NotPending;
            }

            db.EvaluationSignatures.Add(new EvaluationSignature
            {
                EvaluationId = evaluationId,
                FieldKey = request.EvaluationFieldKey!,
                Role = request.EvaluationRole!.Value,
                SignedById = request.CreatedByUserId,
                SignerName = request.SignerName,
                SignedOn = DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(clock.GetUtcNow(), Poland).DateTime),
                CreatedAt = clock.GetUtcNow(),
                ImageContent = image,
                ImageContentType = "image/png",
                ImageSha256 = SHA256.HashData(image),
            });
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
        new(r.Id, r.Title, r.SignerName, StatusOf(r), r.CreatedAt, r.LinkExpiresAt, r.CompletedAt, r.SignerUserAgent,
            r.EvaluationId, r.EvaluationFieldKey);

    public async Task<IReadOnlyList<SignatureFieldDto>> GetEvaluationFieldsAsync(int evaluationId, CancellationToken ct)
    {
        var schemaJson = await db.Evaluations.Where(e => e.Id == evaluationId).Select(e => e.Template.Schema).SingleAsync(ct);
        var signed = await db.EvaluationSignatures.Where(s => s.EvaluationId == evaluationId).Select(s => s.FieldKey).ToListAsync(ct);
        return SignatureFields(schemaJson)
            .Select(f => new SignatureFieldDto(f.Field.Key, f.Field.Label, f.Role.ToString(), signed.Contains(f.Field.Key)))
            .ToList();
    }

    private static IEnumerable<(FieldDefinition Field, SignatureRole Role)> SignatureFields(string schemaJson) =>
        TemplateSchema.Parse(schemaJson).Sections
            .SelectMany(s => s.Fields)
            .Where(f => f.Type == "signature")
            .Select(f => (Field: f, Role: f.Extra?.GetValueOrDefault("role") is { ValueKind: System.Text.Json.JsonValueKind.String } r
                && Enum.TryParse<SignatureRole>(r.GetString(), ignoreCase: true, out var role) ? role : (SignatureRole?)null))
            .Where(x => x.Role is not null)
            .Select(x => (x.Field, x.Role!.Value));

    /// <summary>Rola podpisu z pola szablonu oceny. Sprawdza, że pole jest typu signature i nie czeka/nie ma już podpisu.</summary>
    private async Task<SignatureRole> ResolveTargetAsync(EvaluationTarget target, CancellationToken ct)
    {
        var schemaJson = await db.Evaluations
            .Where(e => e.Id == target.EvaluationId)
            .Select(e => e.Template.Schema)
            .SingleOrDefaultAsync(ct)
            ?? throw new SignatureTargetException(StatusCodes.Status400BadRequest, "Nie ma takiej oceny.");

        var match = SignatureFields(schemaJson).Where(f => f.Field.Key == target.FieldKey).Select(f => (SignatureRole?)f.Role).FirstOrDefault();
        if (match is not { } role)
        {
            throw new SignatureTargetException(StatusCodes.Status400BadRequest, "Szablon tej oceny nie ma takiego pola podpisu.");
        }

        if (await db.EvaluationSignatures.AnyAsync(s => s.EvaluationId == target.EvaluationId && s.FieldKey == target.FieldKey, ct))
        {
            throw new SignatureTargetException(StatusCodes.Status409Conflict, "To pole oceny jest już podpisane.");
        }

        var now = clock.GetUtcNow();
        if (await db.SignatureRequests.AnyAsync(
                r => r.EvaluationId == target.EvaluationId && r.EvaluationFieldKey == target.FieldKey
                    && r.Status == SignatureStatus.Pending && r.LinkExpiresAt > now,
                ct))
        {
            throw new SignatureTargetException(StatusCodes.Status409Conflict, "Prośba o ten podpis już czeka. Użyj „Pokaż kod QR”.");
        }

        return role;
    }

    private static readonly TimeZoneInfo Poland = FindPoland();

    private static TimeZoneInfo FindPoland()
    {
        try
        {
            return TimeZoneInfo.FindSystemTimeZoneById("Europe/Warsaw");
        }
        catch (TimeZoneNotFoundException)
        {
            return TimeZoneInfo.Utc; // obraz bez tzdata: data podpisu w UTC
        }
    }

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
