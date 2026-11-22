using System.Globalization;
using Busola.Api.Evaluations;
using Busola.Api.Models;
using Busola.Database.EvaluationTemplates;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace Busola.Api.Pdf;

/// <summary>Podpis do PDF: dane z potwierdzenia i opcjonalny obraz.</summary>
public sealed record SheetSignature(string FieldKey, string SignerName, DateOnly SignedOn, string? Place, byte[]? Image);

/// <summary>Zawiadomienie o nowym terminie: nagłówek, adresat, treść, podpis i adnotacja o kopii do arkusza.</summary>
public sealed record TermNotice(
    string Office,
    string EmployeeName,
    string EmployeeDetails,
    string Title,
    IReadOnlyList<string> Paragraphs,
    string SignerName,
    string SignerCaption,
    DateOnly Date,
    string Footer);

/// <summary>
/// Arkusz oceny jako PDF w układzie urzędowych wzorów: arkusz B/C (załączniki nr 3 i 4 do rozporządzenia z 4.04.2016 r.)
/// i arkusz pierwszej oceny (załącznik nr 2 do rozporządzenia z 23.07.2015 r.) — te same części, tabele, pola „X”,
/// bloki podpisów, pouczenie i przypisy. Na arkuszu jest tylko to, co jest we wzorze; wskaźniki, notatki, samoocena
/// i reszta materiału roboczego zostają w systemie. Część III tylko przy wniosku o kolejny stopień (przypis 18).
/// Osobno formularz sprawozdania (załącznik nr 3 do rozporządzenia z 23.07.2015 r.) — <see cref="RenderReport"/>.
/// </summary>
public static class EvaluationSheetPdf
{
    public static byte[] Render(TemplateSchema schema, string templateCode, IEnumerable<AnswerDto> answers, IReadOnlyList<SheetSignature> signatures)
    {
        var sheet = new SheetData(schema, answers, signatures);
        return Form(SheetTitle(templateCode), column =>
        {
            if (templateCode == "first")
            {
                FirstSheet(column, sheet);
            }
            else
            {
                PeriodicSheet(column, sheet, isB: templateCode == "periodic-b");
            }
        });
    }

    /// <summary>
    /// Formularz sprawozdania dotyczącego zadań realizowanych przez ocenianego w trakcie przepracowanego okresu
    /// (załącznik nr 3 do rozporządzenia z 23.07.2015 r.): nazwa urzędu, dane ocenianego, termin, treść, podpis.
    /// </summary>
    public static byte[] RenderReport(ReportFormDto form, SheetSignature? signature) =>
        Form("Formularz sprawozdania dotyczącego zadań realizowanych przez ocenianego w trakcie przepracowanego okresu", column =>
        {
            Title(column, [("FORMULARZ SPRAWOZDANIA DOTYCZĄCEGO ZADAŃ REALIZOWANYCH", null), ("PRZEZ OCENIANEGO W TRAKCIE PRZEPRACOWANEGO OKRESU", null)]);
            LabelValueTable(column, [(("NAZWA URZĘDU", null), form.Office ?? "")]);
            Block(column, "DANE OCENIANEGO", null, c =>
                LabelValueTable(c,
                [
                    (("Imię", null), form.FirstName ?? ""),
                    (("Nazwisko", null), form.LastName ?? ""),
                    (("Komórka organizacyjna", null), form.Department ?? ""),
                    (("Stanowisko pracy", null), form.Position ?? ""),
                ]));
            LabelValueTable(column,
            [
                (("Termin wyznaczony na złożenie sprawozdania dotyczącego zadań realizowanych przez ocenianego w trakcie przepracowanego okresu", null),
                    form.PeriodFrom is null && form.PeriodTo is null ? "" : $"od {DateText(form.PeriodFrom)} – do {DateText(form.PeriodTo)}"),
            ]);

            // Bez ShowEntire: długa treść przechodzi na kolejne strony.
            column.Item().SemanticHeading3().PaddingTop(6)
                .Text(t => Bold(t, "SPRAWOZDANIE DOTYCZĄCE ZADAŃ REALIZOWANYCH PRZEZ OCENIANEGO W TRAKCIE PRZEPRACOWANEGO OKRESU", 1));
            column.Item().Element(Cell).MinHeight(120).Text(form.Text);

            column.Item().ShowEntire().PaddingTop(10).Table(table =>
            {
                SignatureColumns(table, 3);
                SignatureRows(table, signature, withName: false, "podpis ocenianego");
            });

            Footnotes(column, ReportNotes);
        });

    /// <summary>
    /// Pismo do ocenianego o nowym terminie (§ 5 ust. 4 rozporządzenia z 2015 r., § 8 rozporządzenia z 2016 r.): urząd,
    /// miejscowość i data, adresat, tytuł, treść, podpis wyznaczającego i adnotacja o kopii do arkusza.
    /// </summary>
    public static byte[] RenderNotice(TermNotice notice) =>
        Form(notice.Title, column =>
        {
            column.Spacing(10);
            column.Item().Row(row =>
            {
                row.RelativeItem().Text(notice.Office).Bold();
                row.AutoItem().Text($"……………………, {DateText(notice.Date)}");
            });
            column.Item().PaddingTop(10).AlignRight().Column(c =>
            {
                c.Item().Text(notice.EmployeeName).Bold();
                if (!string.IsNullOrEmpty(notice.EmployeeDetails))
                {
                    c.Item().Text(notice.EmployeeDetails).FontColor(Colors.Grey.Darken2);
                }
            });
            column.Item().PaddingTop(16).SemanticHeading1().AlignCenter().Text(notice.Title).Bold().FontSize(12);
            foreach (var paragraph in notice.Paragraphs)
            {
                column.Item().Text(paragraph).FontSize(10).LineHeight(1.3f);
            }

            column.Item().PaddingTop(40).AlignRight().Width(220).Column(c =>
            {
                c.Item().AlignCenter().Text(notice.SignerName);
                c.Item().LineHorizontal(0.5f).LineColor(Colors.Grey.Medium);
                c.Item().AlignCenter().Text(notice.SignerCaption).FontSize(7).FontColor(Colors.Grey.Darken2);
            });
            column.Item().PaddingTop(30).Text(notice.Footer).FontSize(8).FontColor(Colors.Grey.Darken2);
        });

    private static string DateText(DateOnly? date) => date?.ToString("dd.MM.yyyy", CultureInfo.InvariantCulture) ?? "";

