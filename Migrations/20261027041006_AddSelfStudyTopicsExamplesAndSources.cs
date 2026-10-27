using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace JCAP.Migrations
{
    /// <inheritdoc />
    public partial class AddSelfStudyTopicsExamplesAndSources : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Vocabularies_Word_Meaning",
                table: "Vocabularies");

            migrationBuilder.DropIndex(
                name: "IX_Grammars_Pattern_Meaning",
                table: "Grammars");

            migrationBuilder.AlterColumn<string>(
                name: "Meaning",
                table: "Vocabularies",
                type: "nvarchar(1000)",
                maxLength: 1000,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "nvarchar(200)",
                oldMaxLength: 200);

            migrationBuilder.AlterColumn<string>(
                name: "Meaning",
                table: "Grammars",
                type: "nvarchar(1000)",
                maxLength: 1000,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "nvarchar(200)",
                oldMaxLength: 200);

            migrationBuilder.AddColumn<string>(
                name: "Reading",
                table: "Grammars",
                type: "nvarchar(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "MeaningSnapshot",
                table: "FlashcardReviewLogs",
                type: "nvarchar(1000)",
                maxLength: 1000,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "nvarchar(300)",
                oldMaxLength: 300);

            migrationBuilder.CreateTable(
                name: "LearningContentSources",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    Name = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    Version = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    SourceUrl = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: false),
                    License = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    LicenseUrl = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: false),
                    Attribution = table.Column<string>(type: "nvarchar(max)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_LearningContentSources", x => x.Id);
                    table.CheckConstraint("CK_LearningContentSources_Provenance_NotBlank", "LEN(LTRIM(RTRIM([Name]))) > 0 AND LEN(LTRIM(RTRIM([Version]))) > 0 AND LEN(LTRIM(RTRIM([SourceUrl]))) > 0 AND LEN(LTRIM(RTRIM([License]))) > 0 AND LEN(LTRIM(RTRIM([LicenseUrl]))) > 0 AND LEN(LTRIM(RTRIM([Attribution]))) > 0");
                });

            migrationBuilder.CreateTable(
                name: "LearningTopics",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    Code = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    Name = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Description = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    IsActive = table.Column<bool>(type: "bit", nullable: false, defaultValue: true),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false, defaultValueSql: "GETUTCDATE()"),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_LearningTopics", x => x.Id);
                    table.CheckConstraint("CK_LearningTopics_Code_NotBlank", "LEN(LTRIM(RTRIM([Code]))) > 0");
                    table.CheckConstraint("CK_LearningTopics_Name_NotBlank", "LEN(LTRIM(RTRIM([Name]))) > 0");
                });

            migrationBuilder.CreateTable(
                name: "GrammarExamples",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    GrammarId = table.Column<int>(type: "int", nullable: false),
                    JapaneseText = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    VietnameseTranslation = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: true),
                    Furigana = table.Column<string>(type: "nvarchar(4000)", maxLength: 4000, nullable: true),
                    OrderIndex = table.Column<int>(type: "int", nullable: false),
                    SourceId = table.Column<int>(type: "int", nullable: true),
                    ExternalId = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_GrammarExamples", x => x.Id);
                    table.CheckConstraint("CK_GrammarExamples_JapaneseText_NotBlank", "LEN(LTRIM(RTRIM([JapaneseText]))) > 0");
                    table.CheckConstraint("CK_GrammarExamples_OrderIndex", "[OrderIndex] >= 0");
                    table.CheckConstraint("CK_GrammarExamples_SourceReference", "[ExternalId] IS NULL OR [SourceId] IS NOT NULL");
                    table.ForeignKey(
                        name: "FK_GrammarExamples_Grammars_GrammarId",
                        column: x => x.GrammarId,
                        principalTable: "Grammars",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_GrammarExamples_LearningContentSources_SourceId",
                        column: x => x.SourceId,
                        principalTable: "LearningContentSources",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "GrammarSources",
                columns: table => new
                {
                    GrammarId = table.Column<int>(type: "int", nullable: false),
                    SourceId = table.Column<int>(type: "int", nullable: false),
                    ExternalId = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_GrammarSources", x => new { x.GrammarId, x.SourceId, x.ExternalId });
                    table.CheckConstraint("CK_GrammarSources_ExternalId_NotBlank", "LEN(LTRIM(RTRIM([ExternalId]))) > 0");
                    table.ForeignKey(
                        name: "FK_GrammarSources_Grammars_GrammarId",
                        column: x => x.GrammarId,
                        principalTable: "Grammars",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_GrammarSources_LearningContentSources_SourceId",
                        column: x => x.SourceId,
                        principalTable: "LearningContentSources",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "VocabularyExamples",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    VocabularyId = table.Column<int>(type: "int", nullable: false),
                    JapaneseText = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    VietnameseTranslation = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: true),
                    Furigana = table.Column<string>(type: "nvarchar(4000)", maxLength: 4000, nullable: true),
                    OrderIndex = table.Column<int>(type: "int", nullable: false),
                    SourceId = table.Column<int>(type: "int", nullable: true),
                    ExternalId = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_VocabularyExamples", x => x.Id);
                    table.CheckConstraint("CK_VocabularyExamples_JapaneseText_NotBlank", "LEN(LTRIM(RTRIM([JapaneseText]))) > 0");
                    table.CheckConstraint("CK_VocabularyExamples_OrderIndex", "[OrderIndex] >= 0");
                    table.CheckConstraint("CK_VocabularyExamples_SourceReference", "[ExternalId] IS NULL OR [SourceId] IS NOT NULL");
                    table.ForeignKey(
                        name: "FK_VocabularyExamples_LearningContentSources_SourceId",
                        column: x => x.SourceId,
                        principalTable: "LearningContentSources",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_VocabularyExamples_Vocabularies_VocabularyId",
                        column: x => x.VocabularyId,
                        principalTable: "Vocabularies",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "VocabularySources",
                columns: table => new
                {
                    VocabularyId = table.Column<int>(type: "int", nullable: false),
                    SourceId = table.Column<int>(type: "int", nullable: false),
                    ExternalId = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_VocabularySources", x => new { x.VocabularyId, x.SourceId, x.ExternalId });
                    table.CheckConstraint("CK_VocabularySources_ExternalId_NotBlank", "LEN(LTRIM(RTRIM([ExternalId]))) > 0");
                    table.ForeignKey(
                        name: "FK_VocabularySources_LearningContentSources_SourceId",
                        column: x => x.SourceId,
                        principalTable: "LearningContentSources",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_VocabularySources_Vocabularies_VocabularyId",
                        column: x => x.VocabularyId,
                        principalTable: "Vocabularies",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "TopicGrammars",
                columns: table => new
                {
                    TopicId = table.Column<int>(type: "int", nullable: false),
                    GrammarId = table.Column<int>(type: "int", nullable: false),
                    OrderIndex = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TopicGrammars", x => new { x.TopicId, x.GrammarId });
                    table.CheckConstraint("CK_TopicGrammars_OrderIndex", "[OrderIndex] >= 0");
                    table.ForeignKey(
                        name: "FK_TopicGrammars_Grammars_GrammarId",
                        column: x => x.GrammarId,
                        principalTable: "Grammars",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_TopicGrammars_LearningTopics_TopicId",
                        column: x => x.TopicId,
                        principalTable: "LearningTopics",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "TopicVocabularies",
                columns: table => new
                {
                    TopicId = table.Column<int>(type: "int", nullable: false),
                    VocabularyId = table.Column<int>(type: "int", nullable: false),
                    OrderIndex = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TopicVocabularies", x => new { x.TopicId, x.VocabularyId });
                    table.CheckConstraint("CK_TopicVocabularies_OrderIndex", "[OrderIndex] >= 0");
                    table.ForeignKey(
                        name: "FK_TopicVocabularies_LearningTopics_TopicId",
                        column: x => x.TopicId,
                        principalTable: "LearningTopics",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_TopicVocabularies_Vocabularies_VocabularyId",
                        column: x => x.VocabularyId,
                        principalTable: "Vocabularies",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Vocabularies_Word",
                table: "Vocabularies",
                column: "Word");

            migrationBuilder.CreateIndex(
                name: "IX_Grammars_Pattern",
                table: "Grammars",
                column: "Pattern");

            migrationBuilder.CreateIndex(
                name: "IX_GrammarExamples_GrammarId_OrderIndex",
                table: "GrammarExamples",
                columns: new[] { "GrammarId", "OrderIndex" });

            migrationBuilder.CreateIndex(
                name: "IX_GrammarExamples_SourceId",
                table: "GrammarExamples",
                column: "SourceId");

            migrationBuilder.CreateIndex(
                name: "IX_GrammarSources_SourceId_ExternalId",
                table: "GrammarSources",
                columns: new[] { "SourceId", "ExternalId" });

            migrationBuilder.CreateIndex(
                name: "IX_LearningContentSources_Name_Version",
                table: "LearningContentSources",
                columns: new[] { "Name", "Version" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_LearningTopics_Code",
                table: "LearningTopics",
                column: "Code",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_LearningTopics_Name",
                table: "LearningTopics",
                column: "Name",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_TopicGrammars_GrammarId",
                table: "TopicGrammars",
                column: "GrammarId");

            migrationBuilder.CreateIndex(
                name: "IX_TopicGrammars_TopicId_OrderIndex",
                table: "TopicGrammars",
                columns: new[] { "TopicId", "OrderIndex" });

            migrationBuilder.CreateIndex(
                name: "IX_TopicVocabularies_TopicId_OrderIndex",
                table: "TopicVocabularies",
                columns: new[] { "TopicId", "OrderIndex" });

            migrationBuilder.CreateIndex(
                name: "IX_TopicVocabularies_VocabularyId",
                table: "TopicVocabularies",
                column: "VocabularyId");

            migrationBuilder.CreateIndex(
                name: "IX_VocabularyExamples_SourceId",
                table: "VocabularyExamples",
                column: "SourceId");

            migrationBuilder.CreateIndex(
                name: "IX_VocabularyExamples_VocabularyId_OrderIndex",
                table: "VocabularyExamples",
                columns: new[] { "VocabularyId", "OrderIndex" });

            migrationBuilder.CreateIndex(
                name: "IX_VocabularySources_SourceId_ExternalId",
                table: "VocabularySources",
                columns: new[] { "SourceId", "ExternalId" });

            // Preserve the old example for existing APIs and copy it into the new
            // collection. A word's meaning is not a sentence translation.
            migrationBuilder.Sql("""
                INSERT INTO [GrammarExamples]
                    ([GrammarId], [JapaneseText], [VietnameseTranslation], [Furigana], [OrderIndex], [SourceId], [ExternalId])
                SELECT [g].[Id], [g].[ExampleSentence], NULL, NULL, 0, NULL, NULL
                FROM [Grammars] AS [g]
                WHERE [g].[ExampleSentence] IS NOT NULL
                  AND LEN(LTRIM(RTRIM([g].[ExampleSentence]))) > 0
                  AND NOT EXISTS (
                      SELECT 1 FROM [GrammarExamples] AS [e]
                      WHERE [e].[GrammarId] = [g].[Id]
                        AND [e].[JapaneseText] = [g].[ExampleSentence]
                  );
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "GrammarExamples");

            migrationBuilder.DropTable(
                name: "GrammarSources");

            migrationBuilder.DropTable(
                name: "TopicGrammars");

            migrationBuilder.DropTable(
                name: "TopicVocabularies");

            migrationBuilder.DropTable(
                name: "VocabularyExamples");

            migrationBuilder.DropTable(
                name: "VocabularySources");

            migrationBuilder.DropTable(
                name: "LearningTopics");

            migrationBuilder.DropTable(
                name: "LearningContentSources");

            migrationBuilder.DropIndex(
                name: "IX_Vocabularies_Word",
                table: "Vocabularies");

            migrationBuilder.DropIndex(
                name: "IX_Grammars_Pattern",
                table: "Grammars");

            migrationBuilder.DropColumn(
                name: "Reading",
                table: "Grammars");

            migrationBuilder.AlterColumn<string>(
                name: "Meaning",
                table: "Vocabularies",
                type: "nvarchar(200)",
                maxLength: 200,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "nvarchar(1000)",
                oldMaxLength: 1000);

            migrationBuilder.AlterColumn<string>(
                name: "Meaning",
                table: "Grammars",
                type: "nvarchar(200)",
                maxLength: 200,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "nvarchar(1000)",
                oldMaxLength: 1000);

            migrationBuilder.AlterColumn<string>(
                name: "MeaningSnapshot",
                table: "FlashcardReviewLogs",
                type: "nvarchar(300)",
                maxLength: 300,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "nvarchar(1000)",
                oldMaxLength: 1000);

            migrationBuilder.CreateIndex(
                name: "IX_Vocabularies_Word_Meaning",
                table: "Vocabularies",
                columns: new[] { "Word", "Meaning" });

            migrationBuilder.CreateIndex(
                name: "IX_Grammars_Pattern_Meaning",
                table: "Grammars",
                columns: new[] { "Pattern", "Meaning" });
        }
    }
}
