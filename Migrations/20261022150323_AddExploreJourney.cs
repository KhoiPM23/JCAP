using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace JCAP.Migrations
{
    /// <inheritdoc />
    public partial class AddExploreJourney : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ExploreChapters",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    OrderIndex = table.Column<int>(type: "int", nullable: false),
                    Title = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Description = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    MinLevel = table.Column<string>(type: "nvarchar(10)", maxLength: 10, nullable: false),
                    MaxLevel = table.Column<string>(type: "nvarchar(10)", maxLength: 10, nullable: false),
                    UnlockThresholdPercent = table.Column<int>(type: "int", nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ExploreChapters", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "ExplorePrefectures",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false),
                    IsOpen = table.Column<bool>(type: "bit", nullable: false),
                    OpenedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ExplorePrefectures", x => x.Id);
                    table.CheckConstraint("CK_ExplorePrefecture_Id", "[Id] BETWEEN 1 AND 47");
                });

            migrationBuilder.CreateTable(
                name: "ExploreChapterPrefectures",
                columns: table => new
                {
                    ChapterId = table.Column<int>(type: "int", nullable: false),
                    PrefectureId = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ExploreChapterPrefectures", x => new { x.ChapterId, x.PrefectureId });
                    table.ForeignKey(
                        name: "FK_ExploreChapterPrefectures_ExploreChapters_ChapterId",
                        column: x => x.ChapterId,
                        principalTable: "ExploreChapters",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_ExploreChapterPrefectures_ExplorePrefectures_PrefectureId",
                        column: x => x.PrefectureId,
                        principalTable: "ExplorePrefectures",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "ExploreProvinceWords",
                columns: table => new
                {
                    PrefectureId = table.Column<int>(type: "int", nullable: false),
                    Word = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    Kana = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    Meaning = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Note = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    Status = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false, defaultValue: "Draft"),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ExploreProvinceWords", x => x.PrefectureId);
                    table.ForeignKey(
                        name: "FK_ExploreProvinceWords_ExplorePrefectures_PrefectureId",
                        column: x => x.PrefectureId,
                        principalTable: "ExplorePrefectures",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "ExploreSpots",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    PrefectureId = table.Column<int>(type: "int", nullable: false),
                    IconId = table.Column<string>(type: "nvarchar(80)", maxLength: 80, nullable: false),
                    NameVi = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    NameJp = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    NameKana = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    Latitude = table.Column<double>(type: "float", nullable: false),
                    Longitude = table.Column<double>(type: "float", nullable: false),
                    Status = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false, defaultValue: "Draft"),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ExploreSpots", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ExploreSpots_ExplorePrefectures_PrefectureId",
                        column: x => x.PrefectureId,
                        principalTable: "ExplorePrefectures",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "ExploreSpotLessons",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    SpotId = table.Column<int>(type: "int", nullable: false),
                    JLPTLevel = table.Column<string>(type: "nvarchar(10)", maxLength: 10, nullable: false, defaultValue: "N5"),
                    Situation = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: false),
                    RealUse = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: false),
                    SentenceJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Meaning = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    GrammarNote = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    EstimatedMinutes = table.Column<int>(type: "int", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ExploreSpotLessons", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ExploreSpotLessons_ExploreSpots_SpotId",
                        column: x => x.SpotId,
                        principalTable: "ExploreSpots",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "ExploreSpotActivities",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    LessonId = table.Column<int>(type: "int", nullable: false),
                    ActivityType = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    ReferenceId = table.Column<int>(type: "int", nullable: true),
                    PassThreshold = table.Column<int>(type: "int", nullable: true),
                    OrderIndex = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ExploreSpotActivities", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ExploreSpotActivities_ExploreSpotLessons_LessonId",
                        column: x => x.LessonId,
                        principalTable: "ExploreSpotLessons",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "ExploreSpotLessonGrammars",
                columns: table => new
                {
                    LessonId = table.Column<int>(type: "int", nullable: false),
                    GrammarId = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ExploreSpotLessonGrammars", x => new { x.LessonId, x.GrammarId });
                    table.ForeignKey(
                        name: "FK_ExploreSpotLessonGrammars_ExploreSpotLessons_LessonId",
                        column: x => x.LessonId,
                        principalTable: "ExploreSpotLessons",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_ExploreSpotLessonGrammars_Grammars_GrammarId",
                        column: x => x.GrammarId,
                        principalTable: "Grammars",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "ExploreSpotLessonVocabularies",
                columns: table => new
                {
                    LessonId = table.Column<int>(type: "int", nullable: false),
                    VocabularyId = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ExploreSpotLessonVocabularies", x => new { x.LessonId, x.VocabularyId });
                    table.ForeignKey(
                        name: "FK_ExploreSpotLessonVocabularies_ExploreSpotLessons_LessonId",
                        column: x => x.LessonId,
                        principalTable: "ExploreSpotLessons",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_ExploreSpotLessonVocabularies_Vocabularies_VocabularyId",
                        column: x => x.VocabularyId,
                        principalTable: "Vocabularies",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ExploreChapterPrefectures_PrefectureId",
                table: "ExploreChapterPrefectures",
                column: "PrefectureId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ExploreChapters_OrderIndex",
                table: "ExploreChapters",
                column: "OrderIndex");

            migrationBuilder.CreateIndex(
                name: "IX_ExploreSpotActivities_LessonId_OrderIndex",
                table: "ExploreSpotActivities",
                columns: new[] { "LessonId", "OrderIndex" });

            migrationBuilder.CreateIndex(
                name: "IX_ExploreSpotLessonGrammars_GrammarId",
                table: "ExploreSpotLessonGrammars",
                column: "GrammarId");

            migrationBuilder.CreateIndex(
                name: "IX_ExploreSpotLessons_SpotId",
                table: "ExploreSpotLessons",
                column: "SpotId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ExploreSpotLessonVocabularies_VocabularyId",
                table: "ExploreSpotLessonVocabularies",
                column: "VocabularyId");

            migrationBuilder.CreateIndex(
                name: "IX_ExploreSpots_PrefectureId_Status_IsActive",
                table: "ExploreSpots",
                columns: new[] { "PrefectureId", "Status", "IsActive" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ExploreChapterPrefectures");

            migrationBuilder.DropTable(
                name: "ExploreProvinceWords");

            migrationBuilder.DropTable(
                name: "ExploreSpotActivities");

            migrationBuilder.DropTable(
                name: "ExploreSpotLessonGrammars");

            migrationBuilder.DropTable(
                name: "ExploreSpotLessonVocabularies");

            migrationBuilder.DropTable(
                name: "ExploreChapters");

            migrationBuilder.DropTable(
                name: "ExploreSpotLessons");

            migrationBuilder.DropTable(
                name: "ExploreSpots");

            migrationBuilder.DropTable(
                name: "ExplorePrefectures");
        }
    }
}
