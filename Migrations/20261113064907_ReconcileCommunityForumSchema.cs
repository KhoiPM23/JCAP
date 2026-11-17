using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace JCAP.Migrations
{
    /// <inheritdoc />
    public partial class ReconcileCommunityForumSchema : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Các DB hiện có từ develop đã được FeedbackSeeder tạo sẵn các bảng Community*.
            // Tạo idempotent để máy chưa có bảng vẫn migrate đủ, máy đã có bảng không bị lỗi trùng và không mất dữ liệu.
            migrationBuilder.Sql("""
IF OBJECT_ID(N'[dbo].[CommunityPosts]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[CommunityPosts] (
        [Id] int NOT NULL IDENTITY,
        [AuthorUserId] nvarchar(450) NOT NULL,
        [AuthorDisplayName] nvarchar(150) NOT NULL,
        [AuthorAvatarUrl] nvarchar(500) NULL,
        [AuthorLevel] nvarchar(20) NOT NULL,
        [AuthorRole] nvarchar(20) NOT NULL,
        [IsAnonymous] bit NOT NULL,
        [Channel] nvarchar(40) NOT NULL,
        [Title] nvarchar(300) NOT NULL,
        [Content] nvarchar(max) NOT NULL,
        [IsPinned] bit NOT NULL,
        [IsSolved] bit NOT NULL,
        [Upvotes] int NOT NULL,
        [Views] int NOT NULL,
        [CreatedAt] datetime2 NOT NULL,
        [UpdatedAt] datetime2 NOT NULL,
        CONSTRAINT [PK_CommunityPosts] PRIMARY KEY ([Id])
    );
END;

IF OBJECT_ID(N'[dbo].[CommunityComments]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[CommunityComments] (
        [Id] int NOT NULL IDENTITY,
        [CommunityPostId] int NOT NULL,
        [ParentCommentId] int NULL,
        [AuthorUserId] nvarchar(450) NOT NULL,
        [AuthorDisplayName] nvarchar(150) NOT NULL,
        [AuthorAvatarUrl] nvarchar(500) NULL,
        [AuthorLevel] nvarchar(20) NOT NULL,
        [AuthorRole] nvarchar(20) NOT NULL,
        [IsAnonymous] bit NOT NULL,
        [Content] nvarchar(max) NOT NULL,
        [Upvotes] int NOT NULL,
        [IsAcceptedAnswer] bit NOT NULL,
        [CreatedAt] datetime2 NOT NULL,
        CONSTRAINT [PK_CommunityComments] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_CommunityComments_CommunityPosts_CommunityPostId] FOREIGN KEY ([CommunityPostId]) REFERENCES [dbo].[CommunityPosts] ([Id]) ON DELETE CASCADE
    );
END;

IF OBJECT_ID(N'[dbo].[CommunityPostUpvotes]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[CommunityPostUpvotes] (
        [Id] int NOT NULL IDENTITY,
        [CommunityPostId] int NOT NULL,
        [UserId] nvarchar(450) NOT NULL,
        [CreatedAt] datetime2 NOT NULL,
        CONSTRAINT [PK_CommunityPostUpvotes] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_CommunityPostUpvotes_CommunityPosts_CommunityPostId] FOREIGN KEY ([CommunityPostId]) REFERENCES [dbo].[CommunityPosts] ([Id]) ON DELETE CASCADE
    );
END;

IF OBJECT_ID(N'[dbo].[CommunityAttachments]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[CommunityAttachments] (
        [Id] int NOT NULL IDENTITY,
        [CommunityPostId] int NULL,
        [CommunityCommentId] int NULL,
        [FileName] nvarchar(260) NOT NULL,
        [FileSize] bigint NOT NULL,
        [FileType] nvarchar(20) NOT NULL,
        [Url] nvarchar(max) NOT NULL,
        [CreatedAt] datetime2 NOT NULL,
        CONSTRAINT [PK_CommunityAttachments] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_CommunityAttachments_CommunityComments_CommunityCommentId] FOREIGN KEY ([CommunityCommentId]) REFERENCES [dbo].[CommunityComments] ([Id]),
        CONSTRAINT [FK_CommunityAttachments_CommunityPosts_CommunityPostId] FOREIGN KEY ([CommunityPostId]) REFERENCES [dbo].[CommunityPosts] ([Id]) ON DELETE CASCADE
    );
END;

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_CommunityAttachments_CommunityComments_CommunityCommentId')
    AND NOT EXISTS (
        SELECT 1 FROM [dbo].[CommunityAttachments] a
        WHERE a.[CommunityCommentId] IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM [dbo].[CommunityComments] c WHERE c.[Id] = a.[CommunityCommentId])
    )
BEGIN
    ALTER TABLE [dbo].[CommunityAttachments] WITH CHECK
        ADD CONSTRAINT [FK_CommunityAttachments_CommunityComments_CommunityCommentId]
        FOREIGN KEY ([CommunityCommentId]) REFERENCES [dbo].[CommunityComments] ([Id]);
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'[dbo].[CommunityAttachments]') AND name = N'IX_CommunityAttachments_CommunityCommentId')
    CREATE INDEX [IX_CommunityAttachments_CommunityCommentId] ON [dbo].[CommunityAttachments] ([CommunityCommentId]);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'[dbo].[CommunityAttachments]') AND name = N'IX_CommunityAttachments_CommunityPostId')
    CREATE INDEX [IX_CommunityAttachments_CommunityPostId] ON [dbo].[CommunityAttachments] ([CommunityPostId]);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'[dbo].[CommunityComments]') AND name = N'IX_CommunityComments_PostId_CreatedAt')
    CREATE INDEX [IX_CommunityComments_PostId_CreatedAt] ON [dbo].[CommunityComments] ([CommunityPostId], [CreatedAt]);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'[dbo].[CommunityPosts]') AND name = N'IX_CommunityPosts_Pinned_CreatedAt')
    CREATE INDEX [IX_CommunityPosts_Pinned_CreatedAt] ON [dbo].[CommunityPosts] ([IsPinned], [CreatedAt]);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'[dbo].[CommunityPostUpvotes]') AND name = N'IX_CommunityPostUpvotes_PostId_UserId')
    CREATE UNIQUE INDEX [IX_CommunityPostUpvotes_PostId_UserId] ON [dbo].[CommunityPostUpvotes] ([CommunityPostId], [UserId]);
""");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Giữ lại dữ liệu diễn đàn vì các bảng này có thể đã tồn tại từ FeedbackSeeder trước migration này.
        }
    }
}
