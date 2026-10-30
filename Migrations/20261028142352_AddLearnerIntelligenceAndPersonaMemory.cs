using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace JCAP.Migrations
{
    /// <inheritdoc />
    public partial class AddLearnerIntelligenceAndPersonaMemory : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "LearnerIntelligenceProfiles",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    UserId = table.Column<string>(type: "nvarchar(450)", nullable: false),
                    ThetaEstimate = table.Column<double>(type: "float", nullable: false),
                    SpeakingReflexIndex = table.Column<double>(type: "float", nullable: false),
                    KeigoCommandScore = table.Column<double>(type: "float", nullable: false),
                    ParticleAccuracyRate = table.Column<double>(type: "float", nullable: false),
                    AverageMoraRate = table.Column<double>(type: "float", nullable: false),
                    HintDependencyRate = table.Column<double>(type: "float", nullable: false),
                    CommunicativeConfidenceScore = table.Column<double>(type: "float", nullable: false),
                    CommunicativeProficiencyIndex = table.Column<double>(type: "float", nullable: false),
                    InferredTraitsJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_LearnerIntelligenceProfiles", x => x.Id);
                    table.ForeignKey(
                        name: "FK_LearnerIntelligenceProfiles_AspNetUsers_UserId",
                        column: x => x.UserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "LearnerSkillMasteries",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    UserId = table.Column<string>(type: "nvarchar(450)", nullable: false),
                    SkillCode = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    SkillName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Category = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    Stability = table.Column<double>(type: "float", nullable: false),
                    Difficulty = table.Column<double>(type: "float", nullable: false),
                    Repetitions = table.Column<int>(type: "int", nullable: false),
                    Lapses = table.Column<int>(type: "int", nullable: false),
                    LastPracticedUtc = table.Column<DateTime>(type: "datetime2", nullable: false),
                    NextRecommendedReviewUtc = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_LearnerSkillMasteries", x => x.Id);
                    table.ForeignKey(
                        name: "FK_LearnerSkillMasteries_AspNetUsers_UserId",
                        column: x => x.UserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "LearnerBehaviorSignals",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    SessionId = table.Column<int>(type: "int", nullable: false),
                    TurnIndex = table.Column<int>(type: "int", nullable: false),
                    LatencyMs = table.Column<int>(type: "int", nullable: false),
                    PauseRatio = table.Column<double>(type: "float", nullable: false),
                    MoraRate = table.Column<double>(type: "float", nullable: false),
                    HintLevelUsed = table.Column<int>(type: "int", nullable: false),
                    TranslationPeekCount = table.Column<int>(type: "int", nullable: false),
                    RetryCount = table.Column<int>(type: "int", nullable: false),
                    FallbackToTextInput = table.Column<bool>(type: "bit", nullable: false),
                    BargeInInterrupted = table.Column<bool>(type: "bit", nullable: false),
                    DetectedRuleErrorCodes = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    TurnScore = table.Column<double>(type: "float", nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_LearnerBehaviorSignals", x => x.Id);
                    table.ForeignKey(
                        name: "FK_LearnerBehaviorSignals_RoleplaySessions_SessionId",
                        column: x => x.SessionId,
                        principalTable: "RoleplaySessions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "UserNpcRelationships",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    UserId = table.Column<string>(type: "nvarchar(450)", nullable: false),
                    NpcCode = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    AffinityScore = table.Column<int>(type: "int", nullable: false),
                    CompletedSessionsCount = table.Column<int>(type: "int", nullable: false),
                    MemoryCapsuleJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    LastInteractedUtc = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_UserNpcRelationships", x => x.Id);
                    table.ForeignKey(
                        name: "FK_UserNpcRelationships_AspNetUsers_UserId",
                        column: x => x.UserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_LearnerIntelligenceProfiles_UserId",
                table: "LearnerIntelligenceProfiles",
                column: "UserId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_LearnerSkillMasteries_UserId_SkillCode",
                table: "LearnerSkillMasteries",
                columns: new[] { "UserId", "SkillCode" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_LearnerSkillMasteries_UserId_NextRecommendedReviewUtc",
                table: "LearnerSkillMasteries",
                columns: new[] { "UserId", "NextRecommendedReviewUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_LearnerBehaviorSignals_SessionId_TurnIndex",
                table: "LearnerBehaviorSignals",
                columns: new[] { "SessionId", "TurnIndex" });

            migrationBuilder.CreateIndex(
                name: "IX_UserNpcRelationships_UserId_NpcCode",
                table: "UserNpcRelationships",
                columns: new[] { "UserId", "NpcCode" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(name: "LearnerBehaviorSignals");
            migrationBuilder.DropTable(name: "LearnerSkillMasteries");
            migrationBuilder.DropTable(name: "LearnerIntelligenceProfiles");
            migrationBuilder.DropTable(name: "UserNpcRelationships");
        }
    }
}