    /// <summary>A4 jak wzory z rozporządzeń, numeracja stron, metadane dostępności.</summary>
    private static byte[] Form(string title, Action<ColumnDescriptor> content) =>
        Document.Create(document => document.Page(page =>
        {
            page.Size(PageSizes.A4);
            page.Margin(1.5f, Unit.Centimetre);
            page.DefaultTextStyle(style => style.FontSize(9));
            page.Content().Column(column =>
            {
                column.Spacing(6);
                content(column);
            });
            page.Footer().SemanticIgnore().AlignCenter().Text(text =>
            {
                text.CurrentPageNumber();
                text.Span(" / ");
                text.TotalPages();
            });
        })).Accessible(title).GeneratePdf();

    /// <summary>Tytuł w metadanych PDF (czytniki ekranu, karta przeglądarki) — nazwa arkusza z wzoru.</summary>
    private static string SheetTitle(string templateCode) => templateCode switch
    {
        "first" => "Arkusz pierwszej oceny w służbie cywilnej",
        "periodic-b" => "Arkusz B — ocena okresowa",
        "periodic-c" => "Arkusz C — ocena okresowa",
        _ => "Arkusz oceny",
    };

    // ------------------------------------------------------------------ Arkusz B / C

    private static void PeriodicSheet(ColumnDescriptor column, SheetData s, bool isB)
    {
        Title(column, [(isB ? "ARKUSZ B" : "ARKUSZ C", 1), ("OCENA OKRESOWA", null), ("URZĘDNIKA SŁUŻBY CYWILNEJ LUB PRACOWNIKA SŁUŻBY CYWILNEJ", null)]);

        // CZĘŚĆ I
        PartHeading(column, "CZĘŚĆ I");
        LabelValueTable(column, [(("NAZWA URZĘDU", null), s.Text("office"))]);
        Block(column, "DANE OCENIANEGO", null, c =>
            PersonTable(c, s, "evaluated", positionNote: 2));
        Block(column, "DANE OCENIAJĄCEGO", null, c =>
            PersonTable(c, s, "evaluator"));

        var (mandatory, additional) = s.Criteria("criteria");
        Block(column, "KRYTERIA OCENY I TERMIN SPORZĄDZENIA OCENY", null, c =>
            c.Item().Table(table =>
            {
                table.ColumnsDefinition(c =>
                {
                    c.RelativeColumn(4);
                    c.RelativeColumn(2);
                    c.RelativeColumn(2);
                });
                table.Cell().Element(Header).Text(t => Bold(t, "Kryteria obowiązkowe"));
                table.Cell().ColumnSpan(2).Element(Header).Text(t =>
                {
                    Bold(t, "Kryteria dodatkowe wybrane przez oceniającego (nie więcej niż 3)", 3);
                });
    
                for (var i = 0; i < Math.Max(5, mandatory.Count); i++)
                {
                    table.Cell().Element(Cell).Text(i < mandatory.Count ? mandatory[i].Label : "");
                    if (i < 3)
                    {
                        table.Cell().ColumnSpan(2).Element(Cell).Text(i < additional.Count ? additional[i].Label : "");
                    }
                    else if (i == 3)
                    {
                        table.Cell().RowSpan(2).Element(Cell).AlignMiddle().Text(t => Bold(t, "Termin sporządzenia oceny"));
                        table.Cell().RowSpan(2).Element(Cell).AlignMiddle().AlignCenter().Text(s.Date("evaluationDueDate"));
                    }
                }
            }));

        column.Item().Table(table =>
        {
            SignatureColumns(table, 3);
            table.Cell().ColumnSpan(3).Element(Cell).Column(c =>
            {
                c.Item().Text("Potwierdzamy:");
                c.Item().Text(t =>
                {
                    t.Span("• przeprowadzenie rozmowy, o której mowa w § 5 ust. 1 rozporządzenia Prezesa Rady Ministrów z dnia 4 kwietnia 2016 r. "
                        + "w sprawie warunków i sposobu przeprowadzania ocen okresowych urzędników służby cywilnej i pracowników służby cywilnej "
                        + "(Dz. U. poz. 470), i omówienie w trakcie tej rozmowy wszystkich wymaganych zagadnień");
                    Note(t, 4);
                    t.Span(",");
                });
                c.Item().Text("• zapoznanie ocenianego z kryteriami oceny oraz terminem sporządzenia oceny.");
            });
            SignatureRows(table, s.Signature("criteriaEvaluatorSignature"), withName: false, "podpis oceniającego");
            SignatureRows(table, s.Signature("criteriaEvaluatedSignature"), withName: false, "podpis ocenianego");
        });

        // CZĘŚĆ II
        column.Item().PageBreak();
        PartHeading(column, "CZĘŚĆ II");
        var (periodFrom, periodTo) = s.Range("evaluationPeriod");
        column.Item().Table(table =>
        {
            table.ColumnsDefinition(c =>
            {
                c.RelativeColumn(4);
                c.RelativeColumn(1);
                c.RelativeColumn(2);
                c.RelativeColumn(1);
                c.RelativeColumn(2);
            });
            table.Cell().Element(Cell).Text(t => Bold(t, "DATA PRZEPROWADZENIA ROZMOWY OCENIAJĄCEJ", 5));
            table.Cell().ColumnSpan(4).Element(Cell).AlignCenter().Text(s.Date("evaluationInterviewDate"));
            table.Cell().Element(Cell).Text(t => Bold(t, "OKRES, W KTÓRYM OCENIANY PODLEGAŁ OCENIE"));
            table.Cell().Element(Cell).Text(t => Bold(t, "OD", 6));
            table.Cell().Element(Cell).AlignCenter().Text(periodFrom);
            table.Cell().Element(Cell).Text(t => Bold(t, "DO", 7));
            table.Cell().Element(Cell).AlignCenter().Text(periodTo);
        });

        var scale = s.ScaleOf("scores");
        column.Item().Table(table =>
        {
            table.ColumnsDefinition(c =>
            {
                c.RelativeColumn(4);
                foreach (var _ in scale)
                {
                    c.RelativeColumn(1);
                }
            });

            table.Cell().RowSpan(3).Element(Header).AlignMiddle().Text(t => Bold(t, "KRYTERIA OBOWIĄZKOWE"));
            table.Cell().ColumnSpan((uint)scale.Count).Element(Header).AlignCenter().Text(t => Bold(t, "OCENA CZĄSTKOWA", 8));
            foreach (var option in scale)
            {
                table.Cell().Element(Header).AlignCenter().Text(option.Label).FontSize(7);
            }

            foreach (var option in scale)
            {
                table.Cell().Element(Header).AlignCenter().Text(t =>
                {
                    t.Span(option.Value.ToString(CultureInfo.InvariantCulture)).Bold();
                    t.Span(" " + Points(option.Value)).FontSize(7);
                });
            }

            foreach (var item in mandatory)
            {
                ScoreRow(table, item, s.Score("scores", item.Key), scale);
            }

            table.Cell().Element(Header).Text(t => Bold(t, "KRYTERIA DODATKOWE WYBRANE PRZEZ OCENIAJĄCEGO", 9));
            table.Cell().ColumnSpan((uint)scale.Count).Element(Header).AlignCenter().Text(t => Bold(t, "OCENA CZĄSTKOWA"));
            for (var i = 0; i < 3; i++)
            {
                if (i < additional.Count)
                {
                    ScoreRow(table, additional[i], s.Score("scores", additional[i].Key), scale);
                }
                else
                {
                    table.Cell().Element(Cell).Text("");
                    foreach (var _ in scale)
                    {
                        table.Cell().Element(Cell).Text("");
                    }
                }
            }

            var split = Math.Max(1, scale.Count - 1);
            table.Cell().ColumnSpan((uint)split).Element(Cell)
                .Text(t => Bold(t, "Średnia arytmetyczna z ocen cząstkowych przyznanych za poszczególne kryteria oceny:"));
            table.Cell().ColumnSpan((uint)(scale.Count + 1 - split)).Element(Cell).AlignCenter().Text(s.Average("averageScore")).Bold();
        });

        var level = s.Text("level");
        Block(column, "PRZYZNANIE OCENY", null, c =>
            c.Item().Table(table =>
            {
                table.ColumnsDefinition(c =>
                {
                    c.RelativeColumn(2);
                    c.RelativeColumn(4);
                    c.RelativeColumn(4);
                });
                table.Cell().Element(Header).Text("Należy wstawić znak „X” w odpowiednie pole").FontSize(7);
                table.Cell().Element(Header).Text(t => Bold(t, "Liczba punktów stanowiąca średnią arytmetyczną ze wszystkich ocen cząstkowych"));
                table.Cell().Element(Header).Text(t => Bold(t, "Ogólny poziom spełnienia kryteriów oceny"));
                foreach (var rule in s.Levels)
                {
                    table.Cell().Element(Cell).AlignCenter().Text(rule.Key == level ? "X" : "").Bold();
                    table.Cell().Element(Cell).Text(t => Bold(t, RangeText(rule)));
                    table.Cell().Element(Cell).Text(t => Bold(t, rule.Label.ToLowerInvariant()));
                }
            }));

        var result = s.Text("result");
        column.Item().Table(table =>
        {
            table.ColumnsDefinition(c =>
            {
                c.RelativeColumn(4);
                c.RelativeColumn(2);
                c.RelativeColumn(1);
                c.RelativeColumn(2);
                c.RelativeColumn(1);
            });
            table.Cell().Element(Cell).Text(t => Bold(t, "OCENA OKRESOWA W SŁUŻBIE CYWILNEJ"));
            table.Cell().Element(Cell).Text(t => Bold(t, "POZYTYWNA", 10));
            table.Cell().Element(Cell).AlignCenter().Text(result == "positive" ? "X" : "").Bold();
            table.Cell().Element(Cell).Text(t => Bold(t, "NEGATYWNA", 11));
            table.Cell().Element(Cell).AlignCenter().Text(result == "negative" ? "X" : "").Bold();
        });

        Block(column, "UZASADNIENIE PRZYZNANEJ OCENY OKRESOWEJ", 12, c =>
            Box(c, s.Text("justification")));
        Block(column, "WNIOSKI DOTYCZĄCE INDYWIDUALNEGO PROGRAMU ROZWOJU ZAWODOWEGO", 13, c =>
            Box(c, s.Text("developmentConclusions")));

        Block(column, "DANE DOTYCZĄCE POPRZEDNIEJ OCENY OKRESOWEJ URZĘDNIKA SŁUŻBY CYWILNEJ", null, c =>
            c.Item().Table(table =>
            {
                table.ColumnsDefinition(c =>
                {
                    c.RelativeColumn(1);
                    c.RelativeColumn(2);
                    c.RelativeColumn(1);
                    c.RelativeColumn(2);
                    c.RelativeColumn(2);
                    c.RelativeColumn(2);
                });
                table.Cell().Element(Cell).Text(t => Bold(t, "Ocena", 14));
                table.Cell().Element(Cell).Text(s.Text("previousResult") switch { "positive" => "pozytywna", "negative" => "negatywna", _ => "" });
                table.Cell().Element(Cell).Text(t => Bold(t, "Poziom", 15));
                table.Cell().Element(Cell).Text(s.Levels.FirstOrDefault(l => l.Key == s.Text("previousLevel"))?.Label.ToLowerInvariant() ?? "");
                table.Cell().Element(Cell).Text(t => Bold(t, "Data sporządzenia"));
                table.Cell().Element(Cell).AlignCenter().Text(s.Date("previousDate"));
            }));

        var promotion = s.Text("promotionRequest");
        Block(column, "CZY DO OCENY OKRESOWEJ DOŁĄCZONO WNIOSEK O PRZYZNANIE KOLEJNEGO STOPNIA SŁUŻBOWEGO?", 16, c =>
            c.Item().Table(table =>
            {
                table.ColumnsDefinition(c =>
                {
                    c.RelativeColumn(1);
                    c.RelativeColumn(1);
                    c.RelativeColumn(1);
                    c.RelativeColumn(1);
                    c.RelativeColumn(4);
                    c.RelativeColumn(1);
                });
                table.Cell().Element(Cell).Text(t => Bold(t, "TAK"));
                table.Cell().Element(Cell).AlignCenter().Text(promotion == "yes" ? "X" : "").Bold();
                table.Cell().Element(Cell).Text(t => Bold(t, "NIE"));
                table.Cell().Element(Cell).AlignCenter().Text(promotion == "no" ? "X" : "").Bold();
                table.Cell().Element(Cell).Text(t => Bold(t, "NIE DOTYCZY (oceniany jest pracownikiem służby cywilnej)"));
                table.Cell().Element(Cell).AlignCenter().Text(promotion == "not_applicable" ? "X" : "").Bold();
            }));

        Block(column, "DANE OCENIAJĄCEGO", null, c =>
            PersonTable(c, s, "finalEvaluator"));
        column.Item().Table(table =>
        {
            SignatureColumns(table, 3);
            SignatureRows(table, s.Signature("evaluationEvaluatorSignature"), withName: false, "podpis oceniającego");
        });

        column.Item().Table(table =>
        {
            SignatureColumns(table, 4);
            table.Cell().ColumnSpan(4).Element(Cell).Text(
                "Przeprowadzono ze mną rozmowę oceniającą oraz zapoznałem(-łam) się z oceną okresową i wnioskami dotyczącymi indywidualnego programu rozwoju zawodowego.");
            SignatureRows(table, s.Signature("acknowledgementSignature"), withName: true, "podpis ocenianego", "imię i nazwisko lub pieczątka ocenianego");
        });

        column.Item().Border(0.5f).BorderColor(Colors.Grey.Darken1).Padding(4).Column(c =>
        {
            c.Item().Text("Pouczenie").Bold();
            c.Item().Text(t =>
            {
                t.Span("Zgodnie z art. 83 ust. 1 ustawy z dnia 21 listopada 2008 r. o służbie cywilnej od oceny okresowej służy, "
                    + "w terminie 7 dni od dnia zapoznania się z oceną, sprzeciw do dyrektora generalnego urzędu");
                Note(t, 17);
                t.Span(".");
            });
        });

        // CZĘŚĆ III — tylko przy wniosku o kolejny stopień służbowy (przypis 18).
        var partThree = promotion == "yes";
        if (partThree)
        {
            column.Item().PageBreak();
            column.Item().AlignCenter().Text(t =>
            {
                t.Span("CZĘŚĆ III").Bold().FontSize(11);
                Note(t, 18);
            });
            column.Item().AlignCenter().Text("Wniosek jest wypełniany i dołączany do arkusza oceny okresowej ocenianego tylko w sytuacji skorzystania przez "
                + "oceniającego z możliwości przewidzianej w art. 89 ust. 1 ustawy z dnia 21 listopada 2008 r. o służbie cywilnej.").FontSize(8);
            var civilServant = s.Person("civilServant");
            Block(column, "DANE URZĘDNIKA SŁUŻBY CYWILNEJ", null, c =>
                LabelValueTable(c,
                [
                    (("Imię", null), civilServant.FirstName),
                    (("Nazwisko", null), civilServant.LastName),
                    (("Rok mianowania", null), s.Year("appointmentYear")),
                    (("Posiadany stopień służbowy", null), s.Text("currentRank")),
                    (("Data przyznania stopnia służbowego", null), s.Date("currentRankDate")),
                ]));

            column.Item().Table(table =>
            {
                SignatureColumns(table, 4);
                table.Cell().ColumnSpan(4).Element(Header).AlignCenter()
                    .Text(t => Bold(t, "WNIOSEK O PRZYZNANIE URZĘDNIKOWI SŁUŻBY CYWILNEJ KOLEJNEGO STOPNIA SŁUŻBOWEGO"));
                table.Cell().ColumnSpan(4).Element(Cell).Text(
                    $"W związku z uzyskaniem przez Panią/Pana {civilServant.FullName} pozytywnej oceny okresowej, na podstawie art. 89 ust. 1 "
                    + $"ustawy z dnia 21 listopada 2008 r. o służbie cywilnej wnioskuję o przyznanie {s.Text("requestedRank")} stopnia służbowego.");
                table.Cell().ColumnSpan(4).Element(Cell).Text(t => Bold(t, "Umotywowanie wniosku"));
                table.Cell().ColumnSpan(4).Element(Cell).MinHeight(60).Text(s.Text("promotionMotivation"));
                SignatureRows(table, s.Signature("promotionEvaluatorSignature"), withName: true, "podpis oceniającego", "imię i nazwisko lub pieczątka oceniającego");
            });
        }

        Footnotes(column, PeriodicNotes(isB).Take(partThree ? 18 : 17).ToList());
    }

