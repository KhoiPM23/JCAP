using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace JCAP.Migrations
{
    /// <inheritdoc />
    public partial class AddRoleplayResultTables : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "RoleplayResults",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    RoleplaySessionId = table.Column<int>(type: "int", nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(450)", nullable: false),
                    ScenarioTitle = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    JLPTLevel = table.Column<string>(type: "nvarchar(10)", maxLength: 10, nullable: false),
                    OverallScore = table.Column<int>(type: "int", nullable: false),
                    GrammarScore = table.Column<int>(type: "int", nullable: false),
                    VocabularyScore = table.Column<int>(type: "int", nullable: false),
                    ImpressionScore = table.Column<int>(type: "int", nullable: false),
                    PassStatus = table.Column<bool>(type: "bit", nullable: false),
                    GeneralFeedbackText = table.Column<string>(type: "nvarchar(4000)", maxLength: 4000, nullable: false),
                    CompletedMissionsSummaryJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    CompletedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_RoleplayResults", x => x.Id);
                    table.ForeignKey(
                        name: "FK_RoleplayResults_AspNetUsers_UserId",
                        column: x => x.UserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_RoleplayResults_RoleplaySessionId_UserId",
                table: "RoleplayResults",
                columns: new[] { "RoleplaySessionId", "UserId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_RoleplayResults_UserId",
                table: "RoleplayResults",
                column: "UserId");

        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "RoleplayResults");
        }
    }
}
