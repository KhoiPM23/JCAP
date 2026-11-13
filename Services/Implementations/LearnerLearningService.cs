using JCAP.Data;
using JCAP.Data.Seeds;
using JCAP.DTOs.Learning;
using JCAP.Models;
using Microsoft.EntityFrameworkCore;

namespace JCAP.Services.Implementations;

/// <summary>Read-only catalog. Active same-level links are checked on every path, including direct detail URLs.</summary>
public class LearnerLearningService(AppDbContext db)
{
    private IQueryable<LearningTopic> Topics() => db.LearningTopics.AsNoTracking().Where(t => t.IsActive);
    private static IQueryable<LearnerTopic> TopicRows(IQueryable<LearningTopic> topics) => topics.Select(t => new LearnerTopic(
        t.Id, t.Name, t.JLPTLevel, t.Description,
        t.TopicVocabularies.Count(l => l.Vocabulary.IsActive && (l.Vocabulary.JLPTLevel ?? "N5") == t.JLPTLevel),
        t.TopicGrammars.Count(l => l.Grammar.IsActive && (l.Grammar.JLPTLevel ?? "N5") == t.JLPTLevel)));
    private static string? Keyword(string? text) => string.IsNullOrWhiteSpace(text) ? null : text.Trim();
    private static void Validate(int page, int size, string? keyword)
    {
        if (page is < 1 or > 1000000 || size is < 1 or > 100 || keyword?.Length > 200)
            throw new LearningRequestException("Tham số tìm kiếm hoặc phân trang không hợp lệ.");
    }
    public async Task<LearningPage<LearnerTopic>> TopicsAsync(LearnerTopicQuery q, CancellationToken ct = default)
    {
        Validate(q.Page, q.PageSize, q.Keyword);
        if (q.JLPTLevel is not null && !AdminLearningService.Levels.Contains(q.JLPTLevel)) throw new LearningRequestException("Level không hợp lệ.");
        var topics = Topics();
        if (Keyword(q.Keyword) is { } keyword) topics = topics.Where(t => t.Name.Contains(keyword) || (t.Description != null && t.Description.Contains(keyword)));
        if (q.JLPTLevel is { } level) topics = topics.Where(t => t.JLPTLevel == level);
        topics = q.Kind switch
        {
            null => topics,
            "vocabularies" => topics.Where(t => t.TopicVocabularies.Any(l => l.Vocabulary.IsActive && (l.Vocabulary.JLPTLevel ?? "N5") == t.JLPTLevel)),
            "grammars" => GrammarCatalogTopics(topics).Where(t => t.TopicGrammars.Any(l => l.Grammar.IsActive && (l.Grammar.JLPTLevel ?? "N5") == t.JLPTLevel)),
            _ => throw new LearningRequestException("Loại học liệu không hợp lệ.")
        };
        var total = await topics.CountAsync(ct);
        var page = Math.Min(q.Page, Math.Max(1, (int)Math.Ceiling(total / (double)q.PageSize)));
        var ordered = topics.OrderByDescending(t => t.JLPTLevel).ThenBy(t => t.Name).ThenBy(t => t.Id)
            .Skip((page - 1) * q.PageSize).Take(q.PageSize);
        return new(await TopicRows(ordered).ToListAsync(ct), total, page, q.PageSize);
    }

    private static IQueryable<LearningTopic> GrammarCatalogTopics(IQueryable<LearningTopic> topics, int? currentTopicId = null)
    {
        var situationCodes = LearningTopicSeedData.SituationCodes;
        return topics.Where(t => t.Id == currentTopicId || !situationCodes.Contains(t.Code));
    }
    public async Task<LearnerTopic> TopicAsync(int id, CancellationToken ct = default)
        => await TopicRows(Topics().Where(t => t.Id == id)).SingleOrDefaultAsync(ct)
            ?? throw new LearningRequestException("Chủ đề không còn hiển thị hoặc không tồn tại.", 404);

