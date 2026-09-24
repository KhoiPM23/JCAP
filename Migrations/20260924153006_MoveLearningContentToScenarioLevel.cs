using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace JCAP.Migrations
{
    /// <inheritdoc />
    public partial class MoveLearningContentToScenarioLevel : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_TargetGrammars_Scenarios_ScenarioId",
                table: "TargetGrammars");

            migrationBuilder.DropForeignKey(
                name: "FK_TargetVocabularies_Scenarios_ScenarioId",
                table: "TargetVocabularies");

            migrationBuilder.RenameColumn(
                name: "ScenarioId",
                table: "TargetVocabularies",
                newName: "ScenarioLevelConfigurationId");

            migrationBuilder.RenameIndex(
                name: "IX_TargetVocabularies_ScenarioId",
                table: "TargetVocabularies",
                newName: "IX_TargetVocabularies_ScenarioLevelConfigurationId");

            migrationBuilder.RenameColumn(
                name: "ScenarioId",
                table: "TargetGrammars",
                newName: "ScenarioLevelConfigurationId");

            migrationBuilder.RenameIndex(
                name: "IX_TargetGrammars_ScenarioId",
                table: "TargetGrammars",
                newName: "IX_TargetGrammars_ScenarioLevelConfigurationId");

            migrationBuilder.AddForeignKey(
                name: "FK_TargetGrammars_ScenarioLevelConfigurations_ScenarioLevelConfigurationId",
                table: "TargetGrammars",
                column: "ScenarioLevelConfigurationId",
                principalTable: "ScenarioLevelConfigurations",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_TargetVocabularies_ScenarioLevelConfigurations_ScenarioLevelConfigurationId",
                table: "TargetVocabularies",
                column: "ScenarioLevelConfigurationId",
                principalTable: "ScenarioLevelConfigurations",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_TargetGrammars_ScenarioLevelConfigurations_ScenarioLevelConfigurationId",
                table: "TargetGrammars");

            migrationBuilder.DropForeignKey(
                name: "FK_TargetVocabularies_ScenarioLevelConfigurations_ScenarioLevelConfigurationId",
                table: "TargetVocabularies");

            migrationBuilder.RenameColumn(
                name: "ScenarioLevelConfigurationId",
                table: "TargetVocabularies",
                newName: "ScenarioId");

            migrationBuilder.RenameIndex(
                name: "IX_TargetVocabularies_ScenarioLevelConfigurationId",
                table: "TargetVocabularies",
                newName: "IX_TargetVocabularies_ScenarioId");

            migrationBuilder.RenameColumn(
                name: "ScenarioLevelConfigurationId",
                table: "TargetGrammars",
                newName: "ScenarioId");

            migrationBuilder.RenameIndex(
                name: "IX_TargetGrammars_ScenarioLevelConfigurationId",
                table: "TargetGrammars",
                newName: "IX_TargetGrammars_ScenarioId");

            migrationBuilder.AddForeignKey(
                name: "FK_TargetGrammars_Scenarios_ScenarioId",
                table: "TargetGrammars",
                column: "ScenarioId",
                principalTable: "Scenarios",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_TargetVocabularies_Scenarios_ScenarioId",
                table: "TargetVocabularies",
                column: "ScenarioId",
                principalTable: "Scenarios",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        }
    }
}
