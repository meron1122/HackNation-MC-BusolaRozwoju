using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace Busola.Database.Migrations
{
    /// <inheritdoc />
    public partial class AddEvaluationPermissions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.InsertData(
                table: "permissions",
                columns: new[] { "id", "key", "name" },
                values: new object[,]
                {
                    { 14, "read_evaluations", "Podgląd ocen" },
                    { 15, "add_evaluation", "Zakładanie ocen" },
                    { 16, "edit_evaluation", "Wypełnianie ocen i zamykanie etapów" }
                });

            migrationBuilder.InsertData(
                table: "role_permissions",
                columns: new[] { "permission_id", "role_id" },
                values: new object[,]
                {
                    { 14, "c0a8e5d2-1f3b-4c6a-9e7d-2b5f8a1c3e01" },
                    { 14, "c0a8e5d2-1f3b-4c6a-9e7d-2b5f8a1c3e02" },
                    { 16, "c0a8e5d2-1f3b-4c6a-9e7d-2b5f8a1c3e02" },
                    { 14, "c0a8e5d2-1f3b-4c6a-9e7d-2b5f8a1c3e03" },
                    { 15, "c0a8e5d2-1f3b-4c6a-9e7d-2b5f8a1c3e03" },
                    { 16, "c0a8e5d2-1f3b-4c6a-9e7d-2b5f8a1c3e03" },
                    { 14, "c0a8e5d2-1f3b-4c6a-9e7d-2b5f8a1c3e04" },
                    { 15, "c0a8e5d2-1f3b-4c6a-9e7d-2b5f8a1c3e04" },
                    { 16, "c0a8e5d2-1f3b-4c6a-9e7d-2b5f8a1c3e04" }
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DeleteData(
                table: "role_permissions",
                keyColumns: new[] { "permission_id", "role_id" },
                keyValues: new object[] { 14, "c0a8e5d2-1f3b-4c6a-9e7d-2b5f8a1c3e01" });

            migrationBuilder.DeleteData(
                table: "role_permissions",
                keyColumns: new[] { "permission_id", "role_id" },
                keyValues: new object[] { 14, "c0a8e5d2-1f3b-4c6a-9e7d-2b5f8a1c3e02" });

            migrationBuilder.DeleteData(
                table: "role_permissions",
                keyColumns: new[] { "permission_id", "role_id" },
                keyValues: new object[] { 16, "c0a8e5d2-1f3b-4c6a-9e7d-2b5f8a1c3e02" });

            migrationBuilder.DeleteData(
                table: "role_permissions",
                keyColumns: new[] { "permission_id", "role_id" },
                keyValues: new object[] { 14, "c0a8e5d2-1f3b-4c6a-9e7d-2b5f8a1c3e03" });

            migrationBuilder.DeleteData(
                table: "role_permissions",
                keyColumns: new[] { "permission_id", "role_id" },
                keyValues: new object[] { 15, "c0a8e5d2-1f3b-4c6a-9e7d-2b5f8a1c3e03" });

            migrationBuilder.DeleteData(
                table: "role_permissions",
                keyColumns: new[] { "permission_id", "role_id" },
                keyValues: new object[] { 16, "c0a8e5d2-1f3b-4c6a-9e7d-2b5f8a1c3e03" });

            migrationBuilder.DeleteData(
                table: "role_permissions",
                keyColumns: new[] { "permission_id", "role_id" },
                keyValues: new object[] { 14, "c0a8e5d2-1f3b-4c6a-9e7d-2b5f8a1c3e04" });

            migrationBuilder.DeleteData(
                table: "role_permissions",
                keyColumns: new[] { "permission_id", "role_id" },
                keyValues: new object[] { 15, "c0a8e5d2-1f3b-4c6a-9e7d-2b5f8a1c3e04" });

            migrationBuilder.DeleteData(
                table: "role_permissions",
                keyColumns: new[] { "permission_id", "role_id" },
                keyValues: new object[] { 16, "c0a8e5d2-1f3b-4c6a-9e7d-2b5f8a1c3e04" });

            migrationBuilder.DeleteData(
                table: "permissions",
                keyColumn: "id",
                keyValue: 14);

            migrationBuilder.DeleteData(
                table: "permissions",
                keyColumn: "id",
                keyValue: 15);

            migrationBuilder.DeleteData(
                table: "permissions",
                keyColumn: "id",
                keyValue: 16);
        }
    }
}
