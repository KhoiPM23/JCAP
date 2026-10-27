using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace JCAP.Migrations
{
    /// <inheritdoc />
    public partial class AddLearnerFlashcardAndBookmarkEntities : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "FlashcardStudySessions",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    UserId = table.Column<string>(type: "nvarchar(450)", maxLength: 450, nullable: false),
                    SourceType = table.Column<string>(type: "nvarchar(30)", maxLength: 30, nullable: false, defaultValue: "TopicSet"),
                    TopicId = table.Column<int>(type: "int", nullable: true),
                    SetTitleSnapshot = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    ContentType = table.Column<string>(type: "nvarchar(30)", maxLength: 30, nullable: false, defaultValue: "Vocabulary"),
                    IsExtraPractice = table.Column<bool>(type: "bit", nullable: false),
                    StartedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    EndedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    TotalCards = table.Column<int>(type: "int", nullable: false),
                    AgainCount = table.Column<int>(type: "int", nullable: false),
                    GoodCount = table.Column<int>(type: "int", nullable: false),
                    EasyCount = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_FlashcardStudySessions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_FlashcardStudySessions_AspNetUsers_UserId",
                        column: x => x.UserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "LearnerBookmarks",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    UserId = table.Column<string>(type: "nvarchar(450)", maxLength: 450, nullable: false),
                    VocabularyId = table.Column<int>(type: "int", nullable: true),
                    GrammarId = table.Column<int>(type: "int", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_LearnerBookmarks", x => x.Id);
                    table.CheckConstraint("CK_LearnerBookmarks_ExactlyOneItem", "([VocabularyId] IS NOT NULL AND [GrammarId] IS NULL) OR ([VocabularyId] IS NULL AND [GrammarId] IS NOT NULL)");
                    table.ForeignKey(
                        name: "FK_LearnerBookmarks_AspNetUsers_UserId",
                        column: x => x.UserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_LearnerBookmarks_Grammars_GrammarId",
                        column: x => x.GrammarId,
                        principalTable: "Grammars",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_LearnerBookmarks_Vocabularies_VocabularyId",
                        column: x => x.VocabularyId,
                        principalTable: "Vocabularies",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "LearnerDailyFlashcardQuotas",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    UserId = table.Column<string>(type: "nvarchar(450)", maxLength: 450, nullable: false),
                    DateVn = table.Column<DateOnly>(type: "date", nullable: false),
                    ExtraUnlockedCards = table.Column<int>(type: "int", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_LearnerDailyFlashcardQuotas", x => x.Id);
                    table.ForeignKey(
                        name: "FK_LearnerDailyFlashcardQuotas_AspNetUsers_UserId",
                        column: x => x.UserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "LearnerFlashcardProgresses",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    UserId = table.Column<string>(type: "nvarchar(450)", maxLength: 450, nullable: false),
                    VocabularyId = table.Column<int>(type: "int", nullable: true),
                    GrammarId = table.Column<int>(type: "int", nullable: true),
                    Repetitions = table.Column<int>(type: "int", nullable: false),
                    IntervalDays = table.Column<int>(type: "int", nullable: false),
                    EaseFactor = table.Column<double>(type: "float", nullable: false, defaultValue: 2.5),
                    NextReviewAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    LastReviewedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    LastRating = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false, defaultValue: "Good"),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_LearnerFlashcardProgresses", x => x.Id);
                    table.CheckConstraint("CK_LearnerFlashcardProgresses_ExactlyOneItem", "([VocabularyId] IS NOT NULL AND [GrammarId] IS NULL) OR ([VocabularyId] IS NULL AND [GrammarId] IS NOT NULL)");
                    table.ForeignKey(
                        name: "FK_LearnerFlashcardProgresses_AspNetUsers_UserId",
                        column: x => x.UserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_LearnerFlashcardProgresses_Grammars_GrammarId",
                        column: x => x.GrammarId,
                        principalTable: "Grammars",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_LearnerFlashcardProgresses_Vocabularies_VocabularyId",
                        column: x => x.VocabularyId,
                        principalTable: "Vocabularies",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "FlashcardReviewLogs",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    SessionId = table.Column<int>(type: "int", nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(450)", maxLength: 450, nullable: false),
                    VocabularyId = table.Column<int>(type: "int", nullable: true),
                    GrammarId = table.Column<int>(type: "int", nullable: true),
                    FrontTextSnapshot = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    MeaningSnapshot = table.Column<string>(type: "nvarchar(300)", maxLength: 300, nullable: false),
                    Rating = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    IsNewCard = table.Column<bool>(type: "bit", nullable: false),
                    IntervalBefore = table.Column<int>(type: "int", nullable: false),
                    IntervalAfter = table.Column<int>(type: "int", nullable: false),
                    ReviewedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_FlashcardReviewLogs", x => x.Id);
                    table.CheckConstraint("CK_FlashcardReviewLogs_ExactlyOneItem", "([VocabularyId] IS NOT NULL AND [GrammarId] IS NULL) OR ([VocabularyId] IS NULL AND [GrammarId] IS NOT NULL)");
                    table.ForeignKey(
                        name: "FK_FlashcardReviewLogs_AspNetUsers_UserId",
                        column: x => x.UserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_FlashcardReviewLogs_FlashcardStudySessions_SessionId",
                        column: x => x.SessionId,
                        principalTable: "FlashcardStudySessions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_FlashcardReviewLogs_Grammars_GrammarId",
                        column: x => x.GrammarId,
                        principalTable: "Grammars",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_FlashcardReviewLogs_Vocabularies_VocabularyId",
                        column: x => x.VocabularyId,
                        principalTable: "Vocabularies",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_FlashcardReviewLogs_GrammarId",
                table: "FlashcardReviewLogs",
                column: "GrammarId");

            migrationBuilder.CreateIndex(
                name: "IX_FlashcardReviewLogs_SessionId",
                table: "FlashcardReviewLogs",
                column: "SessionId");

            migrationBuilder.CreateIndex(
                name: "IX_FlashcardReviewLogs_UserId_IsNewCard_ReviewedAt",
                table: "FlashcardReviewLogs",
                columns: new[] { "UserId", "IsNewCard", "ReviewedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_FlashcardReviewLogs_VocabularyId",
                table: "FlashcardReviewLogs",
                column: "VocabularyId");

            migrationBuilder.CreateIndex(
                name: "IX_FlashcardStudySessions_UserId_StartedAt",
                table: "FlashcardStudySessions",
                columns: new[] { "UserId", "StartedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_LearnerBookmarks_GrammarId",
                table: "LearnerBookmarks",
                column: "GrammarId");

            migrationBuilder.CreateIndex(
                name: "IX_LearnerBookmarks_UserId_CreatedAt",
                table: "LearnerBookmarks",
                columns: new[] { "UserId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_LearnerBookmarks_UserId_GrammarId",
                table: "LearnerBookmarks",
                columns: new[] { "UserId", "GrammarId" },
                unique: true,
                filter: "[GrammarId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_LearnerBookmarks_UserId_VocabularyId",
                table: "LearnerBookmarks",
                columns: new[] { "UserId", "VocabularyId" },
                unique: true,
                filter: "[VocabularyId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_LearnerBookmarks_VocabularyId",
                table: "LearnerBookmarks",
                column: "VocabularyId");

            migrationBuilder.CreateIndex(
                name: "IX_LearnerDailyFlashcardQuotas_UserId_DateVn",
                table: "LearnerDailyFlashcardQuotas",
                columns: new[] { "UserId", "DateVn" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_LearnerFlashcardProgresses_GrammarId",
                table: "LearnerFlashcardProgresses",
                column: "GrammarId");

            migrationBuilder.CreateIndex(
                name: "IX_LearnerFlashcardProgresses_UserId_GrammarId",
                table: "LearnerFlashcardProgresses",
                columns: new[] { "UserId", "GrammarId" },
                unique: true,
                filter: "[GrammarId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_LearnerFlashcardProgresses_UserId_NextReviewAt",
                table: "LearnerFlashcardProgresses",
                columns: new[] { "UserId", "NextReviewAt" });

            migrationBuilder.CreateIndex(
                name: "IX_LearnerFlashcardProgresses_UserId_VocabularyId",
                table: "LearnerFlashcardProgresses",
                columns: new[] { "UserId", "VocabularyId" },
                unique: true,
                filter: "[VocabularyId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_LearnerFlashcardProgresses_VocabularyId",
                table: "LearnerFlashcardProgresses",
                column: "VocabularyId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "FlashcardReviewLogs");

            migrationBuilder.DropTable(
                name: "LearnerBookmarks");

            migrationBuilder.DropTable(
                name: "LearnerDailyFlashcardQuotas");

            migrationBuilder.DropTable(
                name: "LearnerFlashcardProgresses");

            migrationBuilder.DropTable(
                name: "FlashcardStudySessions");
        }
    }
}
