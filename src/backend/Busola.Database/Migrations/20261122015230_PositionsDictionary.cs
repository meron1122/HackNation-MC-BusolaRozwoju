using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace Busola.Database.Migrations
{
    /// <inheritdoc />
    public partial class PositionsDictionary : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "position_id",
                table: "employees",
                type: "integer",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "positions",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    service_id = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_positions", x => x.id);
                    table.ForeignKey(
                        name: "fk_positions_services_service_id",
                        column: x => x.service_id,
                        principalTable: "services",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.InsertData(
                table: "permissions",
                columns: new[] { "id", "key", "name" },
                values: new object[] { 18, "manage_positions", "Słownik stanowisk" });

            migrationBuilder.InsertData(
                table: "role_permissions",
                columns: new[] { "permission_id", "role_id" },
                values: new object[,]
                {
                    { 18, "c0a8e5d2-1f3b-4c6a-9e7d-2b5f8a1c3e03" },
                    { 18, "c0a8e5d2-1f3b-4c6a-9e7d-2b5f8a1c3e04" }
                });

            migrationBuilder.CreateIndex(
                name: "ix_employees_position_id",
                table: "employees",
                column: "position_id");

            migrationBuilder.CreateIndex(
                name: "ix_positions_service_id_name",
                table: "positions",
                columns: new[] { "service_id", "name" },
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "fk_employees_positions_position_id",
                table: "employees",
                column: "position_id",
                principalTable: "positions",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict);

            // Dotychczasowe stanowiska z profili (tekst) → słownik urzędu, bez duplikatów w obrębie służby.
            migrationBuilder.Sql("""
                INSERT INTO positions (name, service_id)
                SELECT DISTINCT btrim(p.job_title), l.service_id
                FROM employee_profiles p
                JOIN employees e ON e.id = p.employee_id
                JOIN departments d ON d.id = e.department_id
                JOIN locations l ON l.id = d.location_id
                WHERE p.job_title IS NOT NULL AND btrim(p.job_title) <> '';
                """);

            migrationBuilder.Sql("""
                UPDATE employees e
                SET position_id = pos.id
                FROM employee_profiles p, departments d, locations l, positions pos
                WHERE p.employee_id = e.id AND d.id = e.department_id AND l.id = d.location_id
                  AND pos.service_id = l.service_id AND pos.name = btrim(p.job_title);
                """);

            migrationBuilder.DropColumn(
                name: "job_title",
                table: "employee_profiles");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "job_title",
                table: "employee_profiles",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            // Nazwa stanowiska wraca do profilu (tekst).
            migrationBuilder.Sql("""
                INSERT INTO employee_profiles (employee_id, emergency_contacts, dependents, work_experience, education, skills, languages)
                SELECT e.id, '[]', '[]', '[]', '[]', '[]', '[]' FROM employees e
                WHERE e.position_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM employee_profiles p WHERE p.employee_id = e.id);
                UPDATE employee_profiles p SET job_title = left(pos.name, 100)
                FROM employees e JOIN positions pos ON pos.id = e.position_id
                WHERE e.id = p.employee_id;
                """);

            migrationBuilder.DropForeignKey(
                name: "fk_employees_positions_position_id",
                table: "employees");

            migrationBuilder.DropTable(
                name: "positions");

            migrationBuilder.DropIndex(
                name: "ix_employees_position_id",
                table: "employees");

            migrationBuilder.DeleteData(
                table: "role_permissions",
                keyColumns: new[] { "permission_id", "role_id" },
                keyValues: new object[] { 18, "c0a8e5d2-1f3b-4c6a-9e7d-2b5f8a1c3e03" });

            migrationBuilder.DeleteData(
                table: "role_permissions",
                keyColumns: new[] { "permission_id", "role_id" },
                keyValues: new object[] { 18, "c0a8e5d2-1f3b-4c6a-9e7d-2b5f8a1c3e04" });

            migrationBuilder.DeleteData(
                table: "permissions",
                keyColumn: "id",
                keyValue: 18);

            migrationBuilder.DropColumn(
                name: "position_id",
                table: "employees");

        }
    }
}