    // ------------------------------------------------------------------ Arkusz pierwszej oceny

    private static void FirstSheet(ColumnDescriptor column, SheetData s)
    {
        Title(column, [("ARKUSZ PIERWSZEJ OCENY W SŁUŻBIE CYWILNEJ", null)]);

        Block(column, "I. CZĘŚĆ OGÓLNA", null, c =>
            LabelValueTable(c, [(("NAZWA URZĘDU", null), s.Text("office"))]));
        var evaluated = s.Person("evaluated");
        Block(column, "DANE OCENIANEGO", null, c =>
            LabelValueTable(c,
            [
                (("Imię", null), evaluated.FirstName),
                (("Nazwisko", null), evaluated.LastName),
                (("Komórka organizacyjna", null), evaluated.Department),
                (("Stanowisko pracy", null), evaluated.Position),
                (("Data nawiązania stosunku pracy", 1), s.Date("hireDate")),
            ]));
        Block(column, "DANE BEZPOŚREDNIEGO PRZEŁOŻONEGO", null, c =>
            PersonTable(c, s, "supervisor"));
        Block(column, "DANE KIERUJĄCEGO KOMÓRKĄ ORGANIZACYJNĄ", null, c =>
            PersonTable(c, s, "unitHead"));

        Block(column, "II. ROZMOWA WSTĘPNA", null, c =>
            LabelValueTable(c,
            [
                (("Data przeprowadzenia rozmowy wstępnej", null), s.Date("initialInterviewDate")),
                (("Termin wyznaczony na złożenie sprawozdania dotyczącego zadań realizowanych przez ocenianego w trakcie przepracowanego okresu", null),
                    s.RangeText("reportPeriod")),
                (("Okres, w którym powinna zostać dokonana pierwsza ocena w służbie cywilnej", null), s.RangeText("evaluationPeriod")),
            ]));
        column.Item().Table(table =>
        {
            SignatureColumns(table, 3);
            table.Cell().ColumnSpan(3).Element(Cell)
                .Text("Potwierdzamy przeprowadzenie rozmowy wstępnej oraz wyznaczenie terminu na złożenie sprawozdania i zapoznanie z nim ocenianego.");
            SignatureRows(table, s.Signature("initialInterviewSupervisorSignature"), withName: false, "podpis bezpośredniego przełożonego");
            SignatureRows(table, s.Signature("initialInterviewEvaluatedSignature"), withName: false, "podpis ocenianego");
        });

        column.Item().PageBreak();
        Block(column, "III. ROZMOWA OCENIAJĄCA", null, c =>
            LabelValueTable(c, [(("Data przeprowadzenia rozmowy oceniającej", null), s.Date("evaluationInterviewDate"))]));
        column.Item().Table(table =>
        {
            SignatureColumns(table, 4);
            table.Cell().ColumnSpan(4).Element(Cell).Text(t =>
            {
                t.Span("Potwierdzamy przeprowadzenie rozmowy oceniającej i omówienie w trakcie tej rozmowy wszystkich wymaganych zagadnień");
                Note(t, 2);
                t.Span(".");
            });
            SignatureRows(table, s.Signature("evaluationInterviewSupervisorSignature"), withName: true,
                "podpis bezpośredniego przełożonego", "imię i nazwisko lub pieczątka bezpośredniego przełożonego");
            SignatureRows(table, s.Signature("evaluationInterviewEvaluatedSignature"), withName: true, "podpis ocenianego", "imię i nazwisko lub pieczątka ocenianego");
        });

        var scale = s.ScaleOf("elements");
        Block(column, "IV. OCENA POSTAWY OCENIANEGO, JEGO ZAANGAŻOWANIA I POSTĘPÓW W PRACY, RELACJI ZE WSPÓŁPRACOWNIKAMI ORAZ TERMINOWOŚCI WYKONYWANIA ZADAŃ", null, c =>
            c.Item().Table(table =>
            {
                table.ColumnsDefinition(c =>
                {
                    c.RelativeColumn(4);
                    foreach (var _ in scale)
                    {
                        c.RelativeColumn(2);
                    }
                });
                table.Cell().RowSpan(3).Element(Header).AlignMiddle().Text(t => Bold(t, "ELEMENTY OCENY", 3));
                table.Cell().ColumnSpan((uint)scale.Count).Element(Header).AlignCenter()
                    .Text(t => Bold(t, "OCENA CZĄSTKOWA (należy wstawić znak „X” w odpowiednie pole)"));
                foreach (var option in scale)
                {
                    table.Cell().Element(Header).AlignCenter().Text(option.Label.ToLowerInvariant());
                }
    
                foreach (var option in scale)
                {
                    table.Cell().Element(Header).AlignCenter().Text($"{option.Value} {Points(option.Value)}");
                }
    
                var items = s.ScoreItems("elements");
                for (var i = 0; i < items.Count; i++)
                {
                    ScoreRow(table, items[i] with { Label = $"{i + 1}. {items[i].Label}" }, s.Score("elements", items[i].Key), scale);
                }
    
                table.Cell().Element(Cell).Text(t => Bold(t, "OCENA ŁĄCZNA", 4));
                table.Cell().ColumnSpan((uint)scale.Count).Element(Cell).AlignCenter().Text(s.Average("totalScore")).Bold();
            }));

        Block(column, "V. PIERWSZA OCENA W SŁUŻBIE CYWILNEJ", null, c =>
            ChoiceTable(c, "OCENIANY ZALICZYŁ EGZAMIN ZE SŁUŻBY PRZYGOTOWAWCZEJ (należy wstawić znak „X” w odpowiednie pole)",
                s.Text("exam"), [("TAK", "yes", null), ("NIE", "no", null), ("NIE DOTYCZY", "not_applicable", 5)]));
        ChoiceTable(column, "SPRAWOZDANIE ZOSTAŁO ZŁOŻONE W WYZNACZONYM TERMINIE (należy wstawić znak „X” w odpowiednie pole)",
            s.Text("reportOnTime"), [("TAK", "yes", null), ("NIE", "no", null)]);
        ChoiceTable(column, "PIERWSZA OCENA W SŁUŻBIE CYWILNEJ (należy wstawić znak „X” w odpowiednie pole)",
            s.Text("result"), [("POZYTYWNA", "positive", 6), ("NEGATYWNA", "negative", null)]);

        Block(column, "UZASADNIENIE PRZYZNANEJ OCENY", 7, c =>
            Box(c, s.Text("justification")));

        Block(column, "VI. WNIOSKI DOTYCZĄCE ROZWOJU ZAWODOWEGO OCENIANEGO", 8, c =>
            Box(c, s.Text("developmentConclusions")));

        column.Item().Table(table =>
        {
            SignatureColumns(table, 4);
            table.Cell().ColumnSpan(4).Element(Header).AlignCenter().Text(t => Bold(t, "POTWIERDZENIE DOKONANIA PIERWSZEJ OCENY W SŁUŻBIE CYWILNEJ"));
            SignatureRows(table, s.Signature("confirmationSupervisorSignature"), withName: true,
                "podpis bezpośredniego przełożonego", "imię i nazwisko lub pieczątka bezpośredniego przełożonego");
            SignatureRows(table, s.Signature("confirmationUnitHeadSignature"), withName: true,
                "podpis kierującego komórką organizacyjną", "imię i nazwisko lub pieczątka kierującego komórką organizacyjną");
        });

        column.Item().Table(table =>
        {
            SignatureColumns(table, 4);
            table.Cell().ColumnSpan(4).Element(Cell).Text("Zapoznałam(-łem) się z pierwszą oceną w służbie cywilnej.");
            SignatureRows(table, s.Signature("acknowledgementSignature"), withName: true, "podpis ocenianego", "imię i nazwisko lub pieczątka ocenianego");
        });

        Footnotes(column, FirstNotes);
    }

