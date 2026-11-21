using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace Busola.Database.Migrations
{
    /// <inheritdoc />
    public partial class AddEvaluations : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "evaluation_templates",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:IdentitySequenceOptions", "'1000', '1', '', '', 'False', '1'")
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    code = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    version = table.Column<int>(type: "integer", nullable: false),
                    kind = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    title = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                    schema = table.Column<string>(type: "jsonb", nullable: false),
                    is_active = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_evaluation_templates", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "evaluations",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    employee_id = table.Column<int>(type: "integer", nullable: false),
                    template_id = table.Column<int>(type: "integer", nullable: false),
                    status = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    start_date = table.Column<DateOnly>(type: "date", nullable: false),
                    evaluator_id = table.Column<int>(type: "integer", nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_evaluations", x => x.id);
                    table.ForeignKey(
                        name: "fk_evaluations_employees_employee_id",
                        column: x => x.employee_id,
                        principalTable: "employees",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_evaluations_employees_evaluator_id",
                        column: x => x.evaluator_id,
                        principalTable: "employees",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_evaluations_evaluation_templates_template_id",
                        column: x => x.template_id,
                        principalTable: "evaluation_templates",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "evaluation_answers",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    evaluation_id = table.Column<int>(type: "integer", nullable: false),
                    field_key = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    item_key = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    value_text = table.Column<string>(type: "text", nullable: true),
                    value_number = table.Column<decimal>(type: "numeric(10,4)", precision: 10, scale: 4, nullable: true),
                    value_date = table.Column<DateOnly>(type: "date", nullable: true),
                    value_date_to = table.Column<DateOnly>(type: "date", nullable: true),
                    updated_by_id = table.Column<string>(type: "text", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_evaluation_answers", x => x.id);
                    table.CheckConstraint("ck_evaluation_answers_date_range", "value_date_to IS NULL OR (value_date IS NOT NULL AND value_date <= value_date_to)");
                    table.CheckConstraint("ck_evaluation_answers_has_value", "value_text IS NOT NULL OR value_number IS NOT NULL OR value_date IS NOT NULL");
                    table.ForeignKey(
                        name: "fk_evaluation_answers_evaluations_evaluation_id",
                        column: x => x.evaluation_id,
                        principalTable: "evaluations",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_evaluation_answers_users_updated_by_id",
                        column: x => x.updated_by_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "evaluation_signatures",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    evaluation_id = table.Column<int>(type: "integer", nullable: false),
                    field_key = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    role = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    signed_by_id = table.Column<string>(type: "text", nullable: false),
                    signer_name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    signed_on = table.Column<DateOnly>(type: "date", nullable: false),
                    place = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    image_content = table.Column<byte[]>(type: "bytea", nullable: true),
                    image_content_type = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    image_sha256 = table.Column<byte[]>(type: "bytea", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_evaluation_signatures", x => x.id);
                    table.CheckConstraint("ck_evaluation_signatures_image_complete", "(image_content IS NULL AND image_content_type IS NULL AND image_sha256 IS NULL) OR (image_content IS NOT NULL AND image_content_type IS NOT NULL AND image_sha256 IS NOT NULL)");
                    table.CheckConstraint("ck_evaluation_signatures_image_content_type", "image_content_type IN ('image/png', 'image/webp')");
                    table.CheckConstraint("ck_evaluation_signatures_image_sha256", "octet_length(image_sha256) = 32");
                    table.CheckConstraint("ck_evaluation_signatures_image_size", "octet_length(image_content) BETWEEN 1 AND 524288");
                    table.ForeignKey(
                        name: "fk_evaluation_signatures_evaluations_evaluation_id",
                        column: x => x.evaluation_id,
                        principalTable: "evaluations",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_evaluation_signatures_users_signed_by_id",
                        column: x => x.signed_by_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "evaluation_stages",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    evaluation_id = table.Column<int>(type: "integer", nullable: false),
                    stage_key = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    due_from = table.Column<DateOnly>(type: "date", nullable: true),
                    due_to = table.Column<DateOnly>(type: "date", nullable: true),
                    completed_on = table.Column<DateOnly>(type: "date", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_evaluation_stages", x => x.id);
                    table.CheckConstraint("ck_evaluation_stages_due_window", "due_from IS NULL OR due_to IS NULL OR due_from <= due_to");
                    table.ForeignKey(
                        name: "fk_evaluation_stages_evaluations_evaluation_id",
                        column: x => x.evaluation_id,
                        principalTable: "evaluations",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.InsertData(
                table: "evaluation_templates",
                columns: new[] { "id", "code", "is_active", "kind", "schema", "title", "version" },
                values: new object[,]
                {
                    { 1, "first", true, "First", "{\"schemaVersion\":1,\"title\":\"Arkusz pierwszej oceny w służbie cywilnej\",\"legalBasis\":\"Rozporządzenie Prezesa Rady Ministrów z dnia 23 lipca 2015 r. w sprawie szczegółowych warunków i sposobu dokonywania pierwszej oceny w służbie cywilnej (Dz. U. poz. 1144), załącznik nr 2\",\"initialStatus\":\"planned\",\"statuses\":[{\"key\":\"planned\",\"label\":\"Zaplanowana\"},{\"key\":\"interview_done\",\"label\":\"Po rozmowie wstępnej\"},{\"key\":\"report_submitted\",\"label\":\"Sprawozdanie złożone\"},{\"key\":\"evaluated\",\"label\":\"Ocena sporządzona\"},{\"key\":\"completed\",\"label\":\"Zakończona\",\"final\":true},{\"key\":\"cancelled\",\"label\":\"Anulowana\",\"final\":true}],\"stages\":[{\"key\":\"initial_interview\",\"title\":\"Rozmowa wstępna\",\"deadline\":{\"anchor\":\"start\",\"latest\":{\"days\":21}},\"completesTo\":\"interview_done\"},{\"key\":\"report\",\"title\":\"Złożenie sprawozdania z zadań realizowanych w przepracowanym okresie\",\"deadline\":{\"anchor\":\"start\",\"latest\":{\"months\":7}},\"completesTo\":\"report_submitted\"},{\"key\":\"evaluation\",\"title\":\"Rozmowa oceniająca i pierwsza ocena\",\"deadline\":{\"anchor\":\"start\",\"earliest\":{\"months\":8},\"latest\":{\"months\":11}},\"completesTo\":\"evaluated\"},{\"key\":\"acknowledgement\",\"title\":\"Zapoznanie ocenianego z pierwszą oceną\",\"completesTo\":\"completed\"}],\"scales\":{\"first\":[{\"value\":3,\"key\":\"below\",\"label\":\"Poniżej oczekiwań\"},{\"value\":5,\"key\":\"meets\",\"label\":\"Na poziomie oczekiwań\"},{\"value\":7,\"key\":\"above\",\"label\":\"Powyżej oczekiwań\"}]},\"scoring\":{\"scores\":\"elements\",\"average\":\"totalScore\",\"result\":\"result\",\"positiveWhen\":[{\"rule\":\"fieldIn\",\"field\":\"exam\",\"values\":[\"yes\",\"not_applicable\"]},{\"rule\":\"fieldIn\",\"field\":\"reportOnTime\",\"values\":[\"yes\"]},{\"rule\":\"maxCountOfScore\",\"score\":3,\"count\":1},{\"rule\":\"minAverage\",\"value\":5}]},\"sections\":[{\"key\":\"general\",\"part\":\"Część ogólna\",\"title\":\"Dane\",\"stage\":\"initial_interview\",\"fields\":[{\"key\":\"office\",\"type\":\"text\",\"label\":\"Nazwa urzędu\",\"required\":true},{\"key\":\"evaluated\",\"type\":\"person\",\"label\":\"Dane ocenianego\",\"role\":\"evaluated\",\"required\":true},{\"key\":\"hireDate\",\"type\":\"date\",\"label\":\"Data nawiązania stosunku pracy\",\"prefill\":\"employee.hireDate\",\"required\":true,\"hint\":\"Przy zastępstwie: data ustalenia przez strony, że oceniany podlega pierwszej ocenie.\"},{\"key\":\"supervisor\",\"type\":\"person\",\"label\":\"Dane bezpośredniego przełożonego\",\"role\":\"supervisor\",\"required\":true},{\"key\":\"unitHead\",\"type\":\"person\",\"label\":\"Dane kierującego komórką organizacyjną\",\"role\":\"unitHead\",\"required\":true}]},{\"key\":\"initial_interview\",\"title\":\"Rozmowa wstępna\",\"stage\":\"initial_interview\",\"fields\":[{\"key\":\"initialInterviewDate\",\"type\":\"date\",\"label\":\"Data przeprowadzenia rozmowy wstępnej\",\"required\":true},{\"key\":\"reportPeriod\",\"type\":\"dateRange\",\"label\":\"Termin wyznaczony na złożenie sprawozdania\",\"prefill\":\"stage:report\",\"required\":true},{\"key\":\"evaluationPeriod\",\"type\":\"dateRange\",\"label\":\"Okres, w którym powinna zostać dokonana pierwsza ocena\",\"prefill\":\"stage:evaluation\",\"required\":true},{\"key\":\"initialInterviewSupervisorSignature\",\"type\":\"signature\",\"role\":\"supervisor\",\"label\":\"Potwierdzenie przeprowadzenia rozmowy wstępnej oraz wyznaczenia terminu na złożenie sprawozdania\"},{\"key\":\"initialInterviewEvaluatedSignature\",\"type\":\"signature\",\"role\":\"evaluated\"}]},{\"key\":\"evaluation_interview\",\"title\":\"Rozmowa oceniająca\",\"stage\":\"evaluation\",\"fields\":[{\"key\":\"evaluationInterviewDate\",\"type\":\"date\",\"label\":\"Data przeprowadzenia rozmowy oceniającej\",\"required\":true},{\"key\":\"evaluationInterviewSupervisorSignature\",\"type\":\"signature\",\"role\":\"supervisor\",\"label\":\"Potwierdzenie przeprowadzenia rozmowy oceniającej i omówienia wszystkich wymaganych zagadnień\"},{\"key\":\"evaluationInterviewEvaluatedSignature\",\"type\":\"signature\",\"role\":\"evaluated\"}]},{\"key\":\"elements\",\"title\":\"Ocena postawy ocenianego, jego zaangażowania i postępów w pracy, relacji ze współpracownikami oraz terminowości wykonywania zadań\",\"stage\":\"evaluation\",\"fields\":[{\"key\":\"elements\",\"type\":\"scores\",\"label\":\"Elementy oceny\",\"scale\":\"first\",\"required\":true,\"items\":[{\"key\":\"reliability\",\"label\":\"Rzetelność\"},{\"key\":\"knowledge\",\"label\":\"Wykorzystywanie wiedzy i doskonalenie zawodowe\"},{\"key\":\"organization\",\"label\":\"Organizacja pracy i orientacja na osiąganie celów\"},{\"key\":\"communication\",\"label\":\"Komunikacja\"},{\"key\":\"cooperation\",\"label\":\"Współpraca\"}]},{\"key\":\"totalScore\",\"type\":\"average\",\"label\":\"Ocena łączna\",\"of\":\"elements\"}]},{\"key\":\"result\",\"title\":\"Pierwsza ocena w służbie cywilnej\",\"stage\":\"evaluation\",\"fields\":[{\"key\":\"exam\",\"type\":\"choice\",\"label\":\"Oceniany zaliczył egzamin ze służby przygotowawczej\",\"required\":true,\"options\":[{\"value\":\"yes\",\"label\":\"Tak\"},{\"value\":\"no\",\"label\":\"Nie\"},{\"value\":\"not_applicable\",\"label\":\"Nie dotyczy\"}]},{\"key\":\"reportOnTime\",\"type\":\"choice\",\"label\":\"Sprawozdanie zostało złożone w wyznaczonym terminie\",\"required\":true,\"options\":[{\"value\":\"yes\",\"label\":\"Tak\"},{\"value\":\"no\",\"label\":\"Nie\"}]},{\"key\":\"result\",\"type\":\"choice\",\"label\":\"Pierwsza ocena w służbie cywilnej\",\"required\":true,\"options\":[{\"value\":\"positive\",\"label\":\"Pozytywna\"},{\"value\":\"negative\",\"label\":\"Negatywna\"}]},{\"key\":\"justification\",\"type\":\"longText\",\"label\":\"Uzasadnienie przyznanej oceny\",\"requiredWhen\":{\"field\":\"result\",\"in\":[\"negative\"]}},{\"key\":\"developmentConclusions\",\"type\":\"longText\",\"label\":\"Wnioski dotyczące rozwoju zawodowego ocenianego\",\"visibleWhen\":{\"field\":\"result\",\"in\":[\"positive\"]}}]},{\"key\":\"confirmation\",\"title\":\"Potwierdzenie dokonania pierwszej oceny w służbie cywilnej\",\"stage\":\"evaluation\",\"fields\":[{\"key\":\"confirmationSupervisorSignature\",\"type\":\"signature\",\"role\":\"supervisor\"},{\"key\":\"confirmationUnitHeadSignature\",\"type\":\"signature\",\"role\":\"unitHead\"}]},{\"key\":\"acknowledgement\",\"title\":\"Zapoznanie z oceną\",\"stage\":\"acknowledgement\",\"fields\":[{\"key\":\"acknowledgementSignature\",\"type\":\"signature\",\"role\":\"evaluated\",\"label\":\"Zapoznałam(-łem) się z pierwszą oceną w służbie cywilnej.\"}]}]}", "Arkusz pierwszej oceny w służbie cywilnej", 1 },
                    { 2, "periodic-b", true, "Periodic", "{\"schemaVersion\":1,\"title\":\"Arkusz B – ocena okresowa urzędnika służby cywilnej lub pracownika służby cywilnej\",\"appliesTo\":\"Stanowiska, na których praca polega na bezpośrednim kierowaniu pracownikami.\",\"legalBasis\":\"Rozporządzenie Prezesa Rady Ministrów z dnia 4 kwietnia 2016 r. w sprawie warunków i sposobu przeprowadzania ocen okresowych urzędników służby cywilnej i pracowników służby cywilnej (Dz. U. poz. 470), załącznik nr 3\",\"initialStatus\":\"planned\",\"statuses\":[{\"key\":\"planned\",\"label\":\"Zaplanowana\"},{\"key\":\"criteria_set\",\"label\":\"Kryteria ustalone\"},{\"key\":\"evaluated\",\"label\":\"Ocena sporządzona\"},{\"key\":\"completed\",\"label\":\"Zakończona\",\"final\":true},{\"key\":\"objection_filed\",\"label\":\"Złożono sprzeciw\",\"final\":true},{\"key\":\"cancelled\",\"label\":\"Anulowana\",\"final\":true}],\"stages\":[{\"key\":\"criteria\",\"title\":\"Ustalenie kryteriów oceny i zapoznanie z nimi ocenianego\",\"deadline\":{\"anchor\":\"start\",\"latest\":{\"days\":30}},\"completesTo\":\"criteria_set\"},{\"key\":\"evaluation\",\"title\":\"Rozmowa oceniająca i sporządzenie oceny\",\"deadline\":{\"anchor\":\"start\",\"latest\":{\"months\":24}},\"completesTo\":\"evaluated\"},{\"key\":\"acknowledgement\",\"title\":\"Zapoznanie ocenianego z oceną\",\"completesTo\":\"completed\"},{\"key\":\"objection\",\"title\":\"Sprzeciw do dyrektora generalnego urzędu\",\"optional\":true,\"deadline\":{\"anchor\":\"stage:acknowledgement\",\"latest\":{\"days\":7}},\"completesTo\":\"objection_filed\"}],\"scales\":{\"periodic\":[{\"value\":1,\"key\":\"far_below\",\"label\":\"Znacznie poniżej oczekiwań\"},{\"value\":3,\"key\":\"below\",\"label\":\"Poniżej oczekiwań\"},{\"value\":5,\"key\":\"meets\",\"label\":\"Na poziomie oczekiwań\"},{\"value\":7,\"key\":\"above\",\"label\":\"Powyżej oczekiwań\"},{\"value\":9,\"key\":\"far_above\",\"label\":\"Znacznie powyżej oczekiwań\"}]},\"scoring\":{\"scores\":\"scores\",\"average\":\"averageScore\",\"level\":\"level\",\"result\":\"result\",\"levels\":[{\"key\":\"far_below\",\"label\":\"Znacznie poniżej oczekiwań\",\"min\":1,\"max\":2},{\"key\":\"below\",\"label\":\"Poniżej oczekiwań\",\"minExclusive\":2,\"max\":4},{\"key\":\"meets\",\"label\":\"Na poziomie oczekiwań\",\"minExclusive\":4,\"max\":6},{\"key\":\"above\",\"label\":\"Powyżej oczekiwań\",\"minExclusive\":6,\"max\":8},{\"key\":\"far_above\",\"label\":\"Znacznie powyżej oczekiwań\",\"minExclusive\":8,\"max\":9}],\"positiveWhen\":[{\"rule\":\"levelIn\",\"values\":[\"meets\",\"above\",\"far_above\"]},{\"rule\":\"maxCountOfScore\",\"score\":1,\"count\":0}]},\"sections\":[{\"key\":\"part1_general\",\"part\":\"Część I\",\"title\":\"Dane\",\"stage\":\"criteria\",\"fields\":[{\"key\":\"office\",\"type\":\"text\",\"label\":\"Nazwa urzędu\",\"required\":true},{\"key\":\"evaluated\",\"type\":\"person\",\"label\":\"Dane ocenianego\",\"role\":\"evaluated\",\"required\":true,\"hint\":\"Pełna nazwa stanowiska wraz z rozszerzeniem z opisu stanowiska pracy.\"},{\"key\":\"evaluator\",\"type\":\"person\",\"label\":\"Dane oceniającego\",\"role\":\"evaluator\",\"required\":true}]},{\"key\":\"part1_criteria\",\"part\":\"Część I\",\"title\":\"Kryteria oceny i termin sporządzenia oceny\",\"stage\":\"criteria\",\"fields\":[{\"key\":\"criteria\",\"type\":\"criteriaSelection\",\"label\":\"Kryteria oceny\",\"required\":true,\"mandatory\":[{\"key\":\"people_management\",\"label\":\"Zarządzanie ludźmi\"},{\"key\":\"decisions\",\"label\":\"Podejmowanie decyzji i odpowiedzialność\"},{\"key\":\"organization\",\"label\":\"Organizacja pracy i orientacja na osiąganie celów\"},{\"key\":\"cooperation\",\"label\":\"Współpraca\"},{\"key\":\"communication\",\"label\":\"Komunikacja\"}],\"additional\":{\"max\":3,\"catalog\":\"Załącznik nr 1 do rozporządzenia Prezesa Rady Ministrów z dnia 4 kwietnia 2016 r.\"}},{\"key\":\"evaluationDueDate\",\"type\":\"date\",\"label\":\"Termin sporządzenia oceny\",\"prefill\":\"stage:evaluation\",\"required\":true},{\"key\":\"criteriaEvaluatorSignature\",\"type\":\"signature\",\"role\":\"evaluator\",\"label\":\"Potwierdzenie przeprowadzenia rozmowy (§ 5 ust. 1 rozporządzenia) i zapoznania ocenianego z kryteriami oceny oraz terminem sporządzenia oceny\"},{\"key\":\"criteriaEvaluatedSignature\",\"type\":\"signature\",\"role\":\"evaluated\"}]},{\"key\":\"part2_interview\",\"part\":\"Część II\",\"title\":\"Rozmowa oceniająca\",\"stage\":\"evaluation\",\"fields\":[{\"key\":\"evaluationInterviewDate\",\"type\":\"date\",\"label\":\"Data przeprowadzenia rozmowy oceniającej\",\"required\":true},{\"key\":\"evaluationPeriod\",\"type\":\"dateRange\",\"label\":\"Okres, w którym oceniany podlegał ocenie\",\"required\":true,\"hint\":\"Od: data zapoznania z kryteriami (część I). Do: data sporządzenia oceny na piśmie.\"}]},{\"key\":\"part2_scores\",\"part\":\"Część II\",\"title\":\"Oceny cząstkowe\",\"stage\":\"evaluation\",\"fields\":[{\"key\":\"scores\",\"type\":\"scores\",\"label\":\"Kryteria obowiązkowe i dodatkowe\",\"scale\":\"periodic\",\"itemsFrom\":\"criteria\",\"required\":true},{\"key\":\"averageScore\",\"type\":\"average\",\"label\":\"Średnia arytmetyczna z ocen cząstkowych\",\"of\":\"scores\"}]},{\"key\":\"part2_result\",\"part\":\"Część II\",\"title\":\"Przyznanie oceny\",\"stage\":\"evaluation\",\"fields\":[{\"key\":\"level\",\"type\":\"level\",\"label\":\"Ogólny poziom spełnienia kryteriów oceny\",\"of\":\"averageScore\"},{\"key\":\"result\",\"type\":\"choice\",\"label\":\"Ocena okresowa w służbie cywilnej\",\"required\":true,\"options\":[{\"value\":\"positive\",\"label\":\"Pozytywna\"},{\"value\":\"negative\",\"label\":\"Negatywna\"}]},{\"key\":\"justification\",\"type\":\"longText\",\"label\":\"Uzasadnienie przyznanej oceny okresowej\",\"requiredWhen\":{\"field\":\"result\",\"in\":[\"negative\"]}},{\"key\":\"developmentConclusions\",\"type\":\"longText\",\"label\":\"Wnioski dotyczące indywidualnego programu rozwoju zawodowego\",\"required\":true}]},{\"key\":\"part2_previous\",\"part\":\"Część II\",\"title\":\"Dane dotyczące poprzedniej oceny okresowej urzędnika służby cywilnej\",\"stage\":\"evaluation\",\"fields\":[{\"key\":\"previousResult\",\"type\":\"choice\",\"label\":\"Ocena\",\"options\":[{\"value\":\"positive\",\"label\":\"Pozytywna\"},{\"value\":\"negative\",\"label\":\"Negatywna\"}]},{\"key\":\"previousLevel\",\"type\":\"choice\",\"label\":\"Poziom\",\"optionsFrom\":\"scoring.levels\"},{\"key\":\"previousDate\",\"type\":\"date\",\"label\":\"Data sporządzenia\"}]},{\"key\":\"part2_promotion\",\"part\":\"Część II\",\"title\":\"Wniosek o kolejny stopień służbowy\",\"stage\":\"evaluation\",\"fields\":[{\"key\":\"promotionRequest\",\"type\":\"choice\",\"label\":\"Czy do oceny okresowej dołączono wniosek o przyznanie kolejnego stopnia służbowego?\",\"required\":true,\"options\":[{\"value\":\"yes\",\"label\":\"Tak\"},{\"value\":\"no\",\"label\":\"Nie\"},{\"value\":\"not_applicable\",\"label\":\"Nie dotyczy (oceniany jest pracownikiem służby cywilnej)\"}]}]},{\"key\":\"part2_signature\",\"part\":\"Część II\",\"title\":\"Oceniający\",\"stage\":\"evaluation\",\"fields\":[{\"key\":\"finalEvaluator\",\"type\":\"person\",\"label\":\"Dane oceniającego\",\"role\":\"evaluator\",\"required\":true},{\"key\":\"evaluationEvaluatorSignature\",\"type\":\"signature\",\"role\":\"evaluator\"}]},{\"key\":\"acknowledgement\",\"part\":\"Część II\",\"title\":\"Zapoznanie z oceną\",\"stage\":\"acknowledgement\",\"fields\":[{\"key\":\"acknowledgementSignature\",\"type\":\"signature\",\"role\":\"evaluated\",\"label\":\"Przeprowadzono ze mną rozmowę oceniającą oraz zapoznałem(-łam) się z oceną okresową i wnioskami dotyczącymi indywidualnego programu rozwoju zawodowego.\"},{\"key\":\"objectionNotice\",\"type\":\"notice\",\"label\":\"Zgodnie z art. 83 ust. 1 ustawy z dnia 21 listopada 2008 r. o służbie cywilnej od oceny okresowej służy, w terminie 7 dni od dnia zapoznania się z oceną, sprzeciw do dyrektora generalnego urzędu.\"}]},{\"key\":\"part3_promotion\",\"part\":\"Część III\",\"title\":\"Wniosek o przyznanie urzędnikowi służby cywilnej kolejnego stopnia służbowego (art. 89 ust. 1 ustawy)\",\"stage\":\"evaluation\",\"visibleWhen\":{\"field\":\"promotionRequest\",\"in\":[\"yes\"]},\"fields\":[{\"key\":\"civilServant\",\"type\":\"person\",\"label\":\"Dane urzędnika służby cywilnej\",\"role\":\"evaluated\",\"required\":true},{\"key\":\"appointmentYear\",\"type\":\"year\",\"label\":\"Rok mianowania\",\"required\":true},{\"key\":\"currentRank\",\"type\":\"text\",\"label\":\"Posiadany stopień służbowy\",\"required\":true},{\"key\":\"currentRankDate\",\"type\":\"date\",\"label\":\"Data przyznania stopnia służbowego\",\"required\":true},{\"key\":\"requestedRank\",\"type\":\"text\",\"label\":\"Wnioskowany stopień służbowy\",\"required\":true},{\"key\":\"promotionMotivation\",\"type\":\"longText\",\"label\":\"Umotywowanie wniosku\",\"required\":true},{\"key\":\"promotionEvaluatorSignature\",\"type\":\"signature\",\"role\":\"evaluator\"}]}]}", "Arkusz B – ocena okresowa urzędnika służby cywilnej lub pracownika służby cywilnej", 1 },
                    { 3, "periodic-c", true, "Periodic", "{\"schemaVersion\":1,\"title\":\"Arkusz C – ocena okresowa urzędnika służby cywilnej lub pracownika służby cywilnej\",\"appliesTo\":\"Stanowiska, które nie są stanowiskiem kierownika urzędu ani stanowiskiem, na którym praca polega na bezpośrednim kierowaniu pracownikami.\",\"legalBasis\":\"Rozporządzenie Prezesa Rady Ministrów z dnia 4 kwietnia 2016 r. w sprawie warunków i sposobu przeprowadzania ocen okresowych urzędników służby cywilnej i pracowników służby cywilnej (Dz. U. poz. 470), załącznik nr 4\",\"initialStatus\":\"planned\",\"statuses\":[{\"key\":\"planned\",\"label\":\"Zaplanowana\"},{\"key\":\"criteria_set\",\"label\":\"Kryteria ustalone\"},{\"key\":\"evaluated\",\"label\":\"Ocena sporządzona\"},{\"key\":\"completed\",\"label\":\"Zakończona\",\"final\":true},{\"key\":\"objection_filed\",\"label\":\"Złożono sprzeciw\",\"final\":true},{\"key\":\"cancelled\",\"label\":\"Anulowana\",\"final\":true}],\"stages\":[{\"key\":\"criteria\",\"title\":\"Ustalenie kryteriów oceny i zapoznanie z nimi ocenianego\",\"deadline\":{\"anchor\":\"start\",\"latest\":{\"days\":30}},\"completesTo\":\"criteria_set\"},{\"key\":\"evaluation\",\"title\":\"Rozmowa oceniająca i sporządzenie oceny\",\"deadline\":{\"anchor\":\"start\",\"latest\":{\"months\":24}},\"completesTo\":\"evaluated\"},{\"key\":\"acknowledgement\",\"title\":\"Zapoznanie ocenianego z oceną\",\"completesTo\":\"completed\"},{\"key\":\"objection\",\"title\":\"Sprzeciw do dyrektora generalnego urzędu\",\"optional\":true,\"deadline\":{\"anchor\":\"stage:acknowledgement\",\"latest\":{\"days\":7}},\"completesTo\":\"objection_filed\"}],\"scales\":{\"periodic\":[{\"value\":1,\"key\":\"far_below\",\"label\":\"Znacznie poniżej oczekiwań\"},{\"value\":3,\"key\":\"below\",\"label\":\"Poniżej oczekiwań\"},{\"value\":5,\"key\":\"meets\",\"label\":\"Na poziomie oczekiwań\"},{\"value\":7,\"key\":\"above\",\"label\":\"Powyżej oczekiwań\"},{\"value\":9,\"key\":\"far_above\",\"label\":\"Znacznie powyżej oczekiwań\"}]},\"scoring\":{\"scores\":\"scores\",\"average\":\"averageScore\",\"level\":\"level\",\"result\":\"result\",\"levels\":[{\"key\":\"far_below\",\"label\":\"Znacznie poniżej oczekiwań\",\"min\":1,\"max\":2},{\"key\":\"below\",\"label\":\"Poniżej oczekiwań\",\"minExclusive\":2,\"max\":4},{\"key\":\"meets\",\"label\":\"Na poziomie oczekiwań\",\"minExclusive\":4,\"max\":6},{\"key\":\"above\",\"label\":\"Powyżej oczekiwań\",\"minExclusive\":6,\"max\":8},{\"key\":\"far_above\",\"label\":\"Znacznie powyżej oczekiwań\",\"minExclusive\":8,\"max\":9}],\"positiveWhen\":[{\"rule\":\"levelIn\",\"values\":[\"meets\",\"above\",\"far_above\"]},{\"rule\":\"maxCountOfScore\",\"score\":1,\"count\":0}]},\"sections\":[{\"key\":\"part1_general\",\"part\":\"Część I\",\"title\":\"Dane\",\"stage\":\"criteria\",\"fields\":[{\"key\":\"office\",\"type\":\"text\",\"label\":\"Nazwa urzędu\",\"required\":true},{\"key\":\"evaluated\",\"type\":\"person\",\"label\":\"Dane ocenianego\",\"role\":\"evaluated\",\"required\":true,\"hint\":\"Pełna nazwa stanowiska wraz z rozszerzeniem z opisu stanowiska pracy.\"},{\"key\":\"evaluator\",\"type\":\"person\",\"label\":\"Dane oceniającego\",\"role\":\"evaluator\",\"required\":true}]},{\"key\":\"part1_criteria\",\"part\":\"Część I\",\"title\":\"Kryteria oceny i termin sporządzenia oceny\",\"stage\":\"criteria\",\"fields\":[{\"key\":\"criteria\",\"type\":\"criteriaSelection\",\"label\":\"Kryteria oceny\",\"required\":true,\"mandatory\":[{\"key\":\"knowledge\",\"label\":\"Wykorzystywanie wiedzy i doskonalenie zawodowe\"},{\"key\":\"reliability\",\"label\":\"Rzetelność\"},{\"key\":\"organization\",\"label\":\"Organizacja pracy i orientacja na osiąganie celów\"},{\"key\":\"cooperation\",\"label\":\"Współpraca\"},{\"key\":\"communication\",\"label\":\"Komunikacja\"}],\"additional\":{\"max\":3,\"catalog\":\"Załącznik nr 1 do rozporządzenia Prezesa Rady Ministrów z dnia 4 kwietnia 2016 r.\"}},{\"key\":\"evaluationDueDate\",\"type\":\"date\",\"label\":\"Termin sporządzenia oceny\",\"prefill\":\"stage:evaluation\",\"required\":true},{\"key\":\"criteriaEvaluatorSignature\",\"type\":\"signature\",\"role\":\"evaluator\",\"label\":\"Potwierdzenie przeprowadzenia rozmowy (§ 5 ust. 1 rozporządzenia) i zapoznania ocenianego z kryteriami oceny oraz terminem sporządzenia oceny\"},{\"key\":\"criteriaEvaluatedSignature\",\"type\":\"signature\",\"role\":\"evaluated\"}]},{\"key\":\"part2_interview\",\"part\":\"Część II\",\"title\":\"Rozmowa oceniająca\",\"stage\":\"evaluation\",\"fields\":[{\"key\":\"evaluationInterviewDate\",\"type\":\"date\",\"label\":\"Data przeprowadzenia rozmowy oceniającej\",\"required\":true},{\"key\":\"evaluationPeriod\",\"type\":\"dateRange\",\"label\":\"Okres, w którym oceniany podlegał ocenie\",\"required\":true,\"hint\":\"Od: data zapoznania z kryteriami (część I). Do: data sporządzenia oceny na piśmie.\"}]},{\"key\":\"part2_scores\",\"part\":\"Część II\",\"title\":\"Oceny cząstkowe\",\"stage\":\"evaluation\",\"fields\":[{\"key\":\"scores\",\"type\":\"scores\",\"label\":\"Kryteria obowiązkowe i dodatkowe\",\"scale\":\"periodic\",\"itemsFrom\":\"criteria\",\"required\":true},{\"key\":\"averageScore\",\"type\":\"average\",\"label\":\"Średnia arytmetyczna z ocen cząstkowych\",\"of\":\"scores\"}]},{\"key\":\"part2_result\",\"part\":\"Część II\",\"title\":\"Przyznanie oceny\",\"stage\":\"evaluation\",\"fields\":[{\"key\":\"level\",\"type\":\"level\",\"label\":\"Ogólny poziom spełnienia kryteriów oceny\",\"of\":\"averageScore\"},{\"key\":\"result\",\"type\":\"choice\",\"label\":\"Ocena okresowa w służbie cywilnej\",\"required\":true,\"options\":[{\"value\":\"positive\",\"label\":\"Pozytywna\"},{\"value\":\"negative\",\"label\":\"Negatywna\"}]},{\"key\":\"justification\",\"type\":\"longText\",\"label\":\"Uzasadnienie przyznanej oceny okresowej\",\"requiredWhen\":{\"field\":\"result\",\"in\":[\"negative\"]}},{\"key\":\"developmentConclusions\",\"type\":\"longText\",\"label\":\"Wnioski dotyczące indywidualnego programu rozwoju zawodowego\",\"required\":true}]},{\"key\":\"part2_previous\",\"part\":\"Część II\",\"title\":\"Dane dotyczące poprzedniej oceny okresowej urzędnika służby cywilnej\",\"stage\":\"evaluation\",\"fields\":[{\"key\":\"previousResult\",\"type\":\"choice\",\"label\":\"Ocena\",\"options\":[{\"value\":\"positive\",\"label\":\"Pozytywna\"},{\"value\":\"negative\",\"label\":\"Negatywna\"}]},{\"key\":\"previousLevel\",\"type\":\"choice\",\"label\":\"Poziom\",\"optionsFrom\":\"scoring.levels\"},{\"key\":\"previousDate\",\"type\":\"date\",\"label\":\"Data sporządzenia\"}]},{\"key\":\"part2_promotion\",\"part\":\"Część II\",\"title\":\"Wniosek o kolejny stopień służbowy\",\"stage\":\"evaluation\",\"fields\":[{\"key\":\"promotionRequest\",\"type\":\"choice\",\"label\":\"Czy do oceny okresowej dołączono wniosek o przyznanie kolejnego stopnia służbowego?\",\"required\":true,\"options\":[{\"value\":\"yes\",\"label\":\"Tak\"},{\"value\":\"no\",\"label\":\"Nie\"},{\"value\":\"not_applicable\",\"label\":\"Nie dotyczy (oceniany jest pracownikiem służby cywilnej)\"}]}]},{\"key\":\"part2_signature\",\"part\":\"Część II\",\"title\":\"Oceniający\",\"stage\":\"evaluation\",\"fields\":[{\"key\":\"finalEvaluator\",\"type\":\"person\",\"label\":\"Dane oceniającego\",\"role\":\"evaluator\",\"required\":true},{\"key\":\"evaluationEvaluatorSignature\",\"type\":\"signature\",\"role\":\"evaluator\"}]},{\"key\":\"acknowledgement\",\"part\":\"Część II\",\"title\":\"Zapoznanie z oceną\",\"stage\":\"acknowledgement\",\"fields\":[{\"key\":\"acknowledgementSignature\",\"type\":\"signature\",\"role\":\"evaluated\",\"label\":\"Przeprowadzono ze mną rozmowę oceniającą oraz zapoznałem(-łam) się z oceną okresową i wnioskami dotyczącymi indywidualnego programu rozwoju zawodowego.\"},{\"key\":\"objectionNotice\",\"type\":\"notice\",\"label\":\"Zgodnie z art. 83 ust. 1 ustawy z dnia 21 listopada 2008 r. o służbie cywilnej od oceny okresowej służy, w terminie 7 dni od dnia zapoznania się z oceną, sprzeciw do dyrektora generalnego urzędu.\"}]},{\"key\":\"part3_promotion\",\"part\":\"Część III\",\"title\":\"Wniosek o przyznanie urzędnikowi służby cywilnej kolejnego stopnia służbowego (art. 89 ust. 1 ustawy)\",\"stage\":\"evaluation\",\"visibleWhen\":{\"field\":\"promotionRequest\",\"in\":[\"yes\"]},\"fields\":[{\"key\":\"civilServant\",\"type\":\"person\",\"label\":\"Dane urzędnika służby cywilnej\",\"role\":\"evaluated\",\"required\":true},{\"key\":\"appointmentYear\",\"type\":\"year\",\"label\":\"Rok mianowania\",\"required\":true},{\"key\":\"currentRank\",\"type\":\"text\",\"label\":\"Posiadany stopień służbowy\",\"required\":true},{\"key\":\"currentRankDate\",\"type\":\"date\",\"label\":\"Data przyznania stopnia służbowego\",\"required\":true},{\"key\":\"requestedRank\",\"type\":\"text\",\"label\":\"Wnioskowany stopień służbowy\",\"required\":true},{\"key\":\"promotionMotivation\",\"type\":\"longText\",\"label\":\"Umotywowanie wniosku\",\"required\":true},{\"key\":\"promotionEvaluatorSignature\",\"type\":\"signature\",\"role\":\"evaluator\"}]}]}", "Arkusz C – ocena okresowa urzędnika służby cywilnej lub pracownika służby cywilnej", 1 }
                });

            migrationBuilder.CreateIndex(
                name: "ix_evaluation_answers_evaluation_id_field_key_item_key",
                table: "evaluation_answers",
                columns: new[] { "evaluation_id", "field_key", "item_key" },
                unique: true)
                .Annotation("Npgsql:NullsDistinct", false);

            migrationBuilder.CreateIndex(
                name: "ix_evaluation_answers_updated_by_id",
                table: "evaluation_answers",
                column: "updated_by_id");

            migrationBuilder.CreateIndex(
                name: "ix_evaluation_signatures_evaluation_id_field_key",
                table: "evaluation_signatures",
                columns: new[] { "evaluation_id", "field_key" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_evaluation_signatures_signed_by_id",
                table: "evaluation_signatures",
                column: "signed_by_id");

            migrationBuilder.CreateIndex(
                name: "ix_evaluation_stages_evaluation_id_stage_key",
                table: "evaluation_stages",
                columns: new[] { "evaluation_id", "stage_key" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_evaluation_stages_status_due_to",
                table: "evaluation_stages",
                columns: new[] { "status", "due_to" });

            migrationBuilder.CreateIndex(
                name: "ix_evaluation_templates_active_code",
                table: "evaluation_templates",
                column: "code",
                unique: true,
                filter: "is_active");

            migrationBuilder.CreateIndex(
                name: "ix_evaluation_templates_code_version",
                table: "evaluation_templates",
                columns: new[] { "code", "version" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_evaluations_employee_id",
                table: "evaluations",
                column: "employee_id");

            migrationBuilder.CreateIndex(
                name: "ix_evaluations_evaluator_id",
                table: "evaluations",
                column: "evaluator_id");

            migrationBuilder.CreateIndex(
                name: "ix_evaluations_template_id",
                table: "evaluations",
                column: "template_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "evaluation_answers");

            migrationBuilder.DropTable(
                name: "evaluation_signatures");

            migrationBuilder.DropTable(
                name: "evaluation_stages");

            migrationBuilder.DropTable(
                name: "evaluations");

            migrationBuilder.DropTable(
                name: "evaluation_templates");
        }
    }
}
