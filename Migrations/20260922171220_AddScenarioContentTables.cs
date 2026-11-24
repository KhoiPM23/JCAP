using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace JCAP.Migrations
{
    /// <inheritdoc />
    public partial class AddScenarioContentTables : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // The original scenario tables were created outside migrations on early team databases.
            // Restore that prerequisite for a clean database before the historical column/FK changes.
            // Databases that already applied this migration are unaffected.
            migrationBuilder.Sql("""
                IF OBJECT_ID(N'[dbo].[Scenarios]', N'U') IS NULL
                BEGIN
                    CREATE TABLE [dbo].[Scenarios] (
                        [Id] int NOT NULL IDENTITY,
                        [Title] nvarchar(200) NOT NULL,
                        [Description] nvarchar(1000) NOT NULL,
                        [Thumbnail] nvarchar(500) NULL,
                        [IsActive] bit NOT NULL,
                        [ScenarioCode] nvarchar(50) NULL,
                        CONSTRAINT [PK_Scenarios] PRIMARY KEY ([Id])
                    );
                END;
                IF OBJECT_ID(N'[dbo].[ScenarioLevelConfigurations]', N'U') IS NULL
                BEGIN
                    CREATE TABLE [dbo].[ScenarioLevelConfigurations] (
                        [Id] int NOT NULL IDENTITY,
                        [ScenarioId] int NOT NULL,
                        [JLPTLevel] nvarchar(10) NOT NULL,
                        [Title] nvarchar(200) NOT NULL,
                        [Description] nvarchar(1000) NOT NULL,
                        [AiPersona] nvarchar(100) NOT NULL,
                        [CreditCost] int NOT NULL,
                        [Status] nvarchar(20) NOT NULL DEFAULT N'Draft',
                        [CreatedAt] datetime2 NOT NULL,
                        [UpdatedAt] datetime2 NULL,
                        CONSTRAINT [PK_ScenarioLevelConfigurations] PRIMARY KEY ([Id]),
                        CONSTRAINT [FK_ScenarioLevelConfigurations_Scenarios_ScenarioId]
                            FOREIGN KEY ([ScenarioId]) REFERENCES [dbo].[Scenarios] ([Id]) ON DELETE CASCADE
                    );
                    CREATE UNIQUE INDEX [IX_ScenarioLevelConfigurations_ScenarioId_JLPTLevel]
                        ON [dbo].[ScenarioLevelConfigurations] ([ScenarioId], [JLPTLevel]);
                END;
                IF OBJECT_ID(N'[dbo].[Missions]', N'U') IS NULL
                BEGIN
                    CREATE TABLE [dbo].[Missions] (
                        [Id] int NOT NULL IDENTITY,
                        [ScenarioLevelConfigurationId] int NOT NULL,
                        [Content] nvarchar(500) NOT NULL,
                        [Order] int NOT NULL,
                        [CompletionCriteria] nvarchar(1000) NOT NULL,
                        CONSTRAINT [PK_Missions] PRIMARY KEY ([Id]),
                        CONSTRAINT [FK_Missions_ScenarioLevelConfigurations_ScenarioLevelConfigurationId]
                            FOREIGN KEY ([ScenarioLevelConfigurationId]) REFERENCES [dbo].[ScenarioLevelConfigurations] ([Id]) ON DELETE CASCADE
                    );
                    CREATE INDEX [IX_Missions_ScenarioLevelConfigurationId] ON [dbo].[Missions] ([ScenarioLevelConfigurationId]);
                END;
                IF OBJECT_ID(N'[dbo].[TargetVocabularies]', N'U') IS NULL
                BEGIN
                    CREATE TABLE [dbo].[TargetVocabularies] (
                        [Id] int NOT NULL IDENTITY,
                        [ScenarioId] int NOT NULL,
                        [Word] nvarchar(100) NOT NULL,
                        [Reading] nvarchar(100) NULL,
                        [Meaning] nvarchar(200) NOT NULL,
                        CONSTRAINT [PK_TargetVocabularies] PRIMARY KEY ([Id]),
                        CONSTRAINT [FK_TargetVocabularies_Scenarios_ScenarioId]
                            FOREIGN KEY ([ScenarioId]) REFERENCES [dbo].[Scenarios] ([Id]) ON DELETE CASCADE
                    );
                    CREATE INDEX [IX_TargetVocabularies_ScenarioId] ON [dbo].[TargetVocabularies] ([ScenarioId]);
                END;
                IF OBJECT_ID(N'[dbo].[TargetGrammars]', N'U') IS NULL
                BEGIN
                    CREATE TABLE [dbo].[TargetGrammars] (
                        [Id] int NOT NULL IDENTITY,
                        [ScenarioId] int NOT NULL,
                        [Pattern] nvarchar(100) NOT NULL,
                        [Meaning] nvarchar(200) NOT NULL,
                        [ExampleSentence] nvarchar(500) NULL,
                        CONSTRAINT [PK_TargetGrammars] PRIMARY KEY ([Id]),
                        CONSTRAINT [FK_TargetGrammars_Scenarios_ScenarioId]
                            FOREIGN KEY ([ScenarioId]) REFERENCES [dbo].[Scenarios] ([Id]) ON DELETE CASCADE
                    );
                    CREATE INDEX [IX_TargetGrammars_ScenarioId] ON [dbo].[TargetGrammars] ([ScenarioId]);
                END;
                """);

            migrationBuilder.DropColumn(
                name: "CompletionCriteria",
                table: "Missions");

            migrationBuilder.AddColumn<string>(
                name: "CompletionCriteriaJson",
                table: "Missions",
                type: "nvarchar(max)",
                nullable: false,
                defaultValue: "");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "CompletionCriteriaJson",
                table: "Missions");

            migrationBuilder.AddColumn<string>(
                name: "CompletionCriteria",
                table: "Missions",
                type: "nvarchar(1000)",
                maxLength: 1000,
                nullable: false,
                defaultValue: "");
        }
    }
}