    // ------------------------------------------------------------------ Klocki układu

    private static IContainer Cell(IContainer container) =>
        container.Border(0.5f).BorderColor(Colors.Grey.Darken1).Padding(4);

    private static IContainer Header(IContainer container) =>
        container.Border(0.5f).BorderColor(Colors.Grey.Darken1).Background(Colors.Grey.Lighten4).Padding(4);

    private static void Bold(TextDescriptor text, string value, int? note = null)
    {
        text.Span(value).Bold();
        if (note is { } n)
        {
            Note(text, n);
        }
    }

    private static void Note(TextDescriptor text, int number) => text.Span(number.ToString(CultureInfo.InvariantCulture)).Superscript();

    private static void Title(ColumnDescriptor column, IReadOnlyList<(string Text, int? Note)> lines) =>
        column.Item().SemanticHeading1().PaddingBottom(6).AlignCenter().Column(c =>
        {
            foreach (var (text, note) in lines)
            {
                c.Item().AlignCenter().Text(t =>
                {
                    t.Span(text).Bold().FontSize(12);
                    if (note is { } n)
                    {
                        Note(t, n);
                    }
                });
            }
        });

    private static void PartHeading(ColumnDescriptor column, string text) =>
        column.Item().SemanticHeading2().PaddingTop(4).AlignCenter().Text(text).Bold().FontSize(11);

