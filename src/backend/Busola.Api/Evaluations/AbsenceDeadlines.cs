using System.Globalization;
using Busola.Database;
using Busola.Database.Entities;
using Busola.Database.EvaluationTemplates;
using Microsoft.EntityFrameworkCore;

namespace Busola.Api.Evaluations;

/// <summary>Wpis nieobecności do liczenia terminów (End = null — trwa).</summary>
public sealed record AbsencePeriod(DateOnly Start, DateOnly? End, AbsenceKind Kind, string Reason);

/// <summary>Nieprzerwana nieobecność złożona z jednego albo kilku wpisów (End = null — trwa).</summary>
public sealed record AbsenceBlock(DateOnly Start, DateOnly? End, IReadOnlyList<string> Reasons)
{
    public DateOnly EndOr(DateOnly today) => End ?? today;

    public string Text => $"{Start:dd.MM.yyyy}–{(End is { } end ? end.ToString("dd.MM.yyyy", CultureInfo.InvariantCulture) : "trwa")}";
}

/// <summary>
/// Nieobecności a terminy ocen. Ocena okresowa: usprawiedliwiona nieobecność trwająca nieprzerwanie dłużej niż miesiąc
/// przedłuża 24-miesięczny termin o cały jej czas, z mocy prawa (art. 81 ust. 7 ustawy). Pierwsza ocena: przełożony może
/// wyznaczyć nowy termin sprawozdania, przedłużając go o okres nieobecności (§ 5 ust. 1 rozporządzenia z 2015 r.), a przy
/// nieobecności ponad 3 miesiące — ciągłej albo łącznie w 12-miesięcznym zatrudnieniu — umowę można przedłużyć (art. 35 ust. 4).
/// Źródła: poradniki DSC KPRM (ocena okresowa, pkt 5.1; pierwsza ocena, pkt 4.1 i 4.3).
/// </summary>
public static class AbsenceDeadlines
{
    /// <summary>Suma kilku krótszych nieobecności: miesiąc = 30 dni (art. 114 KC), więc „ponad 3 miesiące” = ponad 90 dni.</summary>
    public const int ContractExtensionDays = 90;

    public static async Task<List<AbsencePeriod>> LoadAsync(BusolaDbContext db, int employeeId, CancellationToken ct) =>
        await db.Absences
            .Where(a => a.EmployeeId == employeeId)
            .Select(a => new AbsencePeriod(a.StartDate, a.EndDate, a.Reason.Kind, a.Reason.Name))
            .ToListAsync(ct);

    /// <summary>
    /// Nieprzerwane nieobecności podanych rodzajów: wpisy łączą się, gdy między nimi są tylko dni wolne (weekend, święto).
    /// Zmiana powodu nie przerywa nieobecności (np. urlop przechodzący w zwolnienie lekarskie).
    /// </summary>
    public static List<AbsenceBlock> Blocks(IEnumerable<AbsencePeriod> absences, Func<AbsenceKind, bool> kinds)
    {
        var blocks = new List<AbsenceBlock>();
        foreach (var a in absences.Where(a => kinds(a.Kind)).OrderBy(a => a.Start))
        {
            if (blocks.Count > 0 && (blocks[^1].End is not { } lastEnd || Continues(lastEnd, a.Start)))
            {
                var last = blocks[^1];
                var end = last.End is null || a.End is null ? null : (DateOnly?)Max(last.End.Value, a.End.Value);
                blocks[^1] = new AbsenceBlock(last.Start, end, last.Reasons.Contains(a.Reason) ? last.Reasons : [.. last.Reasons, a.Reason]);
                continue;
            }

            blocks.Add(new AbsenceBlock(a.Start, a.End, [a.Reason]));
        }

        return blocks;
    }

    /// <summary>
    /// Art. 81 ust. 7: termin oceny okresowej + cały czas każdej usprawiedliwionej nieobecności dłuższej niż miesiąc,
    /// przypadającej od początku okresu oceny do terminu. „Dłużej niż miesiąc” = trwa jeszcze po dniu, który datą odpowiada
    /// pierwszemu dniowi nieobecności (poradnik: od 9.09 miesiąc upływa 9.10). Przedłużony termin może objąć kolejną
    /// nieobecność, więc liczymy do skutku. Koniec w dniu wolnym przesuwa się na dzień roboczy (art. 115 KC).
    /// </summary>
    public static (DateOnly Due, int Days, IReadOnlyList<AbsenceBlock> Counted) ExtendPeriodic(
        DateOnly periodStart, DateOnly baseDue, IReadOnlyList<AbsenceBlock> blocks, DateOnly today)
    {
        var due = baseDue;
        var days = 0;
        List<AbsenceBlock> counted = [];
        for (var i = 0; i < 100; i++)
        {
            counted = blocks
                .Where(b => b.EndOr(today) > b.Start.AddMonths(1) && b.Start <= due && b.EndOr(today) >= periodStart)
                .ToList();
            var total = counted.Sum(b => DaysBetween(Max(b.Start, periodStart), Min(b.EndOr(today), due)));
            if (total == days)
            {
                break;
            }

            days = total;
            due = baseDue.AddDays(days);
        }

        return (days == 0 ? baseDue : PolishCalendar.ToWorkingDay(baseDue.AddDays(days)), days, counted);
    }

