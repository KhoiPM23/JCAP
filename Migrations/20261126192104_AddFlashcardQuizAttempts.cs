using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace JCAP.Migrations
{
    /// <inheritdoc />
    public partial class AddFlashcardQuizAttempts : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "FlashcardQuizAttempts",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    UserId = table.Column<string>(type: "nvarchar(450)", maxLength: 450, nullable: false),
                    SourceType = table.Column<string>(type: "nvarchar(30)", maxLength: 30, nullable: false, defaultValue: "TopicSet"),
                    TopicId = table.Column<int>(type: "int", nullable: true),
                    SetTitleSnapshot = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    ContentType = table.Column<string>(type: "nvarchar(30)", maxLength: 30, nullable: false, defaultValue: "Vocabulary"),
                    Direction = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false, defaultValue: "ja_to_vi"),
                    CardScope = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false, defaultValue: "all"),
                    InstantFeedback = table.Column<bool>(type: "bit", nullable: false),
                    TotalQuestions = table.Column<int>(type: "int", nullable: false),
                    CorrectCount = table.Column<int>(type: "int", nullable: false),
                    WrongCount = table.Column<int>(type: "int", nullable: false),
                    SkippedCount = table.Column<int>(type: "int", nullable: false),
                    ScorePercent = table.Column<int>(type: "int", nullable: false),
                    DurationSeconds = table.Column<int>(type: "int", nullable: false),
                    StartedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    CompletedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_FlashcardQuizAttempts", x => x.Id);
                    table.ForeignKey(
                        name: "FK_FlashcardQuizAttempts_AspNetUsers_UserId",
                        column: x => x.UserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "FlashcardQuizAttemptItems",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    AttemptId = table.Column<int>(type: "int", nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(450)", maxLength: 450, nullable: false),
                    QuestionIndex = table.Column<int>(type: "int", nullable: false),
                    QuestionType = table.Column<string>(type: "nvarchar(30)", maxLength: 30, nullable: false),
                    Direction = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    VocabularyId = table.Column<int>(type: "int", nullable: true),
                    GrammarId = table.Column<int>(type: "int", nullable: true),
                    FrontTextSnapshot = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    MeaningSnapshot = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: false),
                    PromptText = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    CorrectAnswer = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    UserAnswer = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    IsCorrect = table.Column<bool>(type: "bit", nullable: false),
                    IsSkipped = table.Column<bool>(type: "bit", nullable: false),
                    AnsweredAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_FlashcardQuizAttemptItems", x => x.Id);
                    table.CheckConstraint("CK_FlashcardQuizAttemptItems_ExactlyOneItem", "([VocabularyId] IS NOT NULL AND [GrammarId] IS NULL) OR ([VocabularyId] IS NULL AND [GrammarId] IS NOT NULL)");
                    table.ForeignKey(
                        name: "FK_FlashcardQuizAttemptItems_AspNetUsers_UserId",
                        column: x => x.UserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_FlashcardQuizAttemptItems_FlashcardQuizAttempts_AttemptId",
                        column: x => x.AttemptId,
                        principalTable: "FlashcardQuizAttempts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_FlashcardQuizAttemptItems_Grammars_GrammarId",
                        column: x => x.GrammarId,
                        principalTable: "Grammars",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_FlashcardQuizAttemptItems_Vocabularies_VocabularyId",
                        column: x => x.VocabularyId,
                        principalTable: "Vocabularies",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_FlashcardQuizAttemptItems_AttemptId",
                table: "FlashcardQuizAttemptItems",
                column: "AttemptId");

            migrationBuilder.CreateIndex(
                name: "IX_FlashcardQuizAttemptItems_GrammarId",
                table: "FlashcardQuizAttemptItems",
                column: "GrammarId");

            migrationBuilder.CreateIndex(
                name: "IX_FlashcardQuizAttemptItems_UserId",
                table: "FlashcardQuizAttemptItems",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_FlashcardQuizAttemptItems_VocabularyId",
                table: "FlashcardQuizAttemptItems",
                column: "VocabularyId");

            migrationBuilder.CreateIndex(
                name: "IX_FlashcardQuizAttempts_UserId_CompletedAt",
                table: "FlashcardQuizAttempts",
                columns: new[] { "UserId", "CompletedAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "FlashcardQuizAttemptItems");

            migrationBuilder.DropTable(
                name: "FlashcardQuizAttempts");
        }
    }
}