    /// <summary>Nagłówek razem z blokiem pod nim (ShowEntire): nagłówek nie zostaje sam na dole strony.</summary>
    private static void Block(ColumnDescriptor column, string heading, int? note, Action<ColumnDescriptor> body) =>
        column.Item().ShowEntire().Column(block =>
        {
            block.Spacing(6);
            block.Item().SemanticHeading3().PaddingTop(6).Text(t => Bold(t, heading, note));
            body(block);
        });

    private static void Box(ColumnDescriptor column, string text) =>
        column.Item().Element(Cell).MinHeight(50).Text(text);

    private static void LabelValueTable(ColumnDescriptor column, IReadOnlyList<((string Text, int? Note) Label, string Value)> rows) =>
        column.Item().SemanticTable().Table(table =>
        {
            table.ColumnsDefinition(c =>
            {
                c.RelativeColumn(2);
                c.RelativeColumn(3);
            });
            foreach (var (label, value) in rows)
            {
                table.Cell().Element(Header).Text(t => Bold(t, label.Text, label.Note));
                table.Cell().Element(Cell).Text(value);
            }
        });

    private static void PersonTable(ColumnDescriptor column, SheetData s, string fieldKey, int? positionNote = null)
    {
        var person = s.Person(fieldKey);
        LabelValueTable(column,
        [
            (("Imię", null), person.FirstName),
            (("Nazwisko", null), person.LastName),
            (("Komórka organizacyjna", null), person.Department),
            (("Stanowisko pracy", positionNote), person.Position),
        ]);
    }

