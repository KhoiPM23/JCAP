using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace JCAP.Migrations
{
    /// <inheritdoc />
    public partial class AddLearningTopicLevel : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_LearningTopics_Name",
                table: "LearningTopics");

            migrationBuilder.AddColumn<string>(
                name: "JLPTLevel",
                table: "LearningTopics",
                type: "nvarchar(10)",
                maxLength: 10,
                nullable: false,
                defaultValue: "N5");

            // Preserve the original topic IDs for the easiest level; move other levels to
            // new topics without duplicating content or dropping any existing association.
            migrationBuilder.Sql("""
                SELECT DISTINCT content.TopicId, content.JLPTLevel INTO #TopicLevels
                FROM (
                    SELECT tv.TopicId, COALESCE(NULLIF(UPPER(LTRIM(RTRIM(v.JLPTLevel))), ''), 'N5') AS JLPTLevel
                    FROM TopicVocabularies tv JOIN Vocabularies v ON v.Id = tv.VocabularyId
                    UNION
                    SELECT tg.TopicId, COALESCE(NULLIF(UPPER(LTRIM(RTRIM(g.JLPTLevel))), ''), 'N5')
                    FROM TopicGrammars tg JOIN Grammars g ON g.Id = tg.GrammarId
                ) content;
                IF EXISTS (SELECT 1 FROM #TopicLevels WHERE JLPTLevel NOT IN ('N5','N4','N3','N2','N1'))
                    THROW 51000, 'Unknown JLPT level in existing topic content; review before migration.', 1;

                UPDATE t SET JLPTLevel = COALESCE((SELECT TOP 1 l.JLPTLevel
                    FROM #TopicLevels l WHERE l.TopicId = t.Id ORDER BY l.JLPTLevel DESC), 'N5')
                FROM LearningTopics t;

                CREATE TABLE #TopicMap (OldTopicId int NOT NULL, JLPTLevel nvarchar(10) NOT NULL, NewTopicId int NOT NULL);
                INSERT #TopicMap SELECT Id, JLPTLevel, Id FROM LearningTopics;

                MERGE LearningTopics AS target
                USING (
                    SELECT t.Id AS OldTopicId, t.Name, t.Description, t.IsActive, t.CreatedAt,
                        l.JLPTLevel,
                        CASE WHEN LEN(t.Code) <= 47 AND NOT EXISTS
                            (SELECT 1 FROM LearningTopics existing WHERE existing.Code = t.Code + '_' + l.JLPTLevel)
                        THEN t.Code + '_' + l.JLPTLevel
                        ELSE LEFT(t.Code, 32) + '_' + l.JLPTLevel + '_' + CAST(t.Id AS varchar(11)) END AS NewCode
                    FROM LearningTopics t JOIN #TopicLevels l ON l.TopicId = t.Id AND l.JLPTLevel <> t.JLPTLevel
                ) AS source ON 1 = 0
                WHEN NOT MATCHED THEN INSERT (Code, Name, Description, IsActive, CreatedAt, UpdatedAt, JLPTLevel)
                    VALUES (source.NewCode, source.Name, source.Description, source.IsActive, source.CreatedAt, GETUTCDATE(), source.JLPTLevel)
                OUTPUT source.OldTopicId, source.JLPTLevel, inserted.Id INTO #TopicMap;

                UPDATE tv SET TopicId = m.NewTopicId FROM TopicVocabularies tv
                JOIN Vocabularies v ON v.Id = tv.VocabularyId
                JOIN #TopicMap m ON m.OldTopicId = tv.TopicId
                    AND m.JLPTLevel = COALESCE(NULLIF(UPPER(LTRIM(RTRIM(v.JLPTLevel))), ''), 'N5');
                UPDATE tg SET TopicId = m.NewTopicId FROM TopicGrammars tg
                JOIN Grammars g ON g.Id = tg.GrammarId
                JOIN #TopicMap m ON m.OldTopicId = tg.TopicId
                    AND m.JLPTLevel = COALESCE(NULLIF(UPPER(LTRIM(RTRIM(g.JLPTLevel))), ''), 'N5');
                DROP TABLE #TopicMap;
                DROP TABLE #TopicLevels;
                """);

            migrationBuilder.CreateIndex(
                name: "IX_LearningTopics_Name_JLPTLevel",
                table: "LearningTopics",
                columns: new[] { "Name", "JLPTLevel" },
                unique: true);

            migrationBuilder.AddCheckConstraint(
                name: "CK_LearningTopics_JLPTLevel",
                table: "LearningTopics",
                sql: "[JLPTLevel] IN ('N5','N4','N3','N2','N1')");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Keep split topics and their links when rolling back; distinguish their names
            // before restoring the old globally-unique name index.
            migrationBuilder.Sql("""
                UPDATE t SET Name = LEFT(t.Name, 170) + ' [' + t.JLPTLevel + '] #' + CAST(t.Id AS varchar(11))
                FROM LearningTopics t WHERE EXISTS
                    (SELECT 1 FROM LearningTopics other WHERE other.Name = t.Name AND other.Id <> t.Id);
                """);
            migrationBuilder.DropIndex(
                name: "IX_LearningTopics_Name_JLPTLevel",
                table: "LearningTopics");

            migrationBuilder.DropCheckConstraint(
                name: "CK_LearningTopics_JLPTLevel",
                table: "LearningTopics");

            migrationBuilder.DropColumn(
                name: "JLPTLevel",
                table: "LearningTopics");

            migrationBuilder.CreateIndex(
                name: "IX_LearningTopics_Name",
                table: "LearningTopics",
                column: "Name",
                unique: true);
        }
    }
}