    private sealed class Entry
    {
        public int Id { get; set; }
        public int Order { get; set; }
        public string Text { get; set; } = "";
        public string? Reading { get; set; }
        public string Meaning { get; set; } = "";
        public string JLPTLevel { get; set; } = "";
        public string? PartOfSpeech { get; set; }
        public string? Formation { get; set; }
        public int ExampleCount { get; set; }
    }
    private IQueryable<Entry> Entries(int topicId, string kind, string? search)
    {
        IQueryable<Entry> entries = kind switch
        {
            "vocabularies" => db.TopicVocabularies.AsNoTracking()
                .Where(l => l.TopicId == topicId && l.Topic.IsActive && l.Vocabulary.IsActive && (l.Vocabulary.JLPTLevel ?? "N5") == l.Topic.JLPTLevel)
                .Select(l => new Entry { Id = l.VocabularyId, Order = l.OrderIndex, Text = l.Vocabulary.Word, Reading = l.Vocabulary.Reading,
                    Meaning = l.Vocabulary.Meaning, JLPTLevel = l.Vocabulary.JLPTLevel ?? "N5", PartOfSpeech = l.Vocabulary.PartOfSpeech,
                    ExampleCount = l.Vocabulary.Examples.Count }),
            "grammars" => db.TopicGrammars.AsNoTracking()
                .Where(l => l.TopicId == topicId && l.Topic.IsActive && l.Grammar.IsActive && (l.Grammar.JLPTLevel ?? "N5") == l.Topic.JLPTLevel)
                .Select(l => new Entry { Id = l.GrammarId, Order = l.OrderIndex, Text = l.Grammar.Pattern, Reading = l.Grammar.Reading,
                    Meaning = l.Grammar.Meaning, JLPTLevel = l.Grammar.JLPTLevel ?? "N5", Formation = l.Grammar.Formation,
                    ExampleCount = l.Grammar.Examples.Count + (!l.Grammar.Examples.Any() && l.Grammar.ExampleSentence != null && l.Grammar.ExampleSentence != "" ? 1 : 0) }),
            _ => throw new LearningRequestException("Loại học liệu không hợp lệ.")
        };
        if (Keyword(search) is { } keyword)
        {
            // Vocabulary has no Formation column; keep that predicate out of its SQL projection.
            entries = kind == "grammars"
                ? entries.Where(e => e.Text.Contains(keyword) || e.Meaning.Contains(keyword) || (e.Reading != null && e.Reading.Contains(keyword)) || (e.Formation != null && e.Formation.Contains(keyword)))
                : entries.Where(e => e.Text.Contains(keyword) || e.Meaning.Contains(keyword) || (e.Reading != null && e.Reading.Contains(keyword)));
        }
        return entries;
    }
    private static LearnerContentRow Row(Entry e) => new(e.Id, e.Text, e.Reading, e.Meaning, e.JLPTLevel, e.PartOfSpeech, e.Formation, e.ExampleCount);

    public async Task<LearnerContentPage> ContentsAsync(int topicId, string kind, LearnerContentQuery q, CancellationToken ct = default)
    {
        Validate(q.Page, q.PageSize, q.Keyword);
        var topic = await TopicAsync(topicId, ct);
        var entries = Entries(topicId, kind, q.Keyword);
        var total = await entries.CountAsync(ct);
        var page = Math.Min(q.Page, Math.Max(1, (int)Math.Ceiling(total / (double)q.PageSize)));
        var items = await entries.OrderBy(e => e.Order).ThenBy(e => e.Id).Skip((page - 1) * q.PageSize).Take(q.PageSize).ToListAsync(ct);
        return new(topic, new(items.Select(Row).ToList(), total, page, q.PageSize));
    }
    private static LearnerSource Source(LearningContentSource s, string? externalId) => new(s.Name, s.Version, s.SourceUrl, s.License, s.LicenseUrl, s.Attribution, externalId);

