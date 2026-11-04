using ClosedXML.Excel;
using System.IO.Compression;
using JCAP.Data;
using JCAP.Models;
using JCAP.Services.Implementations;
using Microsoft.EntityFrameworkCore;

namespace JCAP.Tests.Services;

public class AdminLearningImportServiceTests
{
    private static AppDbContext Db() => new(new DbContextOptionsBuilder<AppDbContext>()
        .UseInMemoryDatabase($"LearningImport_{Guid.NewGuid()}").Options);

    private static byte[] Workbook(Action<XLWorkbook>? change = null)
    {
        using var input = new MemoryStream(LearningImportWorkbook.Template());
        using var book = new XLWorkbook(input); change?.Invoke(book);
        using var output = new MemoryStream(); book.SaveAs(output); return output.ToArray();
    }
    private static void Source(XLWorkbook book)
    {
        var sheet = book.Worksheet("Sources");
        string[] source = ["S001", "Test dataset", "v1", "https://example.org/data", "CC BY 4.0", "https://creativecommons.org/licenses/by/4.0/", "Test author"];
        for (var i = 0; i < source.Length; i++) sheet.Cell(2, i + 1).Value = source[i];
        book.Worksheet("Vocabularies").Cell("J2").Value = "S001";
        book.Worksheet("Vocabularies").Cell("K2").Value = "word-1";
        book.Worksheet("Grammars").Cell("J2").Value = "S001";
        book.Worksheet("Grammars").Cell("K2").Value = "grammar-1";
        book.Worksheet("Examples").Cell("F2").Value = "S001";
        book.Worksheet("Examples").Cell("G2").Value = "sentence-1";
    }

    [Fact]
    public async Task Template_PreviewsWithoutWriting_ThenImportsCompleteGraph()
    {
        await using var db = Db(); var service = new AdminLearningImportService(db);
        var file = Workbook(Source); var preview = await service.PreviewAsync(file, "data.xlsx");
        Assert.True(preview.CanImport, string.Join("; ", preview.Issues)); Assert.False(preview.Imported);
        Assert.Equal(1, preview.NewTopics); Assert.Equal(1, preview.NewVocabularies); Assert.Equal(1, preview.NewGrammars);
        Assert.Equal(2, preview.NewExamples); Assert.Equal(2, preview.NewLinks); Assert.Equal(1, preview.NewSources);
        Assert.All(db.ChangeTracker.Entries(), e => Assert.Equal(EntityState.Unchanged, e.State));
        Assert.Empty(await db.Vocabularies.ToListAsync()); Assert.Empty(await db.LearningTopics.ToListAsync());
        var result = await service.ImportAsync(file, "data.xlsx", preview.FileHash);
        Assert.True(result.Imported); Assert.Single(await db.Vocabularies.ToListAsync()); Assert.Single(await db.Grammars.ToListAsync());
        Assert.Single(await db.TopicVocabularies.ToListAsync()); Assert.Single(await db.TopicGrammars.ToListAsync());
        Assert.Single(await db.VocabularySources.ToListAsync()); Assert.Single(await db.GrammarSources.ToListAsync());
        var example = await db.VocabularyExamples.Include(e => e.Source).SingleAsync();
        Assert.Equal("Test dataset", example.Source!.Name); Assert.Equal("sentence-1", example.ExternalId);
        Assert.Equal("犬がいます。", (await db.Grammars.SingleAsync()).ExampleSentence);
    }

    [Fact]
    public async Task ImportTwice_PreservesEditsHiddenStatusExamplesSourceAndLinkOrder()
    {
        await using var db = Db(); var service = new AdminLearningImportService(db);
        var bytes = Workbook(Source); var first = await service.PreviewAsync(bytes, "x.xlsx");
        await service.ImportAsync(bytes, "x.xlsx", first.FileHash);
        var word = await db.Vocabularies.SingleAsync(); word.Meaning = "Admin changed"; word.IsActive = false; word.AudioUrl = "https://example.org/audio.mp3";
        var topic = await db.LearningTopics.SingleAsync(); topic.Description = "Admin topic"; topic.IsActive = false;
        var example = await db.VocabularyExamples.SingleAsync(); example.VietnameseTranslation = "Admin translation";
        var link = await db.TopicVocabularies.SingleAsync(); link.OrderIndex = 7;
        await db.SaveChangesAsync(); db.ChangeTracker.Clear();
        var preview = await service.PreviewAsync(bytes, "x.xlsx"); Assert.True(preview.CanImport); Assert.Equal(2, preview.ReusedContents);
        Assert.Equal(0, preview.NewExamples); Assert.Equal(0, preview.NewLinks);
        var result = await service.ImportAsync(bytes, "x.xlsx", preview.FileHash); Assert.True(result.Imported);
        word = await db.Vocabularies.SingleAsync(); Assert.Equal("Admin changed", word.Meaning); Assert.False(word.IsActive); Assert.NotNull(word.AudioUrl);
        Assert.Equal("Admin translation", (await db.VocabularyExamples.SingleAsync()).VietnameseTranslation);
        Assert.Equal(7, (await db.TopicVocabularies.SingleAsync()).OrderIndex);
        topic = await db.LearningTopics.SingleAsync(); Assert.False(topic.IsActive); Assert.Equal("Admin topic", topic.Description);
        Assert.Single(await db.LearningContentSources.ToListAsync()); Assert.Single(await db.VocabularySources.ToListAsync());
    }

