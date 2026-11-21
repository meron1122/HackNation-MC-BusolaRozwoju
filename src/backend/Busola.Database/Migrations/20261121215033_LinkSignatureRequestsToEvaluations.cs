using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Busola.Database.Migrations
{
    /// <inheritdoc />
    public partial class LinkSignatureRequestsToEvaluations : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "evaluation_field_key",
                table: "signature_requests",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "evaluation_id",
                table: "signature_requests",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "evaluation_role",
                table: "signature_requests",
                type: "character varying(20)",
                maxLength: 20,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "ix_signature_requests_evaluation_id_evaluation_field_key",
                table: "signature_requests",
                columns: new[] { "evaluation_id", "evaluation_field_key" });

            migrationBuilder.AddForeignKey(
                name: "fk_signature_requests_evaluations_evaluation_id",
                table: "signature_requests",
                column: "evaluation_id",
                principalTable: "evaluations",
                principalColumn: "id",
                onDelete: ReferentialAction.Cascade);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "fk_signature_requests_evaluations_evaluation_id",
                table: "signature_requests");

            migrationBuilder.DropIndex(
                name: "ix_signature_requests_evaluation_id_evaluation_field_key",
                table: "signature_requests");

            migrationBuilder.DropColumn(
                name: "evaluation_field_key",
                table: "signature_requests");

            migrationBuilder.DropColumn(
                name: "evaluation_id",
                table: "signature_requests");

            migrationBuilder.DropColumn(
                name: "evaluation_role",
                table: "signature_requests");
        }
    }
}