    private static void ScoreRow(TableDescriptor table, ScoreItem item, decimal? score, IReadOnlyList<ScaleOption> scale)
    {
        table.Cell().Element(Cell).Text(item.Label);
        foreach (var option in scale)
        {
            table.Cell().Element(Cell).AlignCenter().AlignMiddle().Text(score == option.Value ? "X" : "").Bold();
        }
    }

    private static void ChoiceTable(ColumnDescriptor column, string title, string? value, IReadOnlyList<(string Label, string Value, int? Note)> options) =>
        column.Item().SemanticTable().Table(table =>
        {
            table.ColumnsDefinition(c =>
            {
                foreach (var _ in options)
                {
                    c.RelativeColumn(3);
                    c.RelativeColumn(1);
                }
            });
            table.Cell().ColumnSpan((uint)(options.Count * 2)).Element(Header).Text(title);
            foreach (var option in options)
            {
                table.Cell().Element(Cell).Text(t => Bold(t, option.Label, option.Note));
                table.Cell().Element(Cell).AlignCenter().Text(value == option.Value ? "X" : "").Bold();
            }
        });

    private static void SignatureColumns(TableDescriptor table, int count) =>
        table.ColumnsDefinition(c =>
        {
            for (var i = 0; i < count; i++)
            {
                c.RelativeColumn();
            }
        });

    /// <summary>Wiersz „miejscowość | data | [imię i nazwisko lub pieczątka] | podpis” z wartościami i podpisami pod spodem.</summary>
    private static void SignatureRows(TableDescriptor table, SheetSignature? signature, bool withName, string signatureCaption, string? nameCaption = null)
    {
        table.Cell().Element(Cell).MinHeight(32).AlignBottom().AlignCenter().Text(signature?.Place ?? "");
        table.Cell().Element(Cell).MinHeight(32).AlignBottom().AlignCenter().Text(signature?.SignedOn.ToString("dd.MM.yyyy", CultureInfo.InvariantCulture) ?? "");
        if (withName)
        {
            table.Cell().Element(Cell).MinHeight(32).AlignBottom().AlignCenter().Text(signature?.SignerName ?? "");
        }

        table.Cell().Element(Cell).MinHeight(32).AlignBottom().AlignCenter().Element(c =>
        {
            if (signature?.Image is { } image)
            {
                c.SemanticImage($"Podpis odręczny: {signature.SignerName}").Height(30).Image(image).FitArea();
            }
            else if (signature is not null)
            {
                c.Text($"podpisano w systemie: {signature.SignerName}").Italic().FontSize(7);
            }
        });

        foreach (var caption in new[] { "miejscowość", "data (dd.mm.rrrr)" }.Concat(withName ? new[] { nameCaption ?? "imię i nazwisko lub pieczątka" } : []).Append(signatureCaption))
        {
            table.Cell().PaddingBottom(4).AlignCenter().Text(caption).FontSize(7).FontColor(Colors.Grey.Darken2);
        }
    }

    private static void Footnotes(ColumnDescriptor column, IReadOnlyList<string> notes)
    {
        column.Item().PaddingTop(10).LineHorizontal(0.5f).LineColor(Colors.Grey.Medium);
        column.Item().Column(c =>
        {
            c.Spacing(2);
            for (var i = 0; i < notes.Count; i++)
            {
                var number = i + 1;
                c.Item().Text(t =>
                {
                    Note(t, number);
                    t.Span(" " + notes[i]).FontSize(7);
                });
            }
        });
    }

    private static string Points(int value) => value switch
    {
        1 => "punkt",
        >= 2 and <= 4 => "punkty",
        _ => "punktów",
    };

    // „od 1 punktu do 2 punktów”, „powyżej 2 punktów do 4 punktów”.
    private static string RangeText(LevelRule rule)
    {
        var from = rule.MinExclusive is { } exclusive
            ? $"powyżej {exclusive:0} punktów"
            : rule.Min == 1 ? "od 1 punktu" : $"od {rule.Min:0} punktów";
        return $"{from} do {rule.Max:0} punktów";
    }

    // ------------------------------------------------------------------ Przypisy ze wzorów