    [Fact]
    public async Task InvalidExample_PreventsAllWritesIncludingOtherwiseValidTopics()
    {
        await using var db = Db(); var service = new AdminLearningImportService(db);
        var bytes = Workbook(book => book.Worksheet("Examples").Cell("B3").Value = "MISSING");
        var preview = await service.PreviewAsync(bytes, "x.xlsx"); Assert.False(preview.CanImport);
        Assert.Contains(preview.Issues, i => i.Sheet == "Examples" && i.Row == 3 && i.Column == "ContentKey");
        var result = await service.ImportAsync(bytes, "x.xlsx", preview.FileHash); Assert.False(result.Imported);
        Assert.Empty(await db.LearningTopics.ToListAsync()); Assert.Empty(await db.Vocabularies.ToListAsync()); Assert.Empty(await db.Grammars.ToListAsync());
    }

    [Fact]
    public async Task CrossLevelTopicAndDuplicateNaturalIdentity_AreErrors()
    {
        await using var db = Db(); var service = new AdminLearningImportService(db);
        var bytes = Workbook(book =>
        {
            book.Worksheet("Topics").Cell("C2").Value = "N4";
            book.Worksheet("Vocabularies").Row(2).CopyTo(book.Worksheet("Vocabularies").Row(3));
            book.Worksheet("Vocabularies").Cell("A3").Value = "V002";
        });
        var result = await service.PreviewAsync(bytes, "x.xlsx");
        Assert.Contains(result.Issues, i => i.Column == "TopicCodes" && i.Message.Contains("khác level"));
        Assert.Contains(result.Issues, i => i.Column == "Word" && i.Message.Contains("trùng trong file"));
    }

    [Fact]
    public async Task AmbiguousExistingContent_IsNotArbitrarilyChosen()
    {
        await using var db = Db();
        db.Vocabularies.AddRange(new Vocabulary { Word = "猫", Reading = "ねこ", Meaning = "A", JLPTLevel = "N5" }, new Vocabulary { Word = "猫", Reading = "ねこ", Meaning = "B", JLPTLevel = "N5" });
        await db.SaveChangesAsync();
        var result = await new AdminLearningImportService(db).PreviewAsync(Workbook(), "x.xlsx");
        Assert.False(result.CanImport); Assert.Contains(result.Issues, i => i.Column == "Word" && i.Message.Contains("nhiều mục"));
    }

    [Fact]
    public async Task LegacyNullLevel_IsN5AndCannotBeRelinkedAsN4()
    {
        await using var db = Db(); db.Vocabularies.Add(new Vocabulary { Word = "猫", Reading = "ねこ", Meaning = "Cat" }); await db.SaveChangesAsync();
        var bytes = Workbook(book => { book.Worksheet("Topics").Cell("C2").Value = "N4"; book.Worksheet("Vocabularies").Cell("E2").Value = "N4"; });
        var result = await new AdminLearningImportService(db).PreviewAsync(bytes, "x.xlsx");
        Assert.Contains(result.Issues, i => i.Sheet == "Vocabularies" && i.Column == "JLPTLevel");
    }

    [Fact]
    public async Task ExistingContent_AddsOnlyMissingTopics_AtEndOfCurrentOrder()
    {
        await using var db = Db();
        var word = new Vocabulary { Word = "猫", Reading = "ねこ", Meaning = "Keep", JLPTLevel = "N5", IsActive = false };
        var other = new Vocabulary { Word = "犬", Meaning = "Dog", JLPTLevel = "N5" };
        var topic = new LearningTopic { Code = "PETS_N5", Name = "Thú cưng", JLPTLevel = "N5" };
        db.AddRange(word, other, topic); await db.SaveChangesAsync();
        db.TopicVocabularies.Add(new TopicVocabulary { Topic = topic, Vocabulary = other, OrderIndex = 8 }); await db.SaveChangesAsync();
        var bytes = Workbook(); var service = new AdminLearningImportService(db);
        var preview = await service.PreviewAsync(bytes, "x.xlsx"); Assert.True(preview.CanImport);
        await service.ImportAsync(bytes, "x.xlsx", preview.FileHash);
        Assert.Equal(9, (await db.TopicVocabularies.SingleAsync(l => l.VocabularyId == word.Id)).OrderIndex);
        var saved = await db.Vocabularies.FindAsync(word.Id); Assert.Equal("Keep", saved!.Meaning); Assert.False(saved.IsActive);
        Assert.Empty(await db.VocabularyExamples.ToListAsync());
    }

