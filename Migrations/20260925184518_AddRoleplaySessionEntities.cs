using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace JCAP.Migrations
{
    /// <inheritdoc />
    public partial class AddRoleplaySessionEntities : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "RoleplaySessions",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    UserId = table.Column<string>(type: "nvarchar(450)", nullable: false),
                    ScenarioLevelConfigurationId = table.Column<int>(type: "int", nullable: false),
                    Status = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false, defaultValue: "Active"),
                    CreditDeducted = table.Column<int>(type: "int", nullable: false),
                    IsNaturallyConcluded = table.Column<bool>(type: "bit", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    CompletedAt = table.Column<DateTime>(type: "datetime2", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_RoleplaySessions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_RoleplaySessions_AspNetUsers_UserId",
                        column: x => x.UserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_RoleplaySessions_ScenarioLevelConfigurations_ScenarioLevelConfigurationId",
                        column: x => x.ScenarioLevelConfigurationId,
                        principalTable: "ScenarioLevelConfigurations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "RoleplayMessages",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    RoleplaySessionId = table.Column<int>(type: "int", nullable: false),
                    Sender = table.Column<string>(type: "nvarchar(10)", maxLength: 10, nullable: false),
                    JapaneseText = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    VietnameseMeaning = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    FuriganaHtml = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    LinguisticFeedbackJson = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_RoleplayMessages", x => x.Id);
                    table.ForeignKey(
                        name: "FK_RoleplayMessages_RoleplaySessions_RoleplaySessionId",
                        column: x => x.RoleplaySessionId,
                        principalTable: "RoleplaySessions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "RoleplaySessionMissions",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    RoleplaySessionId = table.Column<int>(type: "int", nullable: false),
                    MissionId = table.Column<int>(type: "int", nullable: false),
                    IsCompleted = table.Column<bool>(type: "bit", nullable: false),
                    CompletedAt = table.Column<DateTime>(type: "datetime2", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_RoleplaySessionMissions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_RoleplaySessionMissions_Missions_MissionId",
                        column: x => x.MissionId,
                        principalTable: "Missions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_RoleplaySessionMissions_RoleplaySessions_RoleplaySessionId",
                        column: x => x.RoleplaySessionId,
                        principalTable: "RoleplaySessions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_RoleplayMessages_RoleplaySessionId_CreatedAt",
                table: "RoleplayMessages",
                columns: new[] { "RoleplaySessionId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_RoleplaySessionMissions_MissionId",
                table: "RoleplaySessionMissions",
                column: "MissionId");

            migrationBuilder.CreateIndex(
                name: "IX_RoleplaySessionMissions_RoleplaySessionId_MissionId",
                table: "RoleplaySessionMissions",
                columns: new[] { "RoleplaySessionId", "MissionId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_RoleplaySessions_ScenarioLevelConfigurationId",
                table: "RoleplaySessions",
                column: "ScenarioLevelConfigurationId");

            migrationBuilder.CreateIndex(
                name: "IX_RoleplaySessions_UserId_ScenarioLevelConfigurationId_Status",
                table: "RoleplaySessions",
                columns: new[] { "UserId", "ScenarioLevelConfigurationId", "Status" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "RoleplayMessages");

            migrationBuilder.DropTable(
                name: "RoleplaySessionMissions");

            migrationBuilder.DropTable(
                name: "RoleplaySessions");
        }
    }
}
