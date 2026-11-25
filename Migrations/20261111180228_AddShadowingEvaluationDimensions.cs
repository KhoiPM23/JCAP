using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace JCAP.Migrations
{
    /// <inheritdoc />
    public partial class AddShadowingEvaluationDimensions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "AsrModel",
                table: "ShadowingSentenceEvaluations",
                type: "nvarchar(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DimensionsJson",
                table: "ShadowingSentenceEvaluations",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "ProcessingMs",
                table: "ShadowingSentenceEvaluations",
                type: "int",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "AsrModel",
                table: "ShadowingSentenceEvaluations");

            migrationBuilder.DropColumn(
                name: "DimensionsJson",
                table: "ShadowingSentenceEvaluations");

            migrationBuilder.DropColumn(
                name: "ProcessingMs",
                table: "ShadowingSentenceEvaluations");
        }
    }
}
