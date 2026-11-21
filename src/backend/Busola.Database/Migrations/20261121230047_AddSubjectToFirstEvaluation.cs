using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Busola.Database.Migrations
{
    /// <inheritdoc />
    public partial class AddSubjectToFirstEvaluation : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "subject_to_first_evaluation",
                table: "employees",
                type: "boolean",
                nullable: false,
                defaultValue: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "subject_to_first_evaluation",
                table: "employees");
        }
    }
}
