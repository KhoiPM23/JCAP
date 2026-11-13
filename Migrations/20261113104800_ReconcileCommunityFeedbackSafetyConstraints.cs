using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace JCAP.Migrations
{
    /// <inheritdoc />
    public partial class ReconcileCommunityFeedbackSafetyConstraints : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Đảm bảo không tồn tại ràng buộc khoá ngoại AuthorUserId gây lỗi khi xoá/mock user,
            // đồng thời kiểm tra tính toàn vẹn và đảm bảo các index Community Forum & Feedback đều sẵn sàng.
            migrationBuilder.Sql("""
IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_CommunityPosts_AspNetUsers_AuthorUserId')
BEGIN
    ALTER TABLE [dbo].[CommunityPosts] DROP CONSTRAINT [FK_CommunityPosts_AspNetUsers_AuthorUserId];
END;

IF OBJECT_ID(N'[dbo].[CommunityPosts]', N'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'[dbo].[CommunityPosts]') AND name = N'IX_CommunityPosts_Pinned_CreatedAt')
BEGIN
    CREATE INDEX [IX_CommunityPosts_Pinned_CreatedAt] ON [dbo].[CommunityPosts] ([IsPinned], [CreatedAt]);
END;

IF OBJECT_ID(N'[dbo].[CommunityComments]', N'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'[dbo].[CommunityComments]') AND name = N'IX_CommunityComments_PostId_CreatedAt')
BEGIN
    CREATE INDEX [IX_CommunityComments_PostId_CreatedAt] ON [dbo].[CommunityComments] ([CommunityPostId], [CreatedAt]);
END;
""");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
        }
    }
}

