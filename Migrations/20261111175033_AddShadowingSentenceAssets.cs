using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace JCAP.Migrations
{
    /// <inheritdoc />
    public partial class AddShadowingSentenceAssets : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ShadowingSentenceAssets",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    ShadowingSentenceId = table.Column<int>(type: "int", nullable: false),
                    SourceText = table.Column<string>(type: "nvarchar(400)", maxLength: 400, nullable: false),
                    NormalizedText = table.Column<string>(type: "nvarchar(400)", maxLength: 400, nullable: false),
                    KanaReading = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: false),
                    MoraSequence = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    WordStartsJson = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: false),
                    FuriganaJson = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    VoiceProvider = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    VoiceId = table.Column<int>(type: "int", nullable: true),
                    SampleAudioUrl = table.Column<string>(type: "nvarchar(300)", maxLength: 300, nullable: true),
                    AudioDurationMs = table.Column<int>(type: "int", nullable: true),
                    MoraTimelineJson = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    AudioVersion = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    GeneratedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ShadowingSentenceAssets", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ShadowingSentenceAssets_ShadowingSentences_ShadowingSentenceId",
                        column: x => x.ShadowingSentenceId,
                        principalTable: "ShadowingSentences",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ShadowingSentenceAssets_ShadowingSentenceId_VoiceProvider_VoiceId",
                table: "ShadowingSentenceAssets",
                columns: new[] { "ShadowingSentenceId", "VoiceProvider", "VoiceId" },
                unique: true,
                filter: "[VoiceId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_ShadowingSentenceAssets_SourceText",
                table: "ShadowingSentenceAssets",
                column: "SourceText");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ShadowingSentenceAssets");
        }
    }
}
