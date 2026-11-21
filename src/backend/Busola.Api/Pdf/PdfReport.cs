using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace Busola.Api.Pdf;

/// <summary>
/// Wspólny układ dokumentów PDF (QuestPDF): A4, nagłówek z tytułem i datą, numeracja stron.
/// Nowy raport dostarcza tylko treść, np. <see cref="Table"/>, i zwraca File(bytes, "application/pdf", ...).
/// </summary>
public static class PdfReport
{
    public static byte[] Render(string title, Action<IContainer> content) =>
        Document.Create(document => document.Page(page =>
        {
            page.Size(PageSizes.A4);
            page.Margin(1.5f, Unit.Centimetre);
            page.DefaultTextStyle(style => style.FontSize(9));

            page.Header().PaddingBottom(10).BorderBottom(0.5f).BorderColor(Colors.Grey.Lighten1).Row(row =>
            {
                row.RelativeItem().Text(title).FontSize(16).Bold();
                row.AutoItem().AlignBottom().Text($"Busola Rozwoju · {DateTime.UtcNow:yyyy-MM-dd}").FontColor(Colors.Grey.Darken1);
            });

            page.Content().PaddingTop(10).Element(content);

            page.Footer().AlignCenter().Text(text =>
            {
                text.Span("Strona ");
                text.CurrentPageNumber();
                text.Span(" z ");
                text.TotalPages();
            });
        })).GeneratePdf();

    /// <summary>Tabela z nagłówkiem powtarzanym na każdej stronie.</summary>
    public static void Table(IContainer container, IReadOnlyList<string> headers, IEnumerable<IReadOnlyList<string>> rows) =>
        container.Table(table =>
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
                    header.Cell().Background(Colors.Grey.Lighten3).Padding(4).Text(h).Bold();
                }
            });

            if (!rows.Any())
            {
                table.Cell().ColumnSpan((uint)headers.Count).Padding(4).Text("Brak danych.").Italic();
                return;
            }

            foreach (var row in rows)
            {
                foreach (var value in row)
                {
                    table.Cell().BorderBottom(0.5f).BorderColor(Colors.Grey.Lighten2).Padding(4).Text(value);
                }
            }
        });
}
