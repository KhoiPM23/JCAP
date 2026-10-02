using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace JCAP.Migrations
{
    /// <inheritdoc />
    public partial class CorrectIncompleteRoleplayResults : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                """
                UPDATE result
                SET
                    result.[PassStatus] = CAST(0 AS bit),
                    result.[OverallScore] = CASE
                        WHEN result.[OverallScore] >= 60 THEN 59
                        ELSE result.[OverallScore]
                    END,
                    result.[GeneralFeedbackText] = CASE
                        WHEN result.[GeneralFeedbackText] LIKE N'Bạn chưa hoàn thành đủ nhiệm vụ%'
                            THEN result.[GeneralFeedbackText]
                        ELSE CONCAT(
                            N'Bạn chưa hoàn thành đủ nhiệm vụ (',
                            (
                                SELECT COUNT(*)
                                FROM [RoleplaySessionMissions] AS completedMission
                                WHERE completedMission.[RoleplaySessionId] = result.[RoleplaySessionId]
                                  AND completedMission.[IsCompleted] = CAST(1 AS bit)
                            ),
                            N'/',
                            (
                                SELECT COUNT(*)
                                FROM [RoleplaySessionMissions] AS totalMission
                                WHERE totalMission.[RoleplaySessionId] = result.[RoleplaySessionId]
                            ),
                            N'), nên kết quả phiên này là Chưa đạt. ',
                            result.[GeneralFeedbackText]
                        )
                    END
                FROM [RoleplayResults] AS result
                WHERE EXISTS (
                    SELECT 1
                    FROM [RoleplaySessionMissions] AS anyMission
                    WHERE anyMission.[RoleplaySessionId] = result.[RoleplaySessionId]
                )
                AND EXISTS (
                    SELECT 1
                    FROM [RoleplaySessionMissions] AS incompleteMission
                    WHERE incompleteMission.[RoleplaySessionId] = result.[RoleplaySessionId]
                      AND incompleteMission.[IsCompleted] = CAST(0 AS bit)
                );
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Data correction is intentionally irreversible because the previous
            // PassStatus and capped score cannot be reconstructed reliably.
        }
    }
}
