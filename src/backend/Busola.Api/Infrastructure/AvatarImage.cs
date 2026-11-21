using Busola.Database.Entities;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Net.Http.Headers;
using SkiaSharp;

namespace Busola.Api.Infrastructure;

/// <summary>Obróbka avatarów jak w PIM (ProfileController), plus obrót według EXIF.</summary>
public static class AvatarImage
{
    public const int MaxBytes = 2 * 1024 * 1024;

    // Wyraźnie ponad MaxBytes: inaczej framework przerwie odczyt formularza przed akcją i użytkownik
    // dostanie surowe „request body too large” zamiast naszego komunikatu.
    public const int MaxUploadBytes = 8 * 1024 * 1024;

    private const int MaxDecodeDimension = 8000;
    private const int MaxDimension = 256;
    private const int Quality = 85;

    /// <summary>
    /// Dekoduje, zmniejsza do 256 px i koduje od nowa do WebP. Zapisujemy wyłącznie bajty z naszego enkodera,
    /// więc nie serwujemy z naszej domeny niczego, co przysłał użytkownik (SVG/HTML), a metadane (np. GPS z EXIF) znikają.
    /// </summary>
    /// <exception cref="InvalidDataException">Plik nie jest obsługiwanym obrazem.</exception>
    public static (byte[] Content, string ContentType) Normalize(byte[] bytes)
    {
        using var codec = SKCodec.Create(new MemoryStream(bytes))
            ?? throw new InvalidDataException("Plik nie jest obsługiwanym obrazem (JPG, PNG, WebP, GIF).");

        // Sprawdzane z nagłówka przed dekodowaniem: mały plik może deklarować ogromne wymiary.
        if (codec.Info.Width > MaxDecodeDimension || codec.Info.Height > MaxDecodeDimension)
        {
            throw new InvalidDataException($"Obraz może mieć najwyżej {MaxDecodeDimension}×{MaxDecodeDimension} px.");
        }

        using var source = SKBitmap.Decode(codec)
            ?? throw new InvalidDataException("Nie udało się odczytać obrazu.");

        var scale = Math.Min(1f, MaxDimension / (float)Math.Max(source.Width, source.Height));
        using var resized = (scale < 1f
            ? source.Resize(
                new SKImageInfo(Math.Max(1, (int)(source.Width * scale)), Math.Max(1, (int)(source.Height * scale))),
                new SKSamplingOptions(SKCubicResampler.Mitchell))
            : source.Copy())
            ?? throw new InvalidDataException("Nie udało się przetworzyć obrazu.");

        // Telefony zapisują zdjęcie „bokiem” i tylko oznaczają obrót w EXIF — bez tego avatar leżałby na boku.
        using var oriented = ApplyOrigin(resized, codec.EncodedOrigin);
        using var image = SKImage.FromBitmap(oriented);

        // Encode zwraca null, gdy dana kompilacja Skii nie ma enkodera formatu — wtedy PNG.
        var contentType = "image/webp";
        var encoded = image.Encode(SKEncodedImageFormat.Webp, Quality);
        if (encoded is null)
        {
            encoded = image.Encode(SKEncodedImageFormat.Png, Quality);
            contentType = "image/png";
        }

        using (encoded ?? throw new InvalidDataException("Nie udało się zapisać obrazu."))
        {
            return (encoded.ToArray(), contentType);
        }
    }

    public static IActionResult ToFileResult(this UserAvatar avatar, ControllerBase controller)
    {
        // private: avatar wymaga zalogowania; no-cache: przeglądarka pyta za każdym razem, ale dostaje 304, dopóki ETag się zgadza.
        controller.Response.Headers.CacheControl = "private, no-cache";
        return controller.File(
            avatar.Content,
            avatar.ContentType,
            avatar.UpdatedAt,
            new EntityTagHeaderValue($"\"{avatar.UpdatedAt.UtcTicks}\""));
    }

    private static SKBitmap ApplyOrigin(SKBitmap bitmap, SKEncodedOrigin origin)
    {
        if (origin == SKEncodedOrigin.TopLeft)
        {
            return bitmap.Copy();
        }

        float w = bitmap.Width, h = bitmap.Height;

        // Macierze jak SkEncodedOriginToMatrix w Skii.
        var matrix = origin switch
        {
            SKEncodedOrigin.TopRight => new SKMatrix(-1, 0, w, 0, 1, 0, 0, 0, 1),
            SKEncodedOrigin.BottomRight => new SKMatrix(-1, 0, w, 0, -1, h, 0, 0, 1),
            SKEncodedOrigin.BottomLeft => new SKMatrix(1, 0, 0, 0, -1, h, 0, 0, 1),
            SKEncodedOrigin.LeftTop => new SKMatrix(0, 1, 0, 1, 0, 0, 0, 0, 1),
            SKEncodedOrigin.RightTop => new SKMatrix(0, -1, h, 1, 0, 0, 0, 0, 1),
            SKEncodedOrigin.RightBottom => new SKMatrix(0, -1, h, -1, 0, w, 0, 0, 1),
            SKEncodedOrigin.LeftBottom => new SKMatrix(0, 1, 0, -1, 0, w, 0, 0, 1),
            _ => SKMatrix.Identity,
        };

        var swapsAxes = origin is SKEncodedOrigin.LeftTop or SKEncodedOrigin.RightTop
            or SKEncodedOrigin.RightBottom or SKEncodedOrigin.LeftBottom;

        var result = new SKBitmap(
            swapsAxes ? bitmap.Height : bitmap.Width,
            swapsAxes ? bitmap.Width : bitmap.Height,
            bitmap.ColorType,
            bitmap.AlphaType);

        using var canvas = new SKCanvas(result);
        using var image = SKImage.FromBitmap(bitmap);
        canvas.SetMatrix(matrix);
        canvas.DrawImage(image, 0, 0, SKSamplingOptions.Default);
        return result;
    }
}
