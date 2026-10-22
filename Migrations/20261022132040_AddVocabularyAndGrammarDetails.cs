using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace JCAP.Migrations
{
    /// <inheritdoc />
    public partial class AddVocabularyAndGrammarDetails : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "AudioUrl",
                table: "Vocabularies",
                type: "nvarchar(1000)",
                maxLength: 1000,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Explanation",
                table: "Vocabularies",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsActive",
                table: "Vocabularies",
                type: "bit",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<string>(
                name: "PartOfSpeech",
                table: "Vocabularies",
                type: "nvarchar(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "UpdatedAt",
                table: "Vocabularies",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Explanation",
                table: "Grammars",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Formation",
                table: "Grammars",
                type: "nvarchar(1000)",
                maxLength: 1000,
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsActive",
                table: "Grammars",
                type: "bit",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "UpdatedAt",
                table: "Grammars",
                type: "datetime2",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "AudioUrl",
                table: "Vocabularies");

            migrationBuilder.DropColumn(
                name: "Explanation",
                table: "Vocabularies");

            migrationBuilder.DropColumn(
                name: "IsActive",
                table: "Vocabularies");

            migrationBuilder.DropColumn(
                name: "PartOfSpeech",
                table: "Vocabularies");

            migrationBuilder.DropColumn(
                name: "UpdatedAt",
                table: "Vocabularies");

            migrationBuilder.DropColumn(
                name: "Explanation",
                table: "Grammars");

            migrationBuilder.DropColumn(
                name: "Formation",
                table: "Grammars");

            migrationBuilder.DropColumn(
                name: "IsActive",
                table: "Grammars");

            migrationBuilder.DropColumn(
                name: "UpdatedAt",
                table: "Grammars");
        }
    }
}
