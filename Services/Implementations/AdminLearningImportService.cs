using System.Data;
using System.Text;
using System.Text.RegularExpressions;
using JCAP.Data;
using JCAP.DTOs.Learning;
using JCAP.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using Row = JCAP.Services.Implementations.LearningImportWorkbook.Row;

namespace JCAP.Services.Implementations;

public class AdminLearningImportService(AppDbContext db)
{
    private static string Identity(string? text) => (text ?? "").Trim().Normalize(NormalizationForm.FormC).ToUpperInvariant();
    private sealed record ContentTarget(Row Row, int ExistingId, string Level, Vocabulary? Vocabulary, Grammar? Grammar);
    private sealed record Plan(LearningImportReport Report, List<object> Added);

    public async Task<LearningImportReport> PreviewAsync(byte[] bytes, string name, CancellationToken cancellationToken = default)
        => (await BuildAsync(LearningImportWorkbook.Read(bytes, name), cancellationToken)).Report;

    public async Task<LearningImportReport> ImportAsync(byte[] bytes, string name, string fileHash, CancellationToken cancellationToken = default)
    {
        var document = LearningImportWorkbook.Read(bytes, name);
        if (!string.Equals(document.Report.FileHash, fileHash, StringComparison.OrdinalIgnoreCase))
            throw new LearningRequestException("File đã thay đổi. Hãy kiểm tra lại trước khi nhập.");
        if (!document.Report.CanImport) return document.Report;
        return await db.Database.CreateExecutionStrategy().ExecuteAsync(async () =>
        {
            // Serializable rechecks the live data and commits the complete workbook atomically.
            // No SQL lock is needed by the in-memory provider used in unit tests.
            db.ChangeTracker.Clear();
            await using var transaction = db.Database.IsRelational()
                ? await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken) : null;
            try
            {
                var plan = await BuildAsync(document, cancellationToken);
                if (!plan.Report.CanImport) return plan.Report;
                db.AddRange(plan.Added);
                await db.SaveChangesAsync(cancellationToken);
                if (transaction is not null) await transaction.CommitAsync(cancellationToken);
                plan.Report.Imported = true;
                return plan.Report;
            }
            catch
            {
                if (transaction is not null) await transaction.RollbackAsync(CancellationToken.None);
                throw;
            }
            finally { db.ChangeTracker.Clear(); }
        });
    }

    private async Task<Plan> BuildAsync(LearningImportWorkbook.Document document, CancellationToken ct)
    {
        var report = new LearningImportReport { FileHash = document.Report.FileHash, Issues = [.. document.Report.Issues] };
        var added = new List<object>();
        if (!report.CanImport) return new(report, added);
        var rows = document.Rows;
        void Issue(Row r, string column, string message, bool warning = false) => report.Issues.Add(new(r.Sheet, r.Number, column, message, warning ? "warning" : "error"));
        bool Valid(Row r) => !report.Issues.Any(i => i.Sheet == r.Sheet && i.Row == r.Number && i.Severity == "error");
        void Field(Row r, string field, int max, bool required = false)
        {
            if (required && r[field].Length == 0) Issue(r, field, "Không được để trống.");
            if (r[field].Length > max) Issue(r, field, $"Tối đa {max} ký tự.");
        }
        void Level(Row r) { if (!AdminLearningService.Levels.Contains(r["JLPTLevel"])) Issue(r, "JLPTLevel", "Chỉ nhận N5, N4, N3, N2, N1."); }
        void Code(Row r, string field, int max)
        {
            Field(r, field, max, true);
            if (r[field].Length > 0 && !Regex.IsMatch(r[field], "^[A-Za-z0-9_-]+$")) Issue(r, field, "Chỉ dùng chữ Latin, số, dấu _ hoặc -.");
        }
        var existingTopics = await db.LearningTopics.ToListAsync(ct);
        var existingSources = await db.LearningContentSources.ToListAsync(ct);
        var existingVocabulary = await db.Vocabularies.ToListAsync(ct);
        var existingGrammar = await db.Grammars.ToListAsync(ct);
        var existingVocabularyLinks = await db.TopicVocabularies.ToListAsync(ct);
        var existingGrammarLinks = await db.TopicGrammars.ToListAsync(ct);
        var topics = existingTopics.ToDictionary(t => Identity(t.Code));
        var sourceMap = new Dictionary<string, LearningContentSource>();
        var topicCodesInFile = new HashSet<string>();
        var sourceIdentitiesInFile = new HashSet<string>();
        var vocabularyTargets = new Dictionary<string, ContentTarget>();
        var grammarTargets = new Dictionary<string, ContentTarget>();
        var vocabularyIdentities = new HashSet<string>();
        var grammarIdentities = new HashSet<string>();
        var vocabularyOrder = new Dictionary<LearningTopic, int>();
        var grammarOrder = new Dictionary<LearningTopic, int>();

        foreach (var r in rows.Where(r => r.Sheet == "Sources"))
        {
            Code(r, "Key", 100); Field(r, "Name", 100, true); Field(r, "Version", 100, true);
            Field(r, "SourceUrl", 1000, true); Field(r, "License", 100, true); Field(r, "LicenseUrl", 1000, true); Field(r, "Attribution", 20000, true);
            foreach (var field in new[] { "SourceUrl", "LicenseUrl" })
                if (!Uri.TryCreate(r[field], UriKind.Absolute, out var url) || url.Scheme is not ("http" or "https")) Issue(r, field, "Cần URL http hoặc https hợp lệ.");
            if (sourceMap.ContainsKey(Identity(r["Key"]))) Issue(r, "Key", "Mã nguồn bị trùng trong file.");
            if (!sourceIdentitiesInFile.Add(Identity(r["Name"]) + "\0" + Identity(r["Version"]))) Issue(r, "Name", "Tên và phiên bản nguồn bị trùng trong file.");
            var existing = existingSources.SingleOrDefault(s => Identity(s.Name) == Identity(r["Name"]) && Identity(s.Version) == Identity(r["Version"]));
            if (existing is not null && (existing.SourceUrl != r["SourceUrl"] || existing.License != r["License"] || existing.LicenseUrl != r["LicenseUrl"] || existing.Attribution != r["Attribution"]))
                Issue(r, "Name", "Nguồn đã có nhưng URL, giấy phép hoặc ghi công khác. Kiểm tra đúng phiên bản; không ghi đè nguồn hiện tại.");
            if (!Valid(r)) continue;
            var source = existing ?? new LearningContentSource { Name = r["Name"], Version = r["Version"], SourceUrl = r["SourceUrl"], License = r["License"], LicenseUrl = r["LicenseUrl"], Attribution = r["Attribution"] };
            sourceMap.Add(Identity(r["Key"]), source);
            if (existing is null) { added.Add(source); report.NewSources++; }
            report.Rows.Add(new(r.Sheet, r.Number, r["Key"], source.Name, existing is null ? "create" : "reuse"));
        }

        foreach (var r in rows.Where(r => r.Sheet == "Topics"))
        {
            Code(r, "Code", 50); Field(r, "Name", 200, true); Field(r, "Description", 1000); Level(r);
            var code = Identity(r["Code"]);
            if (!topicCodesInFile.Add(code)) Issue(r, "Code", "Mã chủ đề bị trùng trong file.");
            topics.TryGetValue(code, out var existing);
            if (existing is not null && (Identity(existing.Name) != Identity(r["Name"]) || existing.JLPTLevel != r["JLPTLevel"]))
                Issue(r, "Code", "Mã đã có với tên hoặc level khác. Dùng đúng chủ đề có sẵn hoặc tạo mã mới.");
            if (topics.Values.Any(t => Identity(t.Code) != code && Identity(t.Name) == Identity(r["Name"]) && t.JLPTLevel == r["JLPTLevel"]))
                Issue(r, "Name", "Tên chủ đề đã tồn tại ở level này với mã khác.");
            if (!Valid(r)) continue;
            var topic = existing ?? new LearningTopic { Code = code, Name = r["Name"], JLPTLevel = r["JLPTLevel"], Description = r.Optional("Description") };
            if (existing is null) { topics.Add(code, topic); added.Add(topic); report.NewTopics++; }
            else Issue(r, "Code", "Dùng chủ đề đã có; giữ mô tả và trạng thái hiện tại.", true);
            report.Rows.Add(new(r.Sheet, r.Number, code, topic.Name, existing is null ? "create" : "reuse"));
        }

        LearningContentSource? Source(Row r, bool example = false)
        {
            Field(r, "ExternalId", 200); Field(r, "SourceKey", 100);
            var key = Identity(r["SourceKey"]);
            if (key.Length == 0)
            {
                if (r["ExternalId"].Length > 0) Issue(r, "SourceKey", "ExternalId cần SourceKey.");
                return null;
            }
            if (!example && r["ExternalId"].Length == 0) Issue(r, "ExternalId", "Mục dẫn nguồn cần mã bản ghi gốc.");
            if (!sourceMap.TryGetValue(key, out var source)) Issue(r, "SourceKey", "Không tìm thấy mã trong sheet Sources hợp lệ.");
            return source;
        }

        foreach (var r in rows.Where(r => r.Sheet is "Vocabularies" or "Grammars"))
        {
            var isWord = r.Sheet == "Vocabularies";
            var textField = isWord ? "Word" : "Pattern";
            var targets = isWord ? vocabularyTargets : grammarTargets;
            Code(r, "Key", 100); Field(r, textField, 100, true); Field(r, "Reading", isWord ? 100 : 200);
            Field(r, "Meaning", 1000, true); Field(r, "Explanation", 20000); Field(r, "UsageNotes", 20000); Level(r);
            if (isWord) Field(r, "PartOfSpeech", 100); else Field(r, "Formation", 1000);
            var source = Source(r);
            var identity = Identity(r[textField]) + (isWord ? "\0" + Identity(r["Reading"]) : "");
            if (!(isWord ? vocabularyIdentities : grammarIdentities).Add(identity)) Issue(r, textField, "Mục bị trùng trong file. Dùng một dòng và nhiều TopicCodes.");
            if (targets.ContainsKey(Identity(r["Key"]))) Issue(r, "Key", "Key bị trùng trong sheet.");
            var wordMatches = isWord ? existingVocabulary.Where(v => Identity(v.Word) == Identity(r["Word"]) && Identity(v.Reading) == Identity(r["Reading"])).ToArray() : [];
            var grammarMatches = !isWord ? existingGrammar.Where(g => Identity(g.Pattern) == Identity(r["Pattern"])).ToArray() : [];
            if (wordMatches.Length + grammarMatches.Length > 1) Issue(r, textField, "Có nhiều mục giống nhau trong kho. Không tự chọn; hãy kiểm tra và gán thủ công.");
            var word = wordMatches.FirstOrDefault(); var grammar = grammarMatches.FirstOrDefault();
            var existingId = word?.Id ?? grammar?.Id ?? 0;
            var contentLevel = existingId > 0 ? (word?.JLPTLevel ?? grammar?.JLPTLevel ?? "N5") : r["JLPTLevel"];
            if (existingId > 0 && contentLevel != r["JLPTLevel"]) Issue(r, "JLPTLevel", "Mục giống đã có ở level khác; không tạo bản sao hoặc tự đổi level.");
            var topicCodes = r["TopicCodes"].Split(';', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).Select(Identity).Distinct().ToArray();
            if (topicCodes.Length > 100) Issue(r, "TopicCodes", "Tối đa 100 chủ đề mỗi mục.");
            var linkedTopics = new List<LearningTopic>();
            foreach (var code in topicCodes)
            {
                if (!topics.TryGetValue(code, out var topic)) Issue(r, "TopicCodes", $"Không tìm thấy chủ đề {code}.");
                else if (topic.JLPTLevel != r["JLPTLevel"]) Issue(r, "TopicCodes", $"Chủ đề {code} khác level nội dung.");
                else linkedTopics.Add(topic);
            }
            if (!Valid(r)) continue;
            if (existingId > 0)
            {
                report.ReusedContents++;
                Issue(r, textField, "Giữ nguyên mục đã có (kể cả mục ẩn), nguồn và ví dụ; chỉ thêm liên kết chủ đề còn thiếu.", true);
            }
            else if (isWord)
            {
                word = new Vocabulary { Word = r["Word"], Reading = r.Optional("Reading"), Meaning = r["Meaning"], JLPTLevel = r["JLPTLevel"], PartOfSpeech = r.Optional("PartOfSpeech"), Explanation = r.Optional("Explanation"), UsageNotes = r.Optional("UsageNotes") };
                if (source is not null) word.Sources.Add(new VocabularySource { Source = source, ExternalId = r["ExternalId"] });
                added.Add(word); report.NewVocabularies++;
            }
            else
            {
                grammar = new Grammar { Pattern = r["Pattern"], Reading = r.Optional("Reading"), Meaning = r["Meaning"], JLPTLevel = r["JLPTLevel"], Formation = r.Optional("Formation"), Explanation = r.Optional("Explanation"), UsageNotes = r.Optional("UsageNotes") };
                if (source is not null) grammar.Sources.Add(new GrammarSource { Source = source, ExternalId = r["ExternalId"] });
                added.Add(grammar); report.NewGrammars++;
            }
            targets.Add(Identity(r["Key"]), new(r, existingId, contentLevel, word, grammar));
            foreach (var topic in linkedTopics)
            {
                if (existingId > 0 && (isWord
                    ? existingVocabularyLinks.Any(l => l.TopicId == topic.Id && l.VocabularyId == existingId)
                    : existingGrammarLinks.Any(l => l.TopicId == topic.Id && l.GrammarId == existingId))) continue;
                var order = isWord ? vocabularyOrder : grammarOrder;
                if (!order.TryGetValue(topic, out var last)) last = isWord
                    ? existingVocabularyLinks.Where(l => l.TopicId == topic.Id).Select(l => l.OrderIndex).DefaultIfEmpty(-1).Max()
                    : existingGrammarLinks.Where(l => l.TopicId == topic.Id).Select(l => l.OrderIndex).DefaultIfEmpty(-1).Max();
                if (last == int.MaxValue) { Issue(r, "TopicCodes", "Thứ tự chủ đề vượt giới hạn. Hãy sắp xếp lại chủ đề."); continue; }
                order[topic] = last + 1;
                added.Add(isWord ? new TopicVocabulary { Topic = topic, Vocabulary = word!, OrderIndex = last + 1 }
                    : new TopicGrammar { Topic = topic, Grammar = grammar!, OrderIndex = last + 1 });
                report.NewLinks++;
            }
            report.Rows.Add(new(r.Sheet, r.Number, r["Key"], r[textField], existingId > 0 ? "reuse" : "create"));
        }

        var exampleCounts = new Dictionary<ContentTarget, int>();
        foreach (var r in rows.Where(r => r.Sheet == "Examples"))
        {
            if (r["Kind"] is not ("vocabulary" or "grammar")) { Issue(r, "Kind", "Chỉ nhận vocabulary hoặc grammar."); continue; }
            var targets = r["Kind"] == "vocabulary" ? vocabularyTargets : grammarTargets;
            Field(r, "ContentKey", 100, true); Field(r, "JapaneseText", 2000, true);
            Field(r, "VietnameseTranslation", 2000); Field(r, "Furigana", 4000);
            var source = Source(r, true);
            if (!targets.TryGetValue(Identity(r["ContentKey"]), out var target)) { Issue(r, "ContentKey", "Không có Key nội dung hợp lệ trong sheet tương ứng."); continue; }
            var index = exampleCounts.GetValueOrDefault(target); exampleCounts[target] = index + 1;
            if (index >= 50) Issue(r, "ContentKey", "Tối đa 50 ví dụ mỗi mục.");
            if (r["Kind"] == "grammar" && index == 0 && r["JapaneseText"].Length > 500) Issue(r, "JapaneseText", "Ví dụ đầu ngữ pháp tối đa 500 ký tự để tương thích module hiện có.");
            if (!Valid(r)) continue;
            if (target.ExistingId > 0)
            {
                Issue(r, "ContentKey", "Bỏ qua ví dụ trong file vì nội dung đã có; giữ ví dụ hiện tại.", true);
                report.Rows.Add(new(r.Sheet, r.Number, r["ContentKey"], r["JapaneseText"], "skip")); continue;
            }
            if (target.Vocabulary is { } word)
                word.Examples.Add(new VocabularyExample { JapaneseText = r["JapaneseText"], VietnameseTranslation = r.Optional("VietnameseTranslation"), Furigana = r.Optional("Furigana"), OrderIndex = index, Source = source, ExternalId = r.Optional("ExternalId") });
            else if (target.Grammar is { } grammar)
            {
                grammar.Examples.Add(new GrammarExample { JapaneseText = r["JapaneseText"], VietnameseTranslation = r.Optional("VietnameseTranslation"), Furigana = r.Optional("Furigana"), OrderIndex = index, Source = source, ExternalId = r.Optional("ExternalId") });
                if (index == 0) grammar.ExampleSentence = r["JapaneseText"];
            }
            report.NewExamples++;
            report.Rows.Add(new(r.Sheet, r.Number, r["ContentKey"], r["JapaneseText"], "create"));
        }
        // A source is persisted only when new content/examples actually reference it.
        var usedSources = added.OfType<Vocabulary>().SelectMany(v => v.Sources.Select(s => s.Source).Concat(v.Examples.Where(e => e.Source is not null).Select(e => e.Source!)))
            .Concat(added.OfType<Grammar>().SelectMany(g => g.Sources.Select(s => s.Source).Concat(g.Examples.Where(e => e.Source is not null).Select(e => e.Source!)))).ToHashSet();
        foreach (var source in added.OfType<LearningContentSource>().Where(s => !usedSources.Contains(s)).ToArray())
        {
            added.Remove(source); report.NewSources--;
            foreach (var r in rows.Where(r => r.Sheet == "Sources" && sourceMap.GetValueOrDefault(Identity(r["Key"])) == source))
            {
                Issue(r, "Key", "Không có nội dung/ví dụ mới sử dụng nguồn này; không thêm nguồn rời vào kho.", true);
                var index = report.Rows.FindIndex(x => x.Sheet == r.Sheet && x.Row == r.Number);
                if (index >= 0) report.Rows[index] = report.Rows[index] with { Action = "skip" };
            }
        }
        return new(report, added);
    }
}
