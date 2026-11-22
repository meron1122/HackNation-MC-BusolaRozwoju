using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace Busola.Api.Pdf;

/// <summary>
/// Wspólny układ dokumentów PDF (QuestPDF): A4, nagłówek z logo Busoli, tytułem i datą, numeracja stron.
/// Nowy raport dostarcza tylko treść, np. <see cref="Table"/>, i zwraca File(bytes, "application/pdf", ...).
/// </summary>
public static class PdfReport
{
    // Granat i tekst drugorzędny z brandbooka.
    private const string Navy = "#1F2A5A";
    private const string Muted = "#5D6680";
    private const string Line = "#E4E7EF";

    /// <summary>Logo poziome z paczki marki (busola-brand/logo), jak w nagłówku aplikacji.</summary>
    private static readonly Lazy<string> Logo = new(() =>
    {
        using var stream = typeof(PdfReport).Assembly.GetManifestResourceStream("busola-logo.svg")
            ?? throw new InvalidOperationException("Brak zasobu busola-logo.svg");
        using var reader = new StreamReader(stream);
        return reader.ReadToEnd();
    });

    /// <summary>
    /// Wymogi dostępności z guidelines: tytuł i język dokumentu, struktura nagłówków, tekst zamiast obrazu tekstu
    /// (PDF/UA-1, czyli PDF otagowany dla czytników ekranu).
    /// </summary>
    public static Document Accessible(this Document document, string title) => document
        .WithMetadata(new DocumentMetadata { Title = title, Language = "pl-PL", Author = "Busola Rozwoju", Creator = "Busola Rozwoju" })
        .WithSettings(new DocumentSettings { PDFUA_Conformance = PDFUA_Conformance.PDFUA_1 });

    public static byte[] Render(string title, Action<IContainer> content) =>
        Document.Create(document => document.Page(page =>
        {
            page.Size(PageSizes.A4);
            page.Margin(1.5f, Unit.Centimetre);
            page.DefaultTextStyle(style => style.FontSize(9).FontColor(Navy));

            page.Header().PaddingBottom(10).BorderBottom(0.5f).BorderColor(Line).Row(row =>
            {
                // Brandbook: logo poziome w druku od 30 mm szerokości.
                row.ConstantItem(32, Unit.Millimetre).SemanticImage("Busola Rozwoju").Svg(Logo.Value);
                row.ConstantItem(6, Unit.Millimetre);
                row.RelativeItem().AlignMiddle().SemanticHeading1().Text(title).FontSize(16).Bold();
                row.AutoItem().AlignMiddle().Text(DateTime.Now.ToString("dd.MM.yyyy")).FontColor(Muted);
            });

            page.Content().PaddingTop(10).Element(content);

            page.Footer().SemanticIgnore().AlignCenter().Text(text =>
            {
                text.Span("Strona ");
                text.CurrentPageNumber();
                text.Span(" z ");
                text.TotalPages();
            });
        })).Accessible(title).GeneratePdf();

    /// <summary>Tabela z nagłówkiem powtarzanym na każdej stronie.</summary>
    public static void Table(IContainer container, IReadOnlyList<string> headers, IEnumerable<IReadOnlyList<string>> rows) =>
        container.SemanticTable().Table(table =>
        {
            table.ColumnsDefinition(columns =>
            {
                foreach (var _ in headers)
                {
                    columns.RelativeColumn();
                }
            });

            table.Header(header =>
            {
                foreach (var h in headers)
                {
                    header.Cell().Background(Colors.Grey.Lighten4).Padding(4).Text(h).Bold();
                }
            });

            if (!rows.Any())
            {
                table.Cell().ColumnSpan((uint)headers.Count).Padding(4).Text("W tym zestawieniu nie ma jeszcze pozycji.").Italic();
                return;
            }

            foreach (var row in rows)
            {
                foreach (var value in row)
                {
                    table.Cell().BorderBottom(0.5f).BorderColor(Line).Padding(4).Text(value);
                }
            }
        });
}
