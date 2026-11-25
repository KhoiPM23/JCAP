using Microsoft.EntityFrameworkCore.Migrations;

namespace JCAP.Migrations;

public partial class ClearLearningTopics : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("DELETE FROM [LearningTopics];");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        // The previous topics and their links are data, so the schema rollback cannot recreate them.
    }
}
