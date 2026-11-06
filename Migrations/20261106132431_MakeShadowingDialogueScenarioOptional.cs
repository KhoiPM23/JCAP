using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace JCAP.Migrations
{
    /// <inheritdoc />
    public partial class MakeShadowingDialogueScenarioOptional : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<int>(
                name: "ScenarioId",
                table: "ShadowingDialogues",
                type: "int",
                nullable: true,
                oldClrType: typeof(int),
                oldType: "int");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<int>(
                name: "ScenarioId",
                table: "ShadowingDialogues",
                type: "int",
                nullable: false,
                defaultValue: 0,
                oldClrType: typeof(int),
                oldType: "int",
                oldNullable: true);
        }
    }
}
