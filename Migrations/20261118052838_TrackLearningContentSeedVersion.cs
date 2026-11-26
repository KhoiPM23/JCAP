using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace JCAP.Migrations
{
    /// <inheritdoc />
    public partial class TrackLearningContentSeedVersion : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "LearningContentSeedStates",
                columns: table => new
                {
                    Key = table.Column<string>(type: "varchar(100)", unicode: false, maxLength: 100, nullable: false),
                    Version = table.Column<string>(type: "varchar(64)", unicode: false, maxLength: 64, nullable: false),
                    CompletedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_LearningContentSeedStates", x => x.Key);
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "LearningContentSeedStates");
        }
    }
}