    public async Task<LearnerContentDetail> DetailAsync(int topicId, string kind, int id, LearnerContentQuery q, CancellationToken ct = default)
    {
        Validate(q.Page, q.PageSize, q.Keyword);
        var topic = await TopicAsync(topicId, ct);
        var item = await Entries(topicId, kind, null).SingleOrDefaultAsync(e => e.Id == id, ct)
            ?? throw new LearningRequestException("Học liệu không còn hiển thị hoặc không thuộc chủ đề này.", 404);
        string? explanation, notes;
        List<LearnerExample> examples;
        List<LearnerSource> sources;
        IQueryable<LearningTopic> otherTopics;
        if (kind == "vocabularies")
        {
            var content = await db.Vocabularies.AsNoTracking().Include(v => v.Examples).ThenInclude(e => e.Source)
                .Include(v => v.Sources).ThenInclude(s => s.Source).AsSplitQuery().SingleAsync(v => v.Id == id, ct);
            explanation = content.Explanation; notes = content.UsageNotes;
            examples = content.Examples.OrderBy(e => e.OrderIndex).ThenBy(e => e.Id).Select(e => new LearnerExample(e.Id, e.JapaneseText,
                e.VietnameseTranslation, e.Furigana, e.ExternalId, e.Source is null ? null : Source(e.Source, e.ExternalId))).ToList();
            sources = content.Sources.OrderBy(s => s.Source.Name).ThenBy(s => s.Source.Version).ThenBy(s => s.ExternalId).Select(s => Source(s.Source, s.ExternalId)).ToList();
            otherTopics = Topics().Where(t => t.JLPTLevel == item.JLPTLevel && t.TopicVocabularies.Any(l => l.VocabularyId == id));
        }
        else
        {
            var content = await db.Grammars.AsNoTracking().Include(g => g.Examples).ThenInclude(e => e.Source)
                .Include(g => g.Sources).ThenInclude(s => s.Source).AsSplitQuery().SingleAsync(g => g.Id == id, ct);
            explanation = content.Explanation; notes = content.UsageNotes;
            examples = content.Examples.OrderBy(e => e.OrderIndex).ThenBy(e => e.Id).Select(e => new LearnerExample(e.Id, e.JapaneseText,
                e.VietnameseTranslation, e.Furigana, e.ExternalId, e.Source is null ? null : Source(e.Source, e.ExternalId))).ToList();
            if (examples.Count == 0 && !string.IsNullOrWhiteSpace(content.ExampleSentence)) examples.Add(new(0, content.ExampleSentence, null, null, null, null));
            sources = content.Sources.OrderBy(s => s.Source.Name).ThenBy(s => s.Source.Version).ThenBy(s => s.ExternalId).Select(s => Source(s.Source, s.ExternalId)).ToList();
            otherTopics = GrammarCatalogTopics(Topics(), topicId)
                .Where(t => t.JLPTLevel == item.JLPTLevel && t.TopicGrammars.Any(l => l.GrammarId == id));
        }
        var filtered = Entries(topicId, kind, q.Keyword);
        var previous = await filtered.Where(e => e.Order < item.Order || (e.Order == item.Order && e.Id < id))
            .OrderByDescending(e => e.Order).ThenByDescending(e => e.Id).FirstOrDefaultAsync(ct);
        var next = await filtered.Where(e => e.Order > item.Order || (e.Order == item.Order && e.Id > id))
            .OrderBy(e => e.Order).ThenBy(e => e.Id).FirstOrDefaultAsync(ct);
        async Task<int> PageFor(Entry? e) => e is null ? 1 : 1 + await filtered.CountAsync(x => x.Order < e.Order || (x.Order == e.Order && x.Id < e.Id), ct) / q.PageSize;
        return new(topic, Row(item), explanation, notes, examples, sources,
            await TopicRows(otherTopics.OrderBy(t => t.Name).ThenBy(t => t.Id)).ToListAsync(ct),
            previous?.Id, next?.Id, await PageFor(previous), await PageFor(next));
    }
}