    [Fact]
    public async Task Confirm_RevalidatesDatabaseChangedAfterPreview()
    {
        await using var db = Db(); var service = new AdminLearningImportService(db); var bytes = Workbook();
        var preview = await service.PreviewAsync(bytes, "x.xlsx"); Assert.True(preview.CanImport);
        db.LearningTopics.Add(new LearningTopic { Code = "PETS_N5", Name = "Different topic", JLPTLevel = "N4" }); await db.SaveChangesAsync();
        var confirmed = await service.ImportAsync(bytes, "x.xlsx", preview.FileHash);
        Assert.False(confirmed.Imported); Assert.False(confirmed.CanImport); Assert.Empty(await db.Vocabularies.ToListAsync());
    }

    [Fact]
    public async Task Confirm_RejectsChangedFileHash()
    {
        await using var db = Db(); var service = new AdminLearningImportService(db); var bytes = Workbook();
        var preview = await service.PreviewAsync(bytes, "x.xlsx");
        var changed = Workbook(book => book.Worksheet("Vocabularies").Cell("D2").Value = "Changed");
        await Assert.ThrowsAsync<LearningRequestException>(() => service.ImportAsync(changed, "x.xlsx", preview.FileHash));
        Assert.Empty(await db.Vocabularies.ToListAsync());
    }

    [Theory]
    [InlineData("Vocabularies", "B2", "", "Word")]
    [InlineData("Vocabularies", "E2", "N6", "JLPTLevel")]
    [InlineData("Vocabularies", "K2", "external-no-source", "SourceKey")]
    [InlineData("Grammars", "J2", "MISSING", "SourceKey")]
    [InlineData("Examples", "A2", "invalid", "Kind")]
    [InlineData("Topics", "A2", "Mã không hợp lệ", "Code")]
    public async Task InvalidFields_ReportExactSheetRowAndColumn(string sheet, string cell, string value, string column)
    {
        await using var db = Db(); var result = await new AdminLearningImportService(db).PreviewAsync(Workbook(book => book.Worksheet(sheet).Cell(cell).Value = value), "x.xlsx");
        Assert.False(result.CanImport); Assert.Contains(result.Issues, i => i.Sheet == sheet && i.Row == 2 && i.Column == column);
    }

    [Fact]
    public async Task SourceMetadataConflict_PreventsOverwrite()
    {
        await using var db = Db(); var service = new AdminLearningImportService(db); var bytes = Workbook(Source);
        var preview = await service.PreviewAsync(bytes, "x.xlsx"); await service.ImportAsync(bytes, "x.xlsx", preview.FileHash);
        var conflict = Workbook(book => { Source(book); book.Worksheet("Sources").Cell("E2").Value = "MIT"; });
        var result = await service.PreviewAsync(conflict, "x.xlsx"); Assert.False(result.CanImport);
        Assert.Equal("CC BY 4.0", (await db.LearningContentSources.SingleAsync()).License);
    }

    [Fact]
    public async Task MultipleExamplesAndMultipleTopicLinks_AreOrderedWithoutDuplicatingMaster()
    {
        await using var db = Db();
        var bytes = Workbook(book =>
        {
            string[] topic = ["LIFE_N5", "Đời sống", "N5", ""];
            for (var i = 0; i < topic.Length; i++) book.Worksheet("Topics").Cell(3, i + 1).Value = topic[i];
            book.Worksheet("Vocabularies").Cell("I2").Value = "PETS_N5;LIFE_N5;PETS_N5";
            book.Worksheet("Examples").Row(2).CopyTo(book.Worksheet("Examples").Row(4));
            book.Worksheet("Examples").Cell("C4").Value = "猫が好きです。";
        });
        var service = new AdminLearningImportService(db); var preview = await service.PreviewAsync(bytes, "x.xlsx");
        Assert.True(preview.CanImport); await service.ImportAsync(bytes, "x.xlsx", preview.FileHash);
        Assert.Single(await db.Vocabularies.ToListAsync()); Assert.Equal(2, await db.TopicVocabularies.CountAsync());
        Assert.Equal(new[] { "猫がいます。", "猫が好きです。" }, await db.VocabularyExamples.OrderBy(e => e.OrderIndex).Select(e => e.JapaneseText).ToArrayAsync());
    }

