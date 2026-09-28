using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace JCAP.Migrations
{
    /// <inheritdoc />
    public partial class ConnectRoleplayResultsToSessions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                """
                DELETE r
                FROM RoleplayResults AS r
                LEFT JOIN RoleplaySessions AS s
                    ON s.Id = r.RoleplaySessionId
                    AND s.UserId = r.UserId
                WHERE s.Id IS NULL;
                """);

            migrationBuilder.DropIndex(
                name: "IX_RoleplayResults_RoleplaySessionId_UserId",
                table: "RoleplayResults");

            migrationBuilder.CreateIndex(
                name: "IX_RoleplayResults_RoleplaySessionId",
                table: "RoleplayResults",
                column: "RoleplaySessionId",
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_RoleplayResults_RoleplaySessions_RoleplaySessionId",
                table: "RoleplayResults",
                column: "RoleplaySessionId",
                principalTable: "RoleplaySessions",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_RoleplayResults_RoleplaySessions_RoleplaySessionId",
                table: "RoleplayResults");

            migrationBuilder.DropIndex(
                name: "IX_RoleplayResults_RoleplaySessionId",
                table: "RoleplayResults");

            migrationBuilder.CreateIndex(
                name: "IX_RoleplayResults_RoleplaySessionId_UserId",
                table: "RoleplayResults",
                columns: new[] { "RoleplaySessionId", "UserId" },
                unique: true);
        }
    }
}
