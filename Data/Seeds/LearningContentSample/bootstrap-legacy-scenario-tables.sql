-- Manual bootstrap ONLY for the old fresh-database migration gap.
-- Select the intended local application database in SQL Server first.
-- Generated from AddScenarioContentTables.TargetModel; Missions retains
-- the pre-migration CompletionCriteria column for the pending migration.
-- No application rows or migration-history rows are inserted/modified.
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.__EFMigrationsHistory', N'U') IS NULL
    THROW 51000, 'Missing EF migration history; bootstrap is not applicable.', 1;

DECLARE @lastMigration nvarchar(150);
SELECT @lastMigration = MAX([MigrationId]) FROM [__EFMigrationsHistory];
IF @lastMigration IS NULL OR @lastMigration <> N'20260916160000_AddJLPTLevelToApplicationUser'
    THROW 51000, 'Unexpected migration state; do not run this bootstrap.', 1;

IF EXISTS (SELECT 1 FROM sys.tables WHERE [name] IN
    (N'Scenarios', N'ScenarioLevelConfigurations', N'Missions', N'TargetGrammars', N'TargetVocabularies'))
    THROW 51000, 'Scenario tables already exist; do not run this bootstrap.', 1;

CREATE TABLE [Scenarios] (
    [Id] int NOT NULL IDENTITY,
    [Description] nvarchar(1000) NOT NULL,
    [IsActive] bit NOT NULL,
    [ScenarioCode] nvarchar(50) NULL,
    [Thumbnail] nvarchar(500) NULL,
    [Title] nvarchar(200) NOT NULL,
    CONSTRAINT [PK_Scenarios] PRIMARY KEY ([Id])
);

CREATE TABLE [ScenarioLevelConfigurations] (
    [Id] int NOT NULL IDENTITY,
    [ScenarioId] int NOT NULL,
    [AiPersona] nvarchar(100) NOT NULL,
    [CreatedAt] datetime2 NOT NULL,
    [CreditCost] int NOT NULL,
    [Description] nvarchar(1000) NOT NULL,
    [JLPTLevel] nvarchar(10) NOT NULL,
    [Status] nvarchar(20) NOT NULL DEFAULT N'Draft',
    [Title] nvarchar(200) NOT NULL,
    [UpdatedAt] datetime2 NULL,
    CONSTRAINT [PK_ScenarioLevelConfigurations] PRIMARY KEY ([Id]),
    CONSTRAINT [FK_ScenarioLevelConfigurations_Scenarios_ScenarioId] FOREIGN KEY ([ScenarioId]) REFERENCES [Scenarios] ([Id]) ON DELETE CASCADE
);

CREATE TABLE [TargetGrammars] (
    [Id] int NOT NULL IDENTITY,
    [ScenarioId] int NOT NULL,
    [ExampleSentence] nvarchar(500) NULL,
    [Meaning] nvarchar(200) NOT NULL,
    [Pattern] nvarchar(100) NOT NULL,
    CONSTRAINT [PK_TargetGrammars] PRIMARY KEY ([Id]),
    CONSTRAINT [FK_TargetGrammars_Scenarios_ScenarioId] FOREIGN KEY ([ScenarioId]) REFERENCES [Scenarios] ([Id]) ON DELETE CASCADE
);

CREATE TABLE [TargetVocabularies] (
    [Id] int NOT NULL IDENTITY,
    [ScenarioId] int NOT NULL,
    [Meaning] nvarchar(200) NOT NULL,
    [Reading] nvarchar(100) NULL,
    [Word] nvarchar(100) NOT NULL,
    CONSTRAINT [PK_TargetVocabularies] PRIMARY KEY ([Id]),
    CONSTRAINT [FK_TargetVocabularies_Scenarios_ScenarioId] FOREIGN KEY ([ScenarioId]) REFERENCES [Scenarios] ([Id]) ON DELETE CASCADE
);

CREATE TABLE [Missions] (
    [Id] int NOT NULL IDENTITY,
    [ScenarioLevelConfigurationId] int NOT NULL,
    [CompletionCriteria] nvarchar(1000) NOT NULL,
    [Content] nvarchar(500) NOT NULL,
    [Order] int NOT NULL,
    CONSTRAINT [PK_Missions] PRIMARY KEY ([Id]),
    CONSTRAINT [FK_Missions_ScenarioLevelConfigurations_ScenarioLevelConfigurationId] FOREIGN KEY ([ScenarioLevelConfigurationId]) REFERENCES [ScenarioLevelConfigurations] ([Id]) ON DELETE CASCADE
);

CREATE INDEX [IX_Missions_ScenarioLevelConfigurationId] ON [Missions] ([ScenarioLevelConfigurationId]);
CREATE UNIQUE INDEX [IX_ScenarioLevelConfigurations_ScenarioId_JLPTLevel] ON [ScenarioLevelConfigurations] ([ScenarioId], [JLPTLevel]);
CREATE INDEX [IX_TargetGrammars_ScenarioId] ON [TargetGrammars] ([ScenarioId]);
CREATE INDEX [IX_TargetVocabularies_ScenarioId] ON [TargetVocabularies] ([ScenarioId]);

COMMIT TRANSACTION;