    [Fact]
    public async Task TopicOnlyWorkbook_IsSupported_AndEmptyWorkbookIsRejected()
    {
        await using var db = Db(); var service = new AdminLearningImportService(db);
        var bytes = Workbook(book => { book.Worksheet("Vocabularies").Delete(); book.Worksheet("Grammars").Delete(); book.Worksheet("Examples").Delete(); book.Worksheet("Sources").Delete(); });
        var result = await service.PreviewAsync(bytes, "x.xlsx"); Assert.True(result.CanImport); Assert.Equal(1, result.NewTopics);
        var empty = Workbook(book => { foreach (var s in book.Worksheets.Where(s => s.Name != "Guide")) s.Rows(2, 4).Clear(); });
        Assert.False((await service.PreviewAsync(empty, "x.xlsx")).CanImport);
    }

    [Fact]
    public void Reader_RejectsFormulaAndUnexpectedHeadersSheetsOrOversizedRows()
    {
        var formula = Workbook(book => book.Worksheet("Vocabularies").Cell("B2").FormulaA1 = "1+1");
        Assert.Contains(LearningImportWorkbook.Read(formula, "x.xlsx").Report.Issues, i => i.Column == "Word" && i.Message.Contains("công thức"));
        var header = Workbook(book => book.Worksheet("Vocabularies").Cell("A1").Value = "Wrong");
        Assert.False(LearningImportWorkbook.Read(header, "x.xlsx").Report.CanImport);
        var sheet = Workbook(book => book.Worksheets.Add("VocabularyTypo"));
        Assert.False(LearningImportWorkbook.Read(sheet, "x.xlsx").Report.CanImport);
        var large = Workbook(book => book.Worksheet("Examples").Cell("A3002").Value = "vocabulary");
        Assert.False(LearningImportWorkbook.Read(large, "x.xlsx").Report.CanImport);
    }

    [Fact]
    public void Reader_RejectsCorruptWrongExtensionAndOversizedFiles()
    {
        Assert.False(LearningImportWorkbook.Read([1, 2, 3], "x.xlsx").Report.CanImport);
        Assert.False(LearningImportWorkbook.Read(LearningImportWorkbook.Template(), "x.xls").Report.CanImport);
        Assert.False(LearningImportWorkbook.Read(new byte[LearningImportWorkbook.MaxBytes + 1], "x.xlsx").Report.CanImport);
    }

    [Fact]
    public async Task Limits_ValidateWordReadingAndLegacyGrammarFirstExample()
    {
        await using var db = Db(); var bytes = Workbook(book => { book.Worksheet("Vocabularies").Cell("C2").Value = new string('a', 101); book.Worksheet("Examples").Cell("C3").Value = new string('あ', 501); });
        var report = await new AdminLearningImportService(db).PreviewAsync(bytes, "x.xlsx");
        Assert.Contains(report.Issues, i => i.Column == "Reading");
        Assert.Contains(report.Issues, i => i.Sheet == "Examples" && i.Row == 3 && i.Column == "JapaneseText");
    }

    [Theory]
    [InlineData("xl/externalLinks/externalLink1.xml")]
    [InlineData("xl/vbaProject.bin")]
    public void Reader_RejectsExternalWorkbookLinksAndMacroPayloads(string entry)
    {
        using var stream = new MemoryStream(); stream.Write(LearningImportWorkbook.Template());
        using (var zip = new ZipArchive(stream, ZipArchiveMode.Update, true))
        using (var writer = new StreamWriter(zip.CreateEntry(entry).Open())) writer.Write("not allowed");
        var result = LearningImportWorkbook.Read(stream.ToArray(), "x.xlsx");
        Assert.False(result.Report.CanImport); Assert.Contains(result.Report.Issues, i => i.Message.Contains("macro"));
    }

    [Fact]
    public async Task UnusedSource_IsNotCreatedWhenOnlyTopicIsImported()
    {
        await using var db = Db(); var bytes = Workbook(book =>
        {
            Source(book); book.Worksheet("Vocabularies").Delete(); book.Worksheet("Grammars").Delete(); book.Worksheet("Examples").Delete();
        });
        var service = new AdminLearningImportService(db); var preview = await service.PreviewAsync(bytes, "x.xlsx");
        Assert.True(preview.CanImport); Assert.Equal(0, preview.NewSources);
        Assert.Contains(preview.Rows, r => r.Sheet == "Sources" && r.Action == "skip");
        await service.ImportAsync(bytes, "x.xlsx", preview.FileHash);
        Assert.Empty(await db.LearningContentSources.ToListAsync()); Assert.Single(await db.LearningTopics.ToListAsync());
    }
}
