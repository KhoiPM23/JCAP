using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace JCAP.Migrations
{
    /// <inheritdoc />
    public partial class AddScenarioAndContentEntities : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(@"
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Scenarios')
BEGIN
    CREATE TABLE [Scenarios] (
        [Id] int NOT NULL IDENTITY,
        [Title] nvarchar(200) NOT NULL,
        [Description] nvarchar(1000) NOT NULL,
        [Thumbnail] nvarchar(500) NULL,
        [IsActive] bit NOT NULL,
        [ScenarioCode] nvarchar(50) NULL,
        CONSTRAINT [PK_Scenarios] PRIMARY KEY ([Id])
    );
END
");

            migrationBuilder.Sql(@"
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ScenarioLevelConfigurations')
BEGIN
    CREATE TABLE [ScenarioLevelConfigurations] (
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
        CONSTRAINT [FK_ScenarioLevelConfigurations_Scenarios_ScenarioId] FOREIGN KEY ([ScenarioId]) REFERENCES [Scenarios] ([Id]) ON DELETE CASCADE
    );
    CREATE UNIQUE INDEX [IX_ScenarioLevelConfigurations_ScenarioId_JLPTLevel] ON [ScenarioLevelConfigurations] ([ScenarioId], [JLPTLevel]);
END
");

            migrationBuilder.Sql(@"
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Missions')
BEGIN
    CREATE TABLE [Missions] (
        [Id] int NOT NULL IDENTITY,
        [ScenarioLevelConfigurationId] int NOT NULL,
        [Content] nvarchar(500) NOT NULL,
        [Order] int NOT NULL,
        [CompletionCriteriaJson] nvarchar(max) NOT NULL,
        CONSTRAINT [PK_Missions] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_Missions_ScenarioLevelConfigurations_ScenarioLevelConfigurationId] FOREIGN KEY ([ScenarioLevelConfigurationId]) REFERENCES [ScenarioLevelConfigurations] ([Id]) ON DELETE CASCADE
    );
    CREATE INDEX [IX_Missions_ScenarioLevelConfigurationId] ON [Missions] ([ScenarioLevelConfigurationId]);
END
");

            migrationBuilder.Sql(@"
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'TargetGrammars')
BEGIN
    CREATE TABLE [TargetGrammars] (
        [Id] int NOT NULL IDENTITY,
        [ScenarioLevelConfigurationId] int NOT NULL,
        [Pattern] nvarchar(100) NOT NULL,
        [Meaning] nvarchar(200) NOT NULL,
        [ExampleSentence] nvarchar(500) NULL,
        CONSTRAINT [PK_TargetGrammars] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_TargetGrammars_ScenarioLevelConfigurations_ScenarioLevelConfigurationId] FOREIGN KEY ([ScenarioLevelConfigurationId]) REFERENCES [ScenarioLevelConfigurations] ([Id]) ON DELETE CASCADE
    );
    CREATE INDEX [IX_TargetGrammars_ScenarioLevelConfigurationId] ON [TargetGrammars] ([ScenarioLevelConfigurationId]);
END
");

            migrationBuilder.Sql(@"
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'TargetVocabularies')
BEGIN
    CREATE TABLE [TargetVocabularies] (
        [Id] int NOT NULL IDENTITY,
        [ScenarioLevelConfigurationId] int NOT NULL,
        [Word] nvarchar(100) NOT NULL,
        [Reading] nvarchar(100) NULL,
        [Meaning] nvarchar(200) NOT NULL,
        CONSTRAINT [PK_TargetVocabularies] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_TargetVocabularies_ScenarioLevelConfigurations_ScenarioLevelConfigurationId] FOREIGN KEY ([ScenarioLevelConfigurationId]) REFERENCES [ScenarioLevelConfigurations] ([Id]) ON DELETE CASCADE
    );
    CREATE INDEX [IX_TargetVocabularies_ScenarioLevelConfigurationId] ON [TargetVocabularies] ([ScenarioLevelConfigurationId]);
END
");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "TargetVocabularies");

            migrationBuilder.DropTable(
                name: "TargetGrammars");

            migrationBuilder.DropTable(
                name: "Missions");

            migrationBuilder.DropTable(
                name: "ScenarioLevelConfigurations");

            migrationBuilder.DropTable(
                name: "Scenarios");
        }
    }
}

