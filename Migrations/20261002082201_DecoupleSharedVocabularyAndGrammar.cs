using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace JCAP.Migrations
{
    /// <inheritdoc />
    public partial class DecoupleSharedVocabularyAndGrammar : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Grammars",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    Pattern = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    Meaning = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    ExampleSentence = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    JLPTLevel = table.Column<string>(type: "nvarchar(10)", maxLength: 10, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false, defaultValueSql: "GETUTCDATE()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Grammars", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Vocabularies",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    Word = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    Reading = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    Meaning = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    JLPTLevel = table.Column<string>(type: "nvarchar(10)", maxLength: 10, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false, defaultValueSql: "GETUTCDATE()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Vocabularies", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "ShadowingDialogueGrammars",
                columns: table => new
                {
                    ShadowingDialogueId = table.Column<int>(type: "int", nullable: false),
                    GrammarId = table.Column<int>(type: "int", nullable: false),
                    OrderIndex = table.Column<int>(type: "int", nullable: false),
                    Note = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ShadowingDialogueGrammars", x => new { x.ShadowingDialogueId, x.GrammarId });
                    table.ForeignKey(
                        name: "FK_ShadowingDialogueGrammars_Grammars_GrammarId",
                        column: x => x.GrammarId,
                        principalTable: "Grammars",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_ShadowingDialogueGrammars_ShadowingDialogues_ShadowingDialogueId",
                        column: x => x.ShadowingDialogueId,
                        principalTable: "ShadowingDialogues",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "ShadowingDialogueVocabularies",
                columns: table => new
                {
                    ShadowingDialogueId = table.Column<int>(type: "int", nullable: false),
                    VocabularyId = table.Column<int>(type: "int", nullable: false),
                    OrderIndex = table.Column<int>(type: "int", nullable: false),
                    Note = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ShadowingDialogueVocabularies", x => new { x.ShadowingDialogueId, x.VocabularyId });
                    table.ForeignKey(
                        name: "FK_ShadowingDialogueVocabularies_ShadowingDialogues_ShadowingDialogueId",
                        column: x => x.ShadowingDialogueId,
                        principalTable: "ShadowingDialogues",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_ShadowingDialogueVocabularies_Vocabularies_VocabularyId",
                        column: x => x.VocabularyId,
                        principalTable: "Vocabularies",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            // Data migration: Migrate existing ShadowingVocabularies / ShadowingGrammars if present
            migrationBuilder.Sql(@"
IF EXISTS (SELECT * FROM sys.tables WHERE name = 'ShadowingVocabularies')
BEGIN
    INSERT INTO Vocabularies (Word, Reading, Meaning, JLPTLevel, CreatedAt)
    SELECT DISTINCT Word, Reading, Meaning, 'N5', GETUTCDATE()
    FROM ShadowingVocabularies
    WHERE NOT EXISTS (
        SELECT 1 FROM Vocabularies v WHERE v.Word = ShadowingVocabularies.Word AND v.Meaning = ShadowingVocabularies.Meaning
    );

    INSERT INTO ShadowingDialogueVocabularies (ShadowingDialogueId, VocabularyId, OrderIndex, Note)
    SELECT sv.ShadowingDialogueId, v.Id, ROW_NUMBER() OVER(PARTITION BY sv.ShadowingDialogueId ORDER BY sv.Id), NULL
    FROM ShadowingVocabularies sv
    JOIN Vocabularies v ON v.Word = sv.Word AND v.Meaning = sv.Meaning;
END

IF EXISTS (SELECT * FROM sys.tables WHERE name = 'ShadowingGrammars')
BEGIN
    INSERT INTO Grammars (Pattern, Meaning, ExampleSentence, JLPTLevel, CreatedAt)
    SELECT DISTINCT Pattern, Meaning, ExampleSentence, 'N5', GETUTCDATE()
    FROM ShadowingGrammars
    WHERE NOT EXISTS (
        SELECT 1 FROM Grammars g WHERE g.Pattern = ShadowingGrammars.Pattern AND g.Meaning = ShadowingGrammars.Meaning
    );

    INSERT INTO ShadowingDialogueGrammars (ShadowingDialogueId, GrammarId, OrderIndex, Note)
    SELECT sg.ShadowingDialogueId, g.Id, ROW_NUMBER() OVER(PARTITION BY sg.ShadowingDialogueId ORDER BY sg.Id), NULL
    FROM ShadowingGrammars sg
    JOIN Grammars g ON g.Pattern = sg.Pattern AND g.Meaning = sg.Meaning;
END
");

            migrationBuilder.DropTable(
                name: "ShadowingGrammars");

            migrationBuilder.DropTable(
                name: "ShadowingVocabularies");

            migrationBuilder.CreateIndex(
                name: "IX_Grammars_Pattern_Meaning",
                table: "Grammars",
                columns: new[] { "Pattern", "Meaning" });

            migrationBuilder.CreateIndex(
                name: "IX_ShadowingDialogueGrammars_GrammarId",
                table: "ShadowingDialogueGrammars",
                column: "GrammarId");

            migrationBuilder.CreateIndex(
                name: "IX_ShadowingDialogueVocabularies_VocabularyId",
                table: "ShadowingDialogueVocabularies",
                column: "VocabularyId");

            migrationBuilder.CreateIndex(
                name: "IX_Vocabularies_Word_Meaning",
                table: "Vocabularies",
                columns: new[] { "Word", "Meaning" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ShadowingDialogueGrammars");

            migrationBuilder.DropTable(
                name: "ShadowingDialogueVocabularies");

            migrationBuilder.DropTable(
                name: "Grammars");

            migrationBuilder.DropTable(
                name: "Vocabularies");

            migrationBuilder.CreateTable(
                name: "ShadowingGrammars",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    ShadowingDialogueId = table.Column<int>(type: "int", nullable: false),
                    ExampleSentence = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    Meaning = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Pattern = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ShadowingGrammars", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ShadowingGrammars_ShadowingDialogues_ShadowingDialogueId",
                        column: x => x.ShadowingDialogueId,
                        principalTable: "ShadowingDialogues",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "ShadowingVocabularies",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    ShadowingDialogueId = table.Column<int>(type: "int", nullable: false),
                    Meaning = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Reading = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    Word = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ShadowingVocabularies", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ShadowingVocabularies_ShadowingDialogues_ShadowingDialogueId",
                        column: x => x.ShadowingDialogueId,
                        principalTable: "ShadowingDialogues",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ShadowingGrammars_ShadowingDialogueId",
                table: "ShadowingGrammars",
                column: "ShadowingDialogueId");

            migrationBuilder.CreateIndex(
                name: "IX_ShadowingVocabularies_ShadowingDialogueId",
                table: "ShadowingVocabularies",
                column: "ShadowingDialogueId");
        }
    }
}