    private static IEnumerable<string> PeriodicNotes(bool isB) =>
    [
        isB
            ? "Arkusz służy do sporządzenia oceny okresowej urzędnika służby cywilnej lub pracownika służby cywilnej, zatrudnionego na stanowisku, na którym praca polega na bezpośrednim kierowaniu pracownikami."
            : "Arkusz służy do sporządzenia oceny okresowej urzędnika służby cywilnej lub pracownika służby cywilnej, zatrudnionego na stanowisku, które nie jest: – stanowiskiem kierownika urzędu, będącym stanowiskiem pracy w służbie cywilnej, ani – stanowiskiem, na którym praca polega na bezpośrednim kierowaniu pracownikami.",
        "Należy wskazać pełną nazwę stanowiska pracy wraz z jego rozszerzeniem określającym, do jakich spraw jest to stanowisko (jeżeli zostało to określone w opisie stanowiska pracy).",
        "Należy wpisać nazwy wybranych kryteriów, korzystając z załącznika nr 1 do rozporządzenia Prezesa Rady Ministrów z dnia 4 kwietnia 2016 r. w sprawie warunków i sposobu przeprowadzania ocen okresowych urzędników służby cywilnej i pracowników służby cywilnej.",
        "W trakcie rozmowy omawiane są: 1) główne obowiązki wynikające z opisu stanowiska pracy zajmowanego przez ocenianego, 2) kryteria obowiązkowe i kryteria dodatkowe, jeżeli są wybierane przez oceniającego, 3) oczekiwania oceniającego co do sposobu spełniania kryteriów oceny przez ocenianego, 4) cele do osiągnięcia w okresie, w którym oceniany podlega ocenie, jeżeli ich określenie jest uzasadnione ze względu na charakter obowiązków wynikających z opisu stanowiska pracy zajmowanego przez ocenianego, a także sposób realizacji wyznaczonych celów.",
        "W trakcie rozmowy oceniającej omawia się: 1) główne obowiązki wykonywane przez ocenianego w okresie, w którym podlegał ocenie, oraz sposób ich realizacji, z uwzględnieniem spełniania przez ocenianego ustalonych kryteriów oceny, 2) sposób realizowania przez ocenianego celów do osiągnięcia w okresie, w którym oceniany podlegał ocenie, jeżeli cele te zostały wyznaczone, 3) kierunki dalszego rozwoju zawodowego i potrzeby ocenianego w zakresie podnoszenia kwalifikacji i doskonalenia umiejętności.",
        "Data „od” oznacza datę zapoznania ocenianego z kryteriami oceny – z części I arkusza oceny.",
        "Data „do” oznacza datę sporządzenia oceny na piśmie. Jeżeli ocena okresowa jest sporządzana w związku z zastosowaniem art. 81 ust. 6 ustawy z dnia 21 listopada 2008 r. o służbie cywilnej (Dz. U. z 2014 r. poz. 1111, z późn. zm.) i nie została sporządzona przed zmianą stanowiska pracy, należy w tym polu wpisać ostatni dzień pracy na zajmowanym stanowisku pracy.",
        "Należy wstawić znak „X” w odpowiednie pole.",
        "Należy wpisać nazwy wybranych kryteriów, korzystając z załącznika nr 1 do rozporządzenia Prezesa Rady Ministrów z dnia 4 kwietnia 2016 r. w sprawie warunków i sposobu przeprowadzania ocen okresowych urzędników służby cywilnej i pracowników służby cywilnej.",
        "POZYTYWNA – w przypadku ustalenia ogólnego poziomu spełniania kryteriów oceny na poziomie „znacznie powyżej oczekiwań”, „powyżej oczekiwań” albo „na poziomie oczekiwań”, pod warunkiem nieuzyskania przez ocenianego żadnej z ocen cząstkowych na poziomie „znacznie poniżej oczekiwań”.",
        "NEGATYWNA – w przypadku ustalenia ogólnego poziomu spełniania kryteriów oceny na poziomie „poniżej oczekiwań” albo „znacznie poniżej oczekiwań”, a także w przypadku uzyskania przez ocenianego co najmniej jednej oceny cząstkowej na poziomie „znacznie poniżej oczekiwań”.",
        "Uzasadnienie jest obligatoryjne w przypadku otrzymania przez ocenianego negatywnej oceny okresowej. W przypadku przyznania oceny pozytywnej uzasadnienie jest fakultatywne. Sporządzenie uzasadnienia oceny może polegać na ogólnym omówieniu oceny lub na szczegółowym odniesieniu się do wszystkich ocen cząstkowych albo tylko do niektórych z nich.",
        "Uwzględniając sporządzoną ocenę, realizowane i przyszłe zadania oraz oczekiwania ocenianego, należy określić kierunki rozwoju zawodowego ocenianego, biorąc pod uwagę obszary wiedzy i umiejętności wymagające doskonalenia, oraz zaproponować optymalne formy i metody ich realizacji.",
        "Należy wpisać „pozytywna” lub „negatywna”.",
        "Należy wpisać, na jakim poziomie była przyznana poprzednia ocena okresowa (np. „na poziomie oczekiwań”).",
        "Należy wstawić znak „X” w odpowiednie pole.",
        "W urzędzie, w którym przepisy nie przewidują tworzenia stanowiska dyrektora generalnego urzędu, sprzeciw składa się do kierownika tego urzędu.",
        "Części III nie drukuje się i nie dołącza do arkusza oceny okresowej w przypadku ocenianego będącego pracownikiem służby cywilnej oraz w razie nieskładania wniosku o przyznanie urzędnikowi służby cywilnej kolejnego stopnia służbowego.",
    ];

