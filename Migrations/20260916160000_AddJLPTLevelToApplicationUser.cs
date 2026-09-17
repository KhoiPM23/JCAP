using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace JCAP.Migrations
{
    /// <inheritdoc />
    public partial class AddJLPTLevelToApplicationUser : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "JLPTLevel",
                table: "AspNetUsers",
                type: "nvarchar(10)",
                maxLength: 10,
                nullable: false,
                defaultValue: "N5");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "JLPTLevel",
                table: "AspNetUsers");
        }
    }
}
