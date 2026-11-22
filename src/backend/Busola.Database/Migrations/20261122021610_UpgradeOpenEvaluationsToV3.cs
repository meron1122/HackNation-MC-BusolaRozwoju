using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Busola.Database.Migrations
{
    /// <summary>
    /// Poprawka danych (bez zmian schematu):
    /// 1) Otwarte oceny na szablonach v2 przechodzą na v3 tego samego kodu (Id 4→7, 5→8, 6→9). v3 ma te same sekcje
    ///    i pola co v2, dochodzą tylko metadane (fazy, etap samooceny, paragrafy, terminy), więc wpisy zostają ważne.
    ///    Oceny zamknięte zostają na swojej wersji — to już dokumenty.
    /// 2) Sprawozdanie pierwszej oceny zamknięte przez oceniającego przed poprawką (bez przekazanej samooceny), gdy
    ///    rozmowa oceniająca jeszcze trwa, wraca do „w toku” — oceniany może je złożyć, a po terminie oceniający oznaczy je
    ///    jako niezłożone.
    /// Nieodwracalne: Down nic nie robi.
    /// </summary>
    public partial class UpgradeOpenEvaluationsToV3 : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                UPDATE evaluations
                SET template_id = CASE template_id WHEN 4 THEN 7 WHEN 5 THEN 8 WHEN 6 THEN 9 END
                WHERE template_id IN (4, 5, 6)
                  AND status NOT IN ('completed', 'objection_filed', 'cancelled');
                """);

            migrationBuilder.Sql("""
                WITH reopened AS (
                    UPDATE evaluation_stages s
                    SET status = 'Pending', completed_on = NULL
                    FROM evaluations e
                    WHERE s.evaluation_id = e.id
                      AND e.template_id = 7
                      AND s.stage_key = 'report'
                      AND s.status = 'Completed'
                      AND NOT EXISTS (SELECT 1 FROM evaluation_self_assessments a
                                      WHERE a.evaluation_id = e.id AND a.submitted_at IS NOT NULL)
                      AND EXISTS (SELECT 1 FROM evaluation_stages ev
                                  WHERE ev.evaluation_id = e.id AND ev.stage_key = 'evaluation' AND ev.status = 'Pending')
                    RETURNING s.evaluation_id
                )
                UPDATE evaluations
                SET status = 'interview_done'
                WHERE id IN (SELECT evaluation_id FROM reopened) AND status = 'report_submitted';
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
        }
    }
}
