using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace JCAP.Migrations
{
    /// <inheritdoc />
    public partial class AddPlacementTestSchema : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "AssessmentStateJson",
                table: "RoleplaySessions",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SessionType",
                table: "RoleplaySessions",
                type: "nvarchar(30)",
                maxLength: 30,
                nullable: false,
                defaultValue: "Standard");

            migrationBuilder.AddColumn<bool>(
                name: "HasSeenPlacementPrompt",
                table: "AspNetUsers",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "InitialConfidenceTier",
                table: "AspNetUsers",
                type: "nvarchar(20)",
                maxLength: 20,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "InitialEstimatedLevel",
                table: "AspNetUsers",
                type: "nvarchar(20)",
                maxLength: 20,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "InitialProficiencySnapshotJson",
                table: "AspNetUsers",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "PlacementTestCompletedAtUtc",
                table: "AspNetUsers",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PlacementTestStatus",
                table: "AspNetUsers",
                type: "nvarchar(30)",
                maxLength: 30,
                nullable: false,
                defaultValue: "NotStarted");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "AssessmentStateJson",
                table: "RoleplaySessions");

            migrationBuilder.DropColumn(
                name: "SessionType",
                table: "RoleplaySessions");

            migrationBuilder.DropColumn(
                name: "HasSeenPlacementPrompt",
                table: "AspNetUsers");

            migrationBuilder.DropColumn(
                name: "InitialConfidenceTier",
                table: "AspNetUsers");

            migrationBuilder.DropColumn(
                name: "InitialEstimatedLevel",
                table: "AspNetUsers");

            migrationBuilder.DropColumn(
                name: "InitialProficiencySnapshotJson",
                table: "AspNetUsers");

            migrationBuilder.DropColumn(
                name: "PlacementTestCompletedAtUtc",
                table: "AspNetUsers");

            migrationBuilder.DropColumn(
                name: "PlacementTestStatus",
                table: "AspNetUsers");
        }
    }
}
