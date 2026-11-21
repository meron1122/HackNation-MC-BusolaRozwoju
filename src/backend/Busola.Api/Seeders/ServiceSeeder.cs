using Busola.Database;
using Busola.Database.Entities;
using Microsoft.EntityFrameworkCore;

namespace Busola.Api.Seeders;

/// <summary>
/// Dodaje brakujące służby (po nazwie) i uzupełnia puste logo. Nie nadpisuje logo ustawionego ręcznie.
/// Logotypy z Wikimedia Commons (infoboksy pl.wikipedia), ładowane przez przeglądarkę, nie trzymane w repo.
/// </summary>
public static class ServiceSeeder
{
    private const string Commons = "https://upload.wikimedia.org/wikipedia/commons/";

    private static readonly (string Name, string LogoUrl)[] Services =
    [
        ("Policja", Commons + "5/58/Badge_of_Polish_Police.png"),
        ("Państwowa Straż Pożarna", Commons + "b/b4/Logo-psp-nowe-wrzesien-2017.svg"),
        ("Straż Graniczna", Commons + "2/2e/Logo_Stra%C5%BCy_Granicznej_POL.svg"),
        ("Służba Ochrony Państwa", Commons + "f/f1/SOP_logo_%282018%29.jpg"),
        ("Służba Więzienna", Commons + "7/76/S%C5%82u%C5%BCba_Wi%C4%99zienna_symbol.svg"),
        ("Służba Celno-Skarbowa", Commons + "4/49/PL_emb_KAS_SC-S.png"),
        ("Agencja Bezpieczeństwa Wewnętrznego", Commons + "d/d2/Logo_ABW.svg"),
        ("Agencja Wywiadu", Commons + "6/6f/Logo_Agencji_Wywiadu.png"),
        ("Centralne Biuro Antykorupcyjne", Commons + "7/76/CBA_logo.png"),
    ];

    public static async Task SeedAsync(IServiceProvider services)
    {
        await using var scope = services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<BusolaDbContext>();
        var existing = await db.Services.ToDictionaryAsync(s => s.Name);

        foreach (var (name, logoUrl) in Services)
        {
            if (!existing.TryGetValue(name, out var service))
            {
                db.Services.Add(new Service { Name = name, LogoUrl = logoUrl });
            }
            else
            {
                service.LogoUrl ??= logoUrl;
            }
        }

        await db.SaveChangesAsync();
    }
}
