using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace JCAP.Migrations
{
    /// <inheritdoc />
    public partial class AddShadowingPracticeProgress : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<int>(
                name: "OverallScore",
                table: "ShadowingSentenceEvaluations",
                type: "int",
                nullable: true,
                oldClrType: typeof(int),
                oldType: "int");

            migrationBuilder.AlterColumn<int>(
                name: "ContentMatchScore",
                table: "ShadowingSentenceEvaluations",
                type: "int",
                nullable: true,
                oldClrType: typeof(int),
                oldType: "int");

            migrationBuilder.AddColumn<Guid>(
                name: "ClientSubmissionId",
                table: "ShadowingSentenceEvaluations",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ErrorCode",
                table: "ShadowingSentenceEvaluations",
                type: "nvarchar(50)",
                maxLength: 50,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "RecognitionMode",
                table: "ShadowingSentenceEvaluations",
                type: "nvarchar(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<Guid>(
                name: "ShadowingPracticeProgressId",
                table: "ShadowingSentenceEvaluations",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "ShadowingPracticeProgresses",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(450)", nullable: false),
                    ShadowingDialogueId = table.Column<int>(type: "int", nullable: false),
                    LearnerRole = table.Column<string>(type: "nvarchar(5)", maxLength: 5, nullable: false),
                    Status = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    CurrentSentenceIndex = table.Column<int>(type: "int", nullable: false),
                    StartedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    LastActivityAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    CompletedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    ShadowingPracticeSessionId = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ShadowingPracticeProgresses", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ShadowingPracticeProgresses_AspNetUsers_UserId",
                        column: x => x.UserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ShadowingPracticeProgresses_ShadowingDialogues_ShadowingDialogueId",
                        column: x => x.ShadowingDialogueId,
                        principalTable: "ShadowingDialogues",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ShadowingPracticeProgresses_ShadowingPracticeSessions_ShadowingPracticeSessionId",
                        column: x => x.ShadowingPracticeSessionId,
                        principalTable: "ShadowingPracticeSessions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ShadowingSentenceEvaluations_ShadowingPracticeProgressId",
                table: "ShadowingSentenceEvaluations",
                column: "ShadowingPracticeProgressId");

            migrationBuilder.CreateIndex(
                name: "IX_ShadowingSentenceEvaluations_UserId_ClientSubmissionId",
                table: "ShadowingSentenceEvaluations",
                columns: new[] { "UserId", "ClientSubmissionId" },
                unique: true,
                filter: "[ClientSubmissionId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_ShadowingPracticeProgresses_ShadowingDialogueId",
                table: "ShadowingPracticeProgresses",
                column: "ShadowingDialogueId");

            migrationBuilder.CreateIndex(
                name: "IX_ShadowingPracticeProgresses_ShadowingPracticeSessionId",
                table: "ShadowingPracticeProgresses",
                column: "ShadowingPracticeSessionId");

            migrationBuilder.CreateIndex(
                name: "IX_ShadowingPracticeProgresses_UserId_LastActivityAt",
                table: "ShadowingPracticeProgresses",
                columns: new[] { "UserId", "LastActivityAt" });

            migrationBuilder.CreateIndex(
                name: "UX_ShadowingPracticeProgresses_ActivePerRole",
                table: "ShadowingPracticeProgresses",
                columns: new[] { "UserId", "ShadowingDialogueId", "LearnerRole" },
                unique: true,
                filter: "[Status] = N'in_progress'");

            migrationBuilder.AddForeignKey(
                name: "FK_ShadowingSentenceEvaluations_ShadowingPracticeProgresses_ShadowingPracticeProgressId",
                table: "ShadowingSentenceEvaluations",
                column: "ShadowingPracticeProgressId",
                principalTable: "ShadowingPracticeProgresses",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_ShadowingSentenceEvaluations_ShadowingPracticeProgresses_ShadowingPracticeProgressId",
                table: "ShadowingSentenceEvaluations");

            migrationBuilder.DropTable(
                name: "ShadowingPracticeProgresses");

            migrationBuilder.DropIndex(
                name: "IX_ShadowingSentenceEvaluations_ShadowingPracticeProgressId",
                table: "ShadowingSentenceEvaluations");

            migrationBuilder.DropIndex(
                name: "IX_ShadowingSentenceEvaluations_UserId_ClientSubmissionId",
                table: "ShadowingSentenceEvaluations");

            migrationBuilder.DropColumn(
                name: "ClientSubmissionId",
                table: "ShadowingSentenceEvaluations");

            migrationBuilder.DropColumn(
                name: "ErrorCode",
                table: "ShadowingSentenceEvaluations");

            migrationBuilder.DropColumn(
                name: "RecognitionMode",
                table: "ShadowingSentenceEvaluations");

            migrationBuilder.DropColumn(
                name: "ShadowingPracticeProgressId",
                table: "ShadowingSentenceEvaluations");

            // CHỈ DÙNG Ở DEV. Cột điểm cũ không cho phép NULL. KHÔNG đổi "chưa chấm được" thành 0 điểm (sẽ làm sai lịch sử):
            // xóa các lần chấm không có điểm trước khi trả cột về NOT NULL. Dữ liệu này mất khi gỡ migration.
            migrationBuilder.Sql(
                "DELETE FROM [ShadowingSentenceEvaluations] WHERE [ContentMatchScore] IS NULL OR [OverallScore] IS NULL;");

            migrationBuilder.AlterColumn<int>(
                name: "OverallScore",
                table: "ShadowingSentenceEvaluations",
                type: "int",
                nullable: false,
                defaultValue: 0,
                oldClrType: typeof(int),
                oldType: "int",
                oldNullable: true);

            migrationBuilder.AlterColumn<int>(
                name: "ContentMatchScore",
                table: "ShadowingSentenceEvaluations",
                type: "int",
                nullable: false,
                defaultValue: 0,
                oldClrType: typeof(int),
                oldType: "int",
                oldNullable: true);
        }
    }
}
