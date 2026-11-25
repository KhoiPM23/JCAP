using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace JCAP.Migrations
{
    /// <inheritdoc />
    public partial class AddFE03AdvancedEvolutionDataLayer : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "CompatibleEventsJson",
                table: "ScenarioLevelConfigurations",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "ExpectedLearnerRegister",
                table: "ScenarioLevelConfigurations",
                type: "int",
                nullable: false,
                defaultValue: 1);

            migrationBuilder.AddColumn<int>(
                name: "SpeakRegister",
                table: "ScenarioLevelConfigurations",
                type: "int",
                nullable: false,
                defaultValue: 1);

            migrationBuilder.CreateTable(
                name: "CharacterMemories",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    UserId = table.Column<string>(type: "nvarchar(450)", nullable: false),
                    CharacterPersonaKey = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    AffinityScore = table.Column<int>(type: "int", nullable: false, defaultValue: 0),
                    EncounterCount = table.Column<int>(type: "int", nullable: false, defaultValue: 1),
                    LastInteractionSummary = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    LastMetAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false, defaultValueSql: "GETUTCDATE()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CharacterMemories", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CharacterMemories_AspNetUsers_UserId",
                        column: x => x.UserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "LearnerMemories",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    UserId = table.Column<string>(type: "nvarchar(450)", nullable: false),
                    Category = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    Key = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    Value = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    Confidence = table.Column<double>(type: "float", nullable: false, defaultValue: 1.0),
                    Visibility = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false, defaultValue: "WorldKnown"),
                    SourceSessionId = table.Column<int>(type: "int", nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false, defaultValueSql: "GETUTCDATE()"),
                    LastConfirmedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false, defaultValueSql: "GETUTCDATE()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_LearnerMemories", x => x.Id);
                    table.ForeignKey(
                        name: "FK_LearnerMemories_AspNetUsers_UserId",
                        column: x => x.UserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_CharacterMemories_UserId_CharacterPersonaKey",
                table: "CharacterMemories",
                columns: new[] { "UserId", "CharacterPersonaKey" });

            migrationBuilder.CreateIndex(
                name: "IX_LearnerMemories_UserId_Category_Key",
                table: "LearnerMemories",
                columns: new[] { "UserId", "Category", "Key" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "CharacterMemories");

            migrationBuilder.DropTable(
                name: "LearnerMemories");

            migrationBuilder.DropColumn(
                name: "CompatibleEventsJson",
                table: "ScenarioLevelConfigurations");

            migrationBuilder.DropColumn(
                name: "ExpectedLearnerRegister",
                table: "ScenarioLevelConfigurations");

            migrationBuilder.DropColumn(
                name: "SpeakRegister",
                table: "ScenarioLevelConfigurations");
        }
    }
}