    /// <summary>
    /// Art. 35 ust. 4: usprawiedliwione nieobecności w pierwszych 12 miesiącach zatrudnienia — dni łącznie, czy była ciągła
    /// dłuższa niż 3 miesiące i czy przekroczony jest próg (ciągła ponad 3 miesiące albo łącznie ponad 90 dni).
    /// </summary>
    public static (int Days, bool LongContinuous, bool Threshold) FirstYear(DateOnly hireDate, IReadOnlyList<AbsenceBlock> blocks, DateOnly today)
    {
        var yearEnd = hireDate.AddMonths(12).AddDays(-1);
        var inYear = blocks.Where(b => b.Start <= yearEnd && b.EndOr(today) >= hireDate).ToList();
        var days = inYear.Sum(b => DaysBetween(Max(b.Start, hireDate), Min(b.EndOr(today), yearEnd)));
        var longContinuous = inYear.Any(b => b.EndOr(today) > b.Start.AddMonths(3));
        return (days, longContinuous, longContinuous || days > ContractExtensionDays);
    }

    /// <summary>Dni nieobecności przypadające w terminie od–do (podpowiedź nowego terminu sprawozdania, § 5 ust. 1).</summary>
    public static (int Days, IReadOnlyList<AbsenceBlock> Blocks) InWindow(DateOnly from, DateOnly to, IReadOnlyList<AbsenceBlock> blocks, DateOnly today)
    {
        var overlapping = blocks.Where(b => b.Start <= to && b.EndOr(today) >= from).ToList();
        return (overlapping.Sum(b => DaysBetween(Max(b.Start, from), Min(b.EndOr(today), to))), overlapping);
    }

    /// <summary>
    /// Przelicza terminy otwartych ocen okresowych pracownika (art. 81 ust. 7). Pomija ocenę, której termin oceniający
    /// zmienił decyzją (art. 81 ust. 8). Wywoływać po zmianie nieobecności i po każdej zmianie terminu bazowego.
    /// </summary>
    public static async Task RecalculateAsync(BusolaDbContext db, int employeeId, CancellationToken ct)
    {
        var evaluations = await db.Evaluations
            .Include(e => e.Template)
            .Include(e => e.Stages)
            .Where(e => e.EmployeeId == employeeId && e.Template.Kind == EvaluationKind.Periodic)
            .ToListAsync(ct);
        if (evaluations.Count == 0)
        {
            return;
        }

        var ids = evaluations.Select(e => e.Id).ToList();
        var changedByDecision = (await db.EvaluationTermChanges
            .Where(c => ids.Contains(c.EvaluationId) && c.Kind == TermChangeKind.EvaluationTerm)
            .Select(c => c.EvaluationId)
            .ToListAsync(ct)).ToHashSet();
        var blocks = Blocks(await LoadAsync(db, employeeId, ct), k => k == AbsenceKind.Justified);
        var today = DateOnly.FromDateTime(DateTime.Today);

        foreach (var evaluation in evaluations)
        {
            var schema = TemplateSchema.Parse(evaluation.Template.Schema);
            if (EvaluationWorkflow.IsFinal(schema, evaluation.Status) || changedByDecision.Contains(evaluation.Id))
            {
                continue;
            }

            var stageKey = EvaluationScoring.ScoresField(schema) is { } scores ? schema.SectionOf(scores.Key)?.Stage : null;
            var stage = evaluation.Stages.SingleOrDefault(s => s.StageKey == stageKey && s.Status == StageStatus.Pending);
            if (stage is null || (stage.BaseDueTo ?? stage.DueTo) is not { } baseDue)
            {
                continue;
            }

            var (due, days, counted) = ExtendPeriodic(evaluation.StartDate, baseDue, blocks, today);
            if (days > 0)
            {
                stage.BaseDueTo = baseDue;
                stage.DueTo = due;
                var note = $"+{days} dni z mocy prawa (art. 81 ust. 7): nieobecność {string.Join(", ", counted.Select(b => b.Text))}";
                stage.DueNote = note.Length > 500 ? note[..500] : note;
            }
            else if (stage.BaseDueTo is { } original)
            {
                stage.DueTo = original;
                stage.BaseDueTo = null;
                stage.DueNote = null;
            }
        }

        await db.SaveChangesAsync(ct);
    }

    /// <summary>Liczba dni od–do włącznie (0, gdy koniec przed początkiem).</summary>
    public static int DaysBetween(DateOnly from, DateOnly to) => to < from ? 0 : to.DayNumber - from.DayNumber + 1;

    // B jest dalszym ciągiem A, gdy zaczyna się najpóźniej dzień po A albo dzielą je same dni wolne.
    private static bool Continues(DateOnly end, DateOnly nextStart)
    {
        for (var day = end.AddDays(1); day < nextStart; day = day.AddDays(1))
        {
            if (!PolishCalendar.IsDayOff(day))
            {
                return false;
            }
        }

        return true;
    }

    private static DateOnly Max(DateOnly a, DateOnly b) => a > b ? a : b;

    private static DateOnly Min(DateOnly a, DateOnly b) => a < b ? a : b;
}
