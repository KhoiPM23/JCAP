using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace JCAP.Migrations
{
    /// <inheritdoc />
    public partial class AddScenarioTargetKnowledgeLinks : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "VocabularyId",
                table: "TargetVocabularies",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "GrammarId",
                table: "TargetGrammars",
                type: "int",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_TargetVocabularies_VocabularyId",
                table: "TargetVocabularies",
                column: "VocabularyId");

            migrationBuilder.CreateIndex(
                name: "IX_TargetGrammars_GrammarId",
                table: "TargetGrammars",
                column: "GrammarId");

            migrationBuilder.AddForeignKey(
                name: "FK_TargetGrammars_Grammars_GrammarId",
                table: "TargetGrammars",
                column: "GrammarId",
                principalTable: "Grammars",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.AddForeignKey(
                name: "FK_TargetVocabularies_Vocabularies_VocabularyId",
                table: "TargetVocabularies",
                column: "VocabularyId",
                principalTable: "Vocabularies",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);

            // Backfill VocabularyId & GrammarId from central Vocabularies / Grammars repository,
            // hydrate canonical texts, remove any non-repository rows, and auto-refill empty configs.
            migrationBuilder.Sql(@"
-- 1. Backfill TargetVocabularies (exact Word match first)
UPDATE tv
SET tv.VocabularyId = m.Id
FROM TargetVocabularies tv
JOIN ScenarioLevelConfigurations slc ON slc.Id = tv.ScenarioLevelConfigurationId
CROSS APPLY (
    SELECT TOP 1 v.Id
    FROM Vocabularies v
    WHERE v.IsActive = 1 AND v.Word = tv.Word
    ORDER BY CASE WHEN UPPER(ISNULL(v.JLPTLevel, N'')) = UPPER(ISNULL(slc.JLPTLevel, N'')) THEN 0 ELSE 1 END, v.Id
) m
WHERE tv.VocabularyId IS NULL;

-- 1b. Normalized match (strip spaces, leading お, trailing する)
UPDATE tv
SET tv.VocabularyId = m.Id
FROM TargetVocabularies tv
JOIN ScenarioLevelConfigurations slc ON slc.Id = tv.ScenarioLevelConfigurationId
CROSS APPLY (
    SELECT TOP 1 v.Id
    FROM Vocabularies v
    WHERE v.IsActive = 1
      AND (
          REPLACE(v.Word, N' ', N'') = REPLACE(tv.Word, N' ', N'')
          OR REPLACE(v.Word, N' ', N'') = CASE WHEN LEFT(REPLACE(tv.Word, N' ', N''), 1) = N'お' THEN SUBSTRING(REPLACE(tv.Word, N' ', N''), 2, 100) ELSE REPLACE(tv.Word, N' ', N'') END
          OR REPLACE(v.Word, N' ', N'') = CASE WHEN RIGHT(REPLACE(tv.Word, N' ', N''), 2) = N'する' THEN LEFT(REPLACE(tv.Word, N' ', N''), LEN(REPLACE(tv.Word, N' ', N'')) - 2) ELSE REPLACE(tv.Word, N' ', N'') END
      )
    ORDER BY CASE WHEN UPPER(ISNULL(v.JLPTLevel, N'')) = UPPER(ISNULL(slc.JLPTLevel, N'')) THEN 0 ELSE 1 END, v.Id
) m
WHERE tv.VocabularyId IS NULL;

-- 1c. Hydrate canonical text from Vocabularies
UPDATE tv
SET tv.Word = LEFT(v.Word, 100),
    tv.Reading = CASE WHEN NULLIF(LTRIM(RTRIM(ISNULL(v.Reading, N''))), N'') IS NOT NULL THEN LEFT(v.Reading, 100) ELSE tv.Reading END,
    tv.Meaning = CASE WHEN NULLIF(LTRIM(RTRIM(ISNULL(v.Meaning, N''))), N'') IS NOT NULL THEN LEFT(v.Meaning, 200) ELSE tv.Meaning END
FROM TargetVocabularies tv
JOIN Vocabularies v ON v.Id = tv.VocabularyId;

-- 1d. Remove duplicates per (ScenarioLevelConfigurationId, VocabularyId)
;WITH DupV AS (
    SELECT Id, ROW_NUMBER() OVER (PARTITION BY ScenarioLevelConfigurationId, VocabularyId ORDER BY Id) AS rn
    FROM TargetVocabularies
    WHERE VocabularyId IS NOT NULL
)
DELETE FROM DupV WHERE rn > 1;

-- 1e. Remove any TargetVocabularies that still do not belong to the central repository
DELETE FROM TargetVocabularies WHERE VocabularyId IS NULL;

-- 1f. Auto-refill any active ScenarioLevelConfiguration left with 0 vocabularies
;WITH EmptyVocabCfg AS (
    SELECT slc.Id AS ConfigId, slc.JLPTLevel
    FROM ScenarioLevelConfigurations slc
    WHERE slc.Status <> N'Archived'
      AND NOT EXISTS (SELECT 1 FROM TargetVocabularies tv WHERE tv.ScenarioLevelConfigurationId = slc.Id)
)
INSERT INTO TargetVocabularies (ScenarioLevelConfigurationId, VocabularyId, Word, Reading, Meaning)
SELECT cfg.ConfigId, pick.Id, LEFT(pick.Word, 100), LEFT(pick.Reading, 100), LEFT(ISNULL(NULLIF(LTRIM(RTRIM(pick.Meaning)), N''), pick.Word), 200)
FROM EmptyVocabCfg cfg
CROSS APPLY (
    SELECT TOP 3 v.Id, v.Word, v.Reading, v.Meaning
    FROM Vocabularies v
    WHERE v.IsActive = 1 AND LEN(v.Word) <= 100
    ORDER BY CASE WHEN UPPER(ISNULL(v.JLPTLevel, N'')) = UPPER(ISNULL(cfg.JLPTLevel, N'')) THEN 0 ELSE 1 END, v.Id
) pick;

-- 2. Backfill TargetGrammars (exact Pattern match first)
UPDATE tg
SET tg.GrammarId = m.Id
FROM TargetGrammars tg
JOIN ScenarioLevelConfigurations slc ON slc.Id = tg.ScenarioLevelConfigurationId
CROSS APPLY (
    SELECT TOP 1 g.Id
    FROM Grammars g
    WHERE g.IsActive = 1 AND g.Pattern = tg.Pattern
    ORDER BY CASE WHEN UPPER(ISNULL(g.JLPTLevel, N'')) = UPPER(ISNULL(slc.JLPTLevel, N'')) THEN 0 ELSE 1 END, g.Id
) m
WHERE tg.GrammarId IS NULL;

-- 2b. Normalized match (strip tildes and spaces)
UPDATE tg
SET tg.GrammarId = m.Id
FROM TargetGrammars tg
JOIN ScenarioLevelConfigurations slc ON slc.Id = tg.ScenarioLevelConfigurationId
CROSS APPLY (
    SELECT TOP 1 g.Id
    FROM Grammars g
    WHERE g.IsActive = 1
      AND REPLACE(REPLACE(REPLACE(REPLACE(g.Pattern, N'～', N''), N'〜', N''), N'~', N''), N' ', N'')
        = REPLACE(REPLACE(REPLACE(REPLACE(tg.Pattern, N'～', N''), N'〜', N''), N'~', N''), N' ', N'')
    ORDER BY CASE WHEN UPPER(ISNULL(g.JLPTLevel, N'')) = UPPER(ISNULL(slc.JLPTLevel, N'')) THEN 0 ELSE 1 END, g.Id
) m
WHERE tg.GrammarId IS NULL;

-- 2c. Hydrate canonical text from Grammars
UPDATE tg
SET tg.Pattern = LEFT(g.Pattern, 100),
    tg.Meaning = CASE WHEN NULLIF(LTRIM(RTRIM(ISNULL(g.Meaning, N''))), N'') IS NOT NULL THEN LEFT(g.Meaning, 200) ELSE tg.Meaning END,
    tg.ExampleSentence = CASE WHEN NULLIF(LTRIM(RTRIM(ISNULL(g.ExampleSentence, N''))), N'') IS NOT NULL THEN LEFT(g.ExampleSentence, 500) ELSE tg.ExampleSentence END
FROM TargetGrammars tg
JOIN Grammars g ON g.Id = tg.GrammarId;

-- 2d. Remove duplicates per (ScenarioLevelConfigurationId, GrammarId)
;WITH DupG AS (
    SELECT Id, ROW_NUMBER() OVER (PARTITION BY ScenarioLevelConfigurationId, GrammarId ORDER BY Id) AS rn
    FROM TargetGrammars
    WHERE GrammarId IS NOT NULL
)
DELETE FROM DupG WHERE rn > 1;

-- 2e. Remove any TargetGrammars that still do not belong to the central repository
DELETE FROM TargetGrammars WHERE GrammarId IS NULL;

-- 2f. Auto-refill any active ScenarioLevelConfiguration left with 0 grammars
;WITH EmptyGramCfg AS (
    SELECT slc.Id AS ConfigId, slc.JLPTLevel
    FROM ScenarioLevelConfigurations slc
    WHERE slc.Status <> N'Archived'
      AND NOT EXISTS (SELECT 1 FROM TargetGrammars tg WHERE tg.ScenarioLevelConfigurationId = slc.Id)
)
INSERT INTO TargetGrammars (ScenarioLevelConfigurationId, GrammarId, Pattern, Meaning, ExampleSentence)
SELECT cfg.ConfigId, pick.Id, LEFT(pick.Pattern, 100), LEFT(ISNULL(NULLIF(LTRIM(RTRIM(pick.Meaning)), N''), pick.Pattern), 200), LEFT(pick.ExampleSentence, 500)
FROM EmptyGramCfg cfg
CROSS APPLY (
    SELECT TOP 3 g.Id, g.Pattern, g.Meaning, g.ExampleSentence
    FROM Grammars g
    WHERE g.IsActive = 1 AND LEN(g.Pattern) <= 100
    ORDER BY CASE WHEN UPPER(ISNULL(g.JLPTLevel, N'')) = UPPER(ISNULL(cfg.JLPTLevel, N'')) THEN 0 ELSE 1 END, g.Id
) pick;
");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_TargetGrammars_Grammars_GrammarId",
                table: "TargetGrammars");

            migrationBuilder.DropForeignKey(
                name: "FK_TargetVocabularies_Vocabularies_VocabularyId",
                table: "TargetVocabularies");

            migrationBuilder.DropIndex(
                name: "IX_TargetVocabularies_VocabularyId",
                table: "TargetVocabularies");

            migrationBuilder.DropIndex(
                name: "IX_TargetGrammars_GrammarId",
                table: "TargetGrammars");

            migrationBuilder.DropColumn(
                name: "VocabularyId",
                table: "TargetVocabularies");

            migrationBuilder.DropColumn(
                name: "GrammarId",
                table: "TargetGrammars");
        }
    }
}
