using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace JCAP.Migrations
{
    /// <inheritdoc />
    public partial class ExploreProgress : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ExploreChapterUnlocks",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    UserId = table.Column<string>(type: "nvarchar(450)", maxLength: 450, nullable: false),
                    ChapterId = table.Column<int>(type: "int", nullable: false),
                    UnlockedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ExploreChapterUnlocks", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ExploreChapterUnlocks_AspNetUsers_UserId",
                        column: x => x.UserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ExploreChapterUnlocks_ExploreChapters_ChapterId",
                        column: x => x.ChapterId,
                        principalTable: "ExploreChapters",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "ExplorePrefectureStamps",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    UserId = table.Column<string>(type: "nvarchar(450)", maxLength: 450, nullable: false),
                    PrefectureId = table.Column<int>(type: "int", nullable: false),
                    StampedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    RedStampedAt = table.Column<DateTime>(type: "datetime2", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ExplorePrefectureStamps", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ExplorePrefectureStamps_AspNetUsers_UserId",
                        column: x => x.UserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ExplorePrefectureStamps_ExplorePrefectures_PrefectureId",
                        column: x => x.PrefectureId,
                        principalTable: "ExplorePrefectures",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "ExploreSpotProgresses",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    UserId = table.Column<string>(type: "nvarchar(450)", maxLength: 450, nullable: false),
                    SpotId = table.Column<int>(type: "int", nullable: false),
                    UnderstoodAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    StampedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    RedStampedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    ShadowingPracticeSessionId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    RoleplaySessionId = table.Column<int>(type: "int", nullable: true),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ExploreSpotProgresses", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ExploreSpotProgresses_AspNetUsers_UserId",
                        column: x => x.UserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ExploreSpotProgresses_ExploreSpots_SpotId",
                        column: x => x.SpotId,
                        principalTable: "ExploreSpots",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ExploreChapterUnlocks_ChapterId",
                table: "ExploreChapterUnlocks",
                column: "ChapterId");

            migrationBuilder.CreateIndex(
                name: "IX_ExploreChapterUnlocks_UserId_ChapterId",
                table: "ExploreChapterUnlocks",
                columns: new[] { "UserId", "ChapterId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ExplorePrefectureStamps_PrefectureId",
                table: "ExplorePrefectureStamps",
                column: "PrefectureId");

            migrationBuilder.CreateIndex(
                name: "IX_ExplorePrefectureStamps_UserId_PrefectureId",
                table: "ExplorePrefectureStamps",
                columns: new[] { "UserId", "PrefectureId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ExploreSpotProgresses_SpotId",
                table: "ExploreSpotProgresses",
                column: "SpotId");

            migrationBuilder.CreateIndex(
                name: "IX_ExploreSpotProgresses_UserId_SpotId",
                table: "ExploreSpotProgresses",
                columns: new[] { "UserId", "SpotId" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ExploreChapterUnlocks");

            migrationBuilder.DropTable(
                name: "ExplorePrefectureStamps");

            migrationBuilder.DropTable(
                name: "ExploreSpotProgresses");
        }
    }
}
