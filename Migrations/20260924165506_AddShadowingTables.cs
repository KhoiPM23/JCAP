using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace JCAP.Migrations
{
    /// <inheritdoc />
    public partial class AddShadowingTables : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ShadowingDialogues",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    Title = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    ScenarioId = table.Column<int>(type: "int", nullable: false),
                    JLPTLevel = table.Column<string>(type: "nvarchar(10)", maxLength: 10, nullable: false),
                    SourceDescription = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    SpeakerRoleA_Name = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    SpeakerRoleB_Name = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false, defaultValue: true),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false, defaultValueSql: "GETUTCDATE()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ShadowingDialogues", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ShadowingDialogues_Scenarios_ScenarioId",
                        column: x => x.ScenarioId,
                        principalTable: "Scenarios",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "ShadowingSentences",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    ShadowingDialogueId = table.Column<int>(type: "int", nullable: false),
                    OrderIndex = table.Column<int>(type: "int", nullable: false),
                    SpeakerRole = table.Column<string>(type: "nvarchar(10)", maxLength: 10, nullable: false),
                    JapaneseText = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    RomajiText = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    VietnameseTranslation = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    NativeAudioUrl = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ShadowingSentences", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ShadowingSentences_ShadowingDialogues_ShadowingDialogueId",
                        column: x => x.ShadowingDialogueId,
                        principalTable: "ShadowingDialogues",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ShadowingDialogues_ScenarioId_JLPTLevel",
                table: "ShadowingDialogues",
                columns: new[] { "ScenarioId", "JLPTLevel" });

            migrationBuilder.CreateIndex(
                name: "IX_ShadowingSentences_ShadowingDialogueId_OrderIndex",
                table: "ShadowingSentences",
                columns: new[] { "ShadowingDialogueId", "OrderIndex" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ShadowingSentences");

            migrationBuilder.DropTable(
                name: "ShadowingDialogues");
        }
    }
}
