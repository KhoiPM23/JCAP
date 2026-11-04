using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace JCAP.Migrations;

/// <summary>Track the feedback schema already bootstrapped by develop's FeedbackSeeder.</summary>
public partial class ReconcileDevelopFeedbackSchema : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        // Some team databases already have these tables from the legacy seeder.
        // Adopt them without dropping data; create missing tables/indexes on other databases.
        migrationBuilder.Sql("""
IF OBJECT_ID(N'[dbo].[FeedbackTickets]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[FeedbackTickets] (
        [Id] int NOT NULL IDENTITY,
        [UserId] nvarchar(450) NOT NULL,
        [AnonymousCode] nvarchar(30) NOT NULL,
        [Title] nvarchar(300) NOT NULL,
        [Category] nvarchar(50) NOT NULL,
        [Status] nvarchar(30) NOT NULL,
        [AdminSeenAt] datetime2 NULL,
        [CreatedAt] datetime2 NOT NULL,
        [UpdatedAt] datetime2 NOT NULL,
        [ClosedAt] datetime2 NULL,
        CONSTRAINT [PK_FeedbackTickets] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_FeedbackTickets_AspNetUsers_UserId] FOREIGN KEY ([UserId]) REFERENCES [dbo].[AspNetUsers] ([Id]) ON DELETE NO ACTION
    );
END;

IF OBJECT_ID(N'[dbo].[FeedbackMessages]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[FeedbackMessages] (
        [Id] int NOT NULL IDENTITY,
        [FeedbackTicketId] int NOT NULL,
        [SenderRole] nvarchar(20) NOT NULL,
        [Content] nvarchar(max) NOT NULL,
        [CreatedAt] datetime2 NOT NULL,
        CONSTRAINT [PK_FeedbackMessages] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_FeedbackMessages_FeedbackTickets_FeedbackTicketId] FOREIGN KEY ([FeedbackTicketId]) REFERENCES [dbo].[FeedbackTickets] ([Id]) ON DELETE CASCADE
    );
END;

IF OBJECT_ID(N'[dbo].[FeedbackAttachments]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[FeedbackAttachments] (
        [Id] int NOT NULL IDENTITY,
        [FeedbackMessageId] int NOT NULL,
        [FileName] nvarchar(260) NOT NULL,
        [FileSize] bigint NOT NULL,
        [FileType] nvarchar(20) NOT NULL,
        [MimeType] nvarchar(120) NOT NULL,
        [CloudinaryUrl] nvarchar(max) NOT NULL,
        [CloudinaryPublicId] nvarchar(300) NOT NULL,
        [CreatedAt] datetime2 NOT NULL,
        CONSTRAINT [PK_FeedbackAttachments] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_FeedbackAttachments_FeedbackMessages_FeedbackMessageId] FOREIGN KEY ([FeedbackMessageId]) REFERENCES [dbo].[FeedbackMessages] ([Id]) ON DELETE CASCADE
    );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'[dbo].[FeedbackTickets]') AND name = N'IX_FeedbackTickets_UserId_UpdatedAt')
    CREATE INDEX [IX_FeedbackTickets_UserId_UpdatedAt] ON [dbo].[FeedbackTickets] ([UserId], [UpdatedAt]);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'[dbo].[FeedbackTickets]') AND name = N'IX_FeedbackTickets_Status_UpdatedAt')
    CREATE INDEX [IX_FeedbackTickets_Status_UpdatedAt] ON [dbo].[FeedbackTickets] ([Status], [UpdatedAt]);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'[dbo].[FeedbackMessages]') AND name = N'IX_FeedbackMessages_TicketId_CreatedAt')
    CREATE INDEX [IX_FeedbackMessages_TicketId_CreatedAt] ON [dbo].[FeedbackMessages] ([FeedbackTicketId], [CreatedAt]);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'[dbo].[FeedbackAttachments]') AND name = N'IX_FeedbackAttachments_MessageId')
    CREATE INDEX [IX_FeedbackAttachments_MessageId] ON [dbo].[FeedbackAttachments] ([FeedbackMessageId]);
""");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        // Relinquish EF tracking but retain feedback data: the tables can predate
        // this migration and are still needed by older versions of FeedbackSeeder.
    }
}
