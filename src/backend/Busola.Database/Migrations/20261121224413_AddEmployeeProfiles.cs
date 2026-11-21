using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Busola.Database.Migrations
{
    /// <inheritdoc />
    public partial class AddEmployeeProfiles : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "employee_profiles",
                columns: table => new
                {
                    employee_id = table.Column<int>(type: "integer", nullable: false),
                    middle_name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    employee_number = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    other_id = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    gender = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    marital_status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    nationality = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    driver_license_number = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    driver_license_expiry = table.Column<DateOnly>(type: "date", nullable: true),
                    street1 = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    street2 = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    city = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    province = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    postal_code = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    country = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    phone_home = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    phone_mobile = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    phone_work = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    work_email = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: true),
                    other_email = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: true),
                    job_title = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    employment_type = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    contract_start = table.Column<DateOnly>(type: "date", nullable: true),
                    contract_end = table.Column<DateOnly>(type: "date", nullable: true),
                    dependents = table.Column<string>(type: "jsonb", nullable: true),
                    education = table.Column<string>(type: "jsonb", nullable: true),
                    emergency_contacts = table.Column<string>(type: "jsonb", nullable: true),
                    languages = table.Column<string>(type: "jsonb", nullable: true),
                    skills = table.Column<string>(type: "jsonb", nullable: true),
                    work_experience = table.Column<string>(type: "jsonb", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_employee_profiles", x => x.employee_id);
                    table.ForeignKey(
                        name: "fk_employee_profiles_employees_employee_id",
                        column: x => x.employee_id,
                        principalTable: "employees",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "employee_profiles");
        }
    }
}
