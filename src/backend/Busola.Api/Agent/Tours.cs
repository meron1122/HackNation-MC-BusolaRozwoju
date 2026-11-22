namespace Busola.Api.Agent;

/// <summary>
/// Prowadzenia po interfejsie, które front umie uruchomić (src/frontend/src/assistant/tours.ts — te same ID i tytuły).
/// Asystent widzi tylko te pasujące do ekranu i wstawia znacznik [[prowadzenie:ID]]; front zamienia go na „Pokaż mi”.
/// </summary>
public static class Tours
{
    private sealed record Tour(string Id, string Title, string[] Pages, string? StepContains = null);

    private static readonly Tour[] All =
    [
        new("pulpit", "Pulpit: od czego zacząć dzień", ["dashboard"]),
        new("kryteria", "Jak wybrać kryteria oceny", ["evaluations"], "kryteri"),
        new("ocena", "Jak przejść przez ocenę", ["evaluations"]),
        new("profil", "Profil pracownika", ["profile", "my-profile"]),
        new("nawigacja", "Gdzie co jest w Busoli", ["*"]),
    ];

    public static string Describe(ScreenContext? screen)
    {
        var page = screen?.EvaluationId is not null ? "evaluations" : screen?.Page ?? "";
        var step = screen?.Step ?? "";
        var available = All
            .Where(t => (t.Pages.Contains(page) || t.Pages.Contains("*"))
                && (t.StepContains is null || step.Contains(t.StepContains, StringComparison.OrdinalIgnoreCase)))
            .Select(t => $"- {t.Id}: {t.Title}");
        return "Prowadzenia po interfejsie dostępne na tym ekranie (ID: tytuł):\n" + string.Join('\n', available);
    }
}
