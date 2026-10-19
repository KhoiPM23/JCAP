using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace JCAP.Migrations
{
    /// <inheritdoc />
    public partial class AddShadowingPracticeHistory : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ShadowingPracticeSessions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(450)", nullable: false),
                    ShadowingDialogueId = table.Column<int>(type: "int", nullable: false),
                    LearnerRole = table.Column<string>(type: "nvarchar(5)", maxLength: 5, nullable: false),
                    StartedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    CompletedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    DurationSeconds = table.Column<int>(type: "int", nullable: false),
                    ContentMatchScore = table.Column<int>(type: "int", nullable: false),
                    FluencyScore = table.Column<int>(type: "int", nullable: true),
                    WeightedOverallScore = table.Column<int>(type: "int", nullable: false),
                    ScoringVersion = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    AudioQualityStatus = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    RankTitle = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    LearnerSentenceCount = table.Column<int>(type: "int", nullable: false),
                    ScoredSentenceCount = table.Column<int>(type: "int", nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ShadowingPracticeSessions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ShadowingPracticeSessions_AspNetUsers_UserId",
                        column: x => x.UserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ShadowingPracticeSessions_ShadowingDialogues_ShadowingDialogueId",
                        column: x => x.ShadowingDialogueId,
                        principalTable: "ShadowingDialogues",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "ShadowingSentenceEvaluations",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(450)", nullable: false),
                    ShadowingSentenceId = table.Column<int>(type: "int", nullable: false),
                    ShadowingPracticeSessionId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    RecognizedText = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: false),
                    ContentMatchScore = table.Column<int>(type: "int", nullable: false),
                    OverallScore = table.Column<int>(type: "int", nullable: false),
                    Tier = table.Column<string>(type: "nvarchar(10)", maxLength: 10, nullable: false),
                    EvaluationStatus = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    RecognitionSource = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    ScoringVersion = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    ComparisonMethod = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    AudioQualityStatus = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    Feedback = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    DiffTokensJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ShadowingSentenceEvaluations", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ShadowingSentenceEvaluations_AspNetUsers_UserId",
                        column: x => x.UserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ShadowingSentenceEvaluations_ShadowingPracticeSessions_ShadowingPracticeSessionId",
                        column: x => x.ShadowingPracticeSessionId,
                        principalTable: "ShadowingPracticeSessions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ShadowingSentenceEvaluations_ShadowingSentences_ShadowingSentenceId",
                        column: x => x.ShadowingSentenceId,
                        principalTable: "ShadowingSentences",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ShadowingPracticeSessions_ShadowingDialogueId",
                table: "ShadowingPracticeSessions",
                column: "ShadowingDialogueId");

            migrationBuilder.CreateIndex(
                name: "IX_ShadowingPracticeSessions_UserId_CompletedAt",
                table: "ShadowingPracticeSessions",
                columns: new[] { "UserId", "CompletedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_ShadowingSentenceEvaluations_ShadowingPracticeSessionId",
                table: "ShadowingSentenceEvaluations",
                column: "ShadowingPracticeSessionId");

            migrationBuilder.CreateIndex(
                name: "IX_ShadowingSentenceEvaluations_ShadowingSentenceId",
                table: "ShadowingSentenceEvaluations",
                column: "ShadowingSentenceId");

            migrationBuilder.CreateIndex(
                name: "IX_ShadowingSentenceEvaluations_UserId_ShadowingSentenceId_CreatedAt",
                table: "ShadowingSentenceEvaluations",
                columns: new[] { "UserId", "ShadowingSentenceId", "CreatedAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ShadowingSentenceEvaluations");

            migrationBuilder.DropTable(
                name: "ShadowingPracticeSessions");
        }
    }
}
