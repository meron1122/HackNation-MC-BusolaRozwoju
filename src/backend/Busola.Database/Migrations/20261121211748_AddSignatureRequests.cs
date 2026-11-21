using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Busola.Database.Migrations
{
    /// <inheritdoc />
    public partial class AddSignatureRequests : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "signature_requests",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    title = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    signer_name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    created_by_user_id = table.Column<string>(type: "text", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    token_hash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    link_expires_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    completed_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    image = table.Column<byte[]>(type: "bytea", nullable: true),
                    signer_ip = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    signer_user_agent = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_signature_requests", x => x.id);
                    table.ForeignKey(
                        name: "fk_signature_requests_users_created_by_user_id",
                        column: x => x.created_by_user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_signature_requests_created_by_user_id",
                table: "signature_requests",
                column: "created_by_user_id");

            migrationBuilder.CreateIndex(
                name: "ix_signature_requests_token_hash",
                table: "signature_requests",
                column: "token_hash",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "signature_requests");
        }
    }
}
