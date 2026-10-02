using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace JCAP.Migrations
{
    /// <inheritdoc />
    public partial class AddShadowingVocabGrammarAndRefinement : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<string>(
                name: "SpeakerRole",
                table: "ShadowingSentences",
                type: "nvarchar(50)",
                maxLength: 50,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "nvarchar(10)",
                oldMaxLength: 10);

            migrationBuilder.AlterColumn<string>(
                name: "NativeAudioUrl",
                table: "ShadowingSentences",
                type: "nvarchar(1000)",
                maxLength: 1000,
                nullable: true,
                oldClrType: typeof(string),
                oldType: "nvarchar(1000)",
                oldMaxLength: 1000);

            migrationBuilder.AddColumn<int>(
                name: "AudioDurationMs",
                table: "ShadowingSentences",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SpeakerRolesJson",
                table: "ShadowingDialogues",
                type: "nvarchar(2000)",
                maxLength: 2000,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "ShadowingGrammars",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    ShadowingDialogueId = table.Column<int>(type: "int", nullable: false),
                    Pattern = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    Meaning = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    ExampleSentence = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true)
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
                    Word = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    Reading = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    Meaning = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false)
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

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ShadowingGrammars");

            migrationBuilder.DropTable(
                name: "ShadowingVocabularies");

            migrationBuilder.DropColumn(
                name: "AudioDurationMs",
                table: "ShadowingSentences");

            migrationBuilder.DropColumn(
                name: "SpeakerRolesJson",
                table: "ShadowingDialogues");

            migrationBuilder.AlterColumn<string>(
                name: "SpeakerRole",
                table: "ShadowingSentences",
                type: "nvarchar(10)",
                maxLength: 10,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "nvarchar(50)",
                oldMaxLength: 50);

            migrationBuilder.AlterColumn<string>(
                name: "NativeAudioUrl",
                table: "ShadowingSentences",
                type: "nvarchar(1000)",
                maxLength: 1000,
                nullable: false,
                defaultValue: "",
                oldClrType: typeof(string),
                oldType: "nvarchar(1000)",
                oldMaxLength: 1000,
                oldNullable: true);
        }
    }
}