    private static readonly string[] FirstNotes =
    [
        "W przypadku ocenianego zatrudnionego w celu zastępstwa nieobecnego członka korpusu służby cywilnej – data ustalenia przez strony stosunku pracy, że oceniany będzie podlegać pierwszej ocenie.",
        "W trakcie rozmowy oceniającej omawiane są: postawa ocenianego, jego zaangażowanie i postępy w pracy, relacje ze współpracownikami oraz terminowość wykonywania zadań, oceniane za pomocą elementów oceny, wynik egzaminu ze służby przygotowawczej, jeżeli oceniany był obowiązany do przystąpienia do tego egzaminu, sprawozdanie sporządzone przez ocenianego. Można również omówić kierunki dalszego rozwoju zawodowego i potrzeby ocenianego.",
        "Opisy elementów oceny są określone w załączniku nr 1 do rozporządzenia Prezesa Rady Ministrów z dnia 23 lipca 2015 r. w sprawie szczegółowych warunków i sposobu dokonywania pierwszej oceny w służbie cywilnej (Dz. U. poz. 1144).",
        "Ocena łączna jest średnią arytmetyczną ze wszystkich ocen cząstkowych.",
        "Nie dotyczy ocenianego będącego: absolwentem Krajowej Szkoły Administracji Publicznej, który nie złożył wniosku o mianowanie w służbie cywilnej, pracownikiem służby cywilnej zatrudnionym w celu zastępstwa nieobecnego członka korpusu służby cywilnej, podlegającym pierwszej ocenie, pracownikiem służby cywilnej zatrudnionym na wyższym stanowisku w służbie cywilnej.",
        "Pozytywną pierwszą ocenę należy przyznać ocenianemu, który łącznie spełnił następujące warunki: zaliczył egzamin ze służby przygotowawczej, chyba że nie dotyczył go obowiązek przystąpienia do tego egzaminu, złożył sprawozdanie w wyznaczonym terminie, uzyskał nie więcej niż jedną ocenę cząstkową w wysokości 3 punktów za postawę ocenianego, jego zaangażowanie i postępy w pracy, relacje ze współpracownikami oraz terminowość wykonywania zadań, uzyskał ocenę łączną nie niższą niż 5 punktów za postawę ocenianego, jego zaangażowanie i postępy w pracy, relacje ze współpracownikami oraz terminowość wykonywania zadań.",
        "W przypadku przyznania negatywnej pierwszej oceny uzasadnienie przyznanej oceny jest obowiązkowe, a w przypadku przyznania pozytywnej pierwszej oceny – fakultatywne. Uzasadnienie przyznanej oceny może polegać na ogólnym omówieniu oceny lub na szczegółowym odniesieniu się do wszystkich ocen cząstkowych albo tylko do niektórych z nich.",
        "Wnioski dotyczące rozwoju zawodowego ocenianego sporządza się fakultatywnie – tylko w przypadku przyznania pozytywnej pierwszej oceny. Określa się m.in. zakres wiedzy, która powinna być poszerzona, zakres umiejętności, które wymagają doskonalenia, oraz proponowane formy rozwoju zawodowego ocenianego.",
    ];

    private static readonly string[] ReportNotes =
    [
        "Należy opisać zadania z opisu stanowiska pracy i ewentualnie inne istotne zadania, które oceniany wykonywał w trakcie przepracowanego okresu, problemy, z którymi oceniany spotkał się przy wykonywaniu zadań, i sposób ich rozwiązania, a także zdobyte nowe umiejętności i wiedzę oraz wnioski dotyczące usprawnienia sposobu wykonywania zadań.",
    ];

    // ------------------------------------------------------------------ Dane arkusza

    private sealed record Person(string FirstName, string LastName, string Department, string Position)
    {
        public string FullName => $"{FirstName} {LastName}".Trim();
    }

    /// <summary>Wartości pól po kluczach szablonu, w postaci do druku; pola liczone uzupełnione wyliczeniem, gdy nie są zapisane.</summary>
    private sealed class SheetData
    {
        private readonly TemplateSchema schema;
        private readonly AnswerSet answers;
        private readonly Dictionary<string, SheetSignature> signatures;
        private readonly Dictionary<string, FieldDefinition> fields;

        public SheetData(TemplateSchema schema, IEnumerable<AnswerDto> stored, IReadOnlyList<SheetSignature> signatures)
        {
            this.schema = schema;
            answers = new AnswerSet(stored);
            foreach (var computed in EvaluationScoring.ComputedAnswers(schema, EvaluationScoring.Compute(schema, answers)))
            {
                if (answers.Get(computed.FieldKey) is null && (computed.ValueText is not null || computed.ValueNumber is not null))
                {
                    answers.Set(computed);
                }
            }

            this.signatures = signatures.ToDictionary(s => s.FieldKey);
            fields = schema.Sections.SelectMany(s => s.Fields).ToDictionary(f => f.Key);
            Levels = EvaluationScoring.Rules(schema)?.Levels ?? [];
        }

        public IReadOnlyList<LevelRule> Levels { get; }

        public string Text(string field) => answers.Text(field) ?? "";

        public string Date(string field) => answers.Get(field)?.ValueDate?.ToString("dd.MM.yyyy", CultureInfo.InvariantCulture) ?? "";

        public string Year(string field) => answers.Get(field)?.ValueNumber?.ToString("0", CultureInfo.InvariantCulture) ?? "";

        public string Average(string field) => answers.Get(field)?.ValueNumber?.ToString("0.00", CultureInfo.GetCultureInfo("pl-PL")) ?? "";

        public (string From, string To) Range(string field)
        {
            var answer = answers.Get(field);
            return (answer?.ValueDate?.ToString("dd.MM.yyyy", CultureInfo.InvariantCulture) ?? "",
                answer?.ValueDateTo?.ToString("dd.MM.yyyy", CultureInfo.InvariantCulture) ?? "");
        }

        public string RangeText(string field)
        {
            var (from, to) = Range(field);
            return from.Length == 0 && to.Length == 0 ? "" : $"od {from} – do {to}";
        }

        public Person Person(string field) => new(
            answers.Text(field, "firstName") ?? "",
            answers.Text(field, "lastName") ?? "",
            answers.Text(field, "department") ?? "",
            answers.Text(field, "position") ?? "");

        public SheetSignature? Signature(string field) => signatures.GetValueOrDefault(field);

        public decimal? Score(string field, string item) => answers.Get(field, item)?.ValueNumber;

        public IReadOnlyList<ScaleOption> ScaleOf(string field) =>
            fields.TryGetValue(field, out var f) ? EvaluationScoring.Scale(schema, f) : [];

        public IReadOnlyList<ScoreItem> ScoreItems(string field) =>
            fields.TryGetValue(field, out var f) ? EvaluationScoring.Items(schema, f, answers) : [];

        /// <summary>Kryteria obowiązkowe (wszystkie ze wzoru) i dodatkowe wybrane przez oceniającego.</summary>
        public (IReadOnlyList<ScoreItem> Mandatory, IReadOnlyList<ScoreItem> Additional) Criteria(string field)
        {
            if (!fields.TryGetValue(field, out var selection))
            {
                return ([], []);
            }

            var mandatory = (selection.ExtraArray("mandatory") ?? [])
                .Select(m => new ScoreItem(m.GetProperty("key").GetString()!, m.GetProperty("label").GetString()!))
                .ToList();
            var keys = mandatory.Select(m => m.Key).ToHashSet();
            return (mandatory, EvaluationScoring.Criteria(schema, selection, answers).Where(c => !keys.Contains(c.Key)).ToList());
        }
    }
}
