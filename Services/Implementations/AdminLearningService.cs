using JCAP.Data;
using JCAP.DTOs.Learning;
using JCAP.Models;
using Microsoft.EntityFrameworkCore;

namespace JCAP.Services.Implementations;

public sealed class LearningRequestException(string message, int status = 400) : Exception(message)
{
    public int Status { get; } = status;
}

public class AdminLearningService(AppDbContext db)
{
    public static readonly string[] Levels = ["N5", "N4", "N3", "N2", "N1"];
    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    private static void Check(bool condition, string message, int status = 400)
    {
        if (!condition) throw new LearningRequestException(message, status);
    }
    private static void Kind(string kind) => Check(kind is "vocabularies" or "grammars", "Loại nội dung không hợp lệ.");
    private static string Level(string? value) => value ?? "N5";

    private IQueryable<Vocabulary> Vocabularies() => db.Vocabularies
        .Include(v => v.TopicVocabularies).ThenInclude(t => t.Topic).Include(v => v.Examples).AsSplitQuery();
    private IQueryable<Grammar> Grammars() => db.Grammars
        .Include(g => g.TopicGrammars).ThenInclude(t => t.Topic).Include(g => g.Examples).AsSplitQuery();
    private static TopicOption Option(LearningTopic t) => new(t.Id, t.Code, t.Name, t.JLPTLevel, t.IsActive);
    private static ContentRow Row(Vocabulary v) => new(v.Id, v.Word, v.Reading, v.Meaning, Level(v.JLPTLevel),
        v.PartOfSpeech, v.IsActive, v.Examples.Count, v.TopicVocabularies.Select(t => Option(t.Topic)).ToList());
    private static ContentRow Row(Grammar g) => new(g.Id, g.Pattern, g.Reading, g.Meaning, Level(g.JLPTLevel),
        null, g.IsActive, g.Examples.Count, g.TopicGrammars.Select(t => Option(t.Topic)).ToList());
    private static TopicRow Row(LearningTopic t) => new(t.Id, t.Code, t.Name, t.JLPTLevel,
        t.Description, t.IsActive, t.TopicVocabularies.Count, t.TopicGrammars.Count);

    public async Task<List<TopicOption>> TopicOptionsAsync(string? level) => await db.LearningTopics.AsNoTracking()
        .Where(t => level == null || t.JLPTLevel == level).OrderByDescending(t => t.JLPTLevel).ThenBy(t => t.Name)
        .Select(t => new TopicOption(t.Id, t.Code, t.Name, t.JLPTLevel, t.IsActive)).ToListAsync();

    public async Task<LearningPage<TopicRow>> TopicsAsync(LearningQuery q)
    {
        var query = db.LearningTopics.AsNoTracking().AsQueryable();
        if (Clean(q.Keyword) is { } keyword) query = query.Where(t => t.Name.Contains(keyword) || t.Code.Contains(keyword));
        if (q.JLPTLevel is not null) query = query.Where(t => t.JLPTLevel == q.JLPTLevel);
        if (q.IsActive is { } active) query = query.Where(t => t.IsActive == active);
        var total = await query.CountAsync();
        var items = await query.OrderByDescending(t => t.CreatedAt).ThenByDescending(t => t.Id)
            .Skip((q.Page - 1) * q.PageSize).Take(q.PageSize)
            .Select(t => new TopicRow(t.Id, t.Code, t.Name, t.JLPTLevel, t.Description, t.IsActive,
                t.TopicVocabularies.Count, t.TopicGrammars.Count)).ToListAsync();
        return new(items, total, q.Page, q.PageSize);
    }

    public async Task<TopicDetail> TopicAsync(int id)
    {
        var topic = await db.LearningTopics.AsNoTracking().SingleOrDefaultAsync(t => t.Id == id);
        Check(topic is not null, "Không tìm thấy chủ đề.", 404);
        var vocabularies = await Vocabularies().AsNoTracking().Where(v => v.TopicVocabularies.Any(t => t.TopicId == id)).ToListAsync();
        var grammars = await Grammars().AsNoTracking().Where(g => g.TopicGrammars.Any(t => t.TopicId == id)).ToListAsync();
        var vOrder = await db.TopicVocabularies.Where(t => t.TopicId == id).ToDictionaryAsync(t => t.VocabularyId, t => t.OrderIndex);
        var gOrder = await db.TopicGrammars.Where(t => t.TopicId == id).ToDictionaryAsync(t => t.GrammarId, t => t.OrderIndex);
        return new(new TopicRow(topic!.Id, topic.Code, topic.Name, topic.JLPTLevel, topic.Description,
            topic.IsActive, vocabularies.Count, grammars.Count), vocabularies.OrderBy(v => vOrder[v.Id]).Select(Row).ToList(),
            grammars.OrderBy(g => gOrder[g.Id]).Select(Row).ToList());
    }

    public async Task<TopicDetail> SaveTopicAsync(int? id, SaveTopicRequest input)
    {
        var topic = id.HasValue ? await db.LearningTopics.Include(t => t.TopicVocabularies).ThenInclude(t => t.Vocabulary)
            .Include(t => t.TopicGrammars).ThenInclude(t => t.Grammar).AsSplitQuery().SingleOrDefaultAsync(t => t.Id == id) : new LearningTopic();
        Check(topic is not null, "Không tìm thấy chủ đề.", 404);
        Check(Levels.Contains(input.JLPTLevel), "Level không hợp lệ.");
        Check(!string.IsNullOrWhiteSpace(input.Code) && !string.IsNullOrWhiteSpace(input.Name), "Mã và tên chủ đề không được trống.");
        var code = input.Code.Trim().ToUpperInvariant();
        Check(!id.HasValue || code == topic!.Code, "Mã chủ đề được giữ cố định sau khi tạo.");
        Check(!await db.LearningTopics.AnyAsync(t => t.Id != id && t.Code == code), "Mã chủ đề đã tồn tại.", 409);
        Check(!await db.LearningTopics.AnyAsync(t => t.Id != id && t.Name == input.Name.Trim() && t.JLPTLevel == input.JLPTLevel),
            "Tên chủ đề đã tồn tại ở level này.", 409);
        Check(topic!.TopicVocabularies.All(t => Level(t.Vocabulary.JLPTLevel) == input.JLPTLevel)
            && topic.TopicGrammars.All(t => Level(t.Grammar.JLPTLevel) == input.JLPTLevel),
            "Chỉ đổi level sau khi gỡ các nội dung không cùng level khỏi chủ đề.");
        topic.Code = code; topic.Name = input.Name.Trim(); topic.JLPTLevel = input.JLPTLevel;
        topic.Description = Clean(input.Description);
        if (id.HasValue) topic.UpdatedAt = DateTime.UtcNow; else db.LearningTopics.Add(topic);
        await db.SaveChangesAsync();
        return await TopicAsync(topic.Id);
    }

    public async Task<LearningPage<ContentRow>> ContentsAsync(string kind, LearningQuery q)
    {
        Kind(kind);
        if (kind == "vocabularies")
        {
            var query = Vocabularies().AsNoTracking();
            if (Clean(q.Keyword) is { } keyword) query = query.Where(v => v.Word.Contains(keyword) || (v.Reading != null && v.Reading.Contains(keyword)) || v.Meaning.Contains(keyword));
            if (q.JLPTLevel is not null) query = query.Where(v => (v.JLPTLevel ?? "N5") == q.JLPTLevel);
            if (q.IsActive is { } active) query = query.Where(v => v.IsActive == active);
            if (q.TopicId is { } topicId) query = query.Where(v => v.TopicVocabularies.Any(t => t.TopicId == topicId));
            if (q.Untopiced) query = query.Where(v => !v.TopicVocabularies.Any());
            if (Clean(q.PartOfSpeech) is { } pos) query = query.Where(v => v.PartOfSpeech != null && v.PartOfSpeech.Contains(pos));
            var total = await query.CountAsync();
            var values = await query.OrderByDescending(v => v.Id).Skip((q.Page - 1) * q.PageSize).Take(q.PageSize).ToListAsync();
            return new(values.Select(Row).ToList(), total, q.Page, q.PageSize);
        }
        else
        {
            var query = Grammars().AsNoTracking();
            if (Clean(q.Keyword) is { } keyword) query = query.Where(g => g.Pattern.Contains(keyword) || (g.Reading != null && g.Reading.Contains(keyword)) || g.Meaning.Contains(keyword));
            if (q.JLPTLevel is not null) query = query.Where(g => (g.JLPTLevel ?? "N5") == q.JLPTLevel);
            if (q.IsActive is { } active) query = query.Where(g => g.IsActive == active);
            if (q.TopicId is { } topicId) query = query.Where(g => g.TopicGrammars.Any(t => t.TopicId == topicId));
            if (q.Untopiced) query = query.Where(g => !g.TopicGrammars.Any());
            var total = await query.CountAsync();
            var values = await query.OrderByDescending(g => g.Id).Skip((q.Page - 1) * q.PageSize).Take(q.PageSize).ToListAsync();
            return new(values.Select(Row).ToList(), total, q.Page, q.PageSize);
        }
    }

    public async Task<ContentDetail> ContentAsync(string kind, int id)
    {
        Kind(kind);
        if (kind == "vocabularies")
        {
            var v = await Vocabularies().AsNoTracking().Include(v => v.Examples).ThenInclude(e => e.Source)
                .Include(v => v.Sources).ThenInclude(s => s.Source).SingleOrDefaultAsync(v => v.Id == id);
            Check(v is not null, "Không tìm thấy từ vựng.", 404);
            return new(Row(v!), null, v!.Explanation, v.UsageNotes,
                v.Examples.OrderBy(e => e.OrderIndex).Select(e => new ExampleInfo(e.Id, e.JapaneseText, e.VietnameseTranslation, e.Furigana, e.OrderIndex, e.Source?.Name, e.ExternalId)).ToList(),
                v.Sources.Select(s => new SourceInfo(s.Source.Name, s.Source.Version, s.Source.SourceUrl, s.Source.License, s.Source.LicenseUrl, s.Source.Attribution, s.ExternalId)).ToList(),
                await db.ShadowingDialogueVocabularies.CountAsync(t => t.VocabularyId == id),
                await db.Set<ExploreSpotLessonVocabulary>().CountAsync(t => t.VocabularyId == id));
        }
        var g = await Grammars().AsNoTracking().Include(g => g.Examples).ThenInclude(e => e.Source)
            .Include(g => g.Sources).ThenInclude(s => s.Source).SingleOrDefaultAsync(g => g.Id == id);
        Check(g is not null, "Không tìm thấy ngữ pháp.", 404);
        return new(Row(g!), g!.Formation, g.Explanation, g.UsageNotes,
            g.Examples.OrderBy(e => e.OrderIndex).Select(e => new ExampleInfo(e.Id, e.JapaneseText, e.VietnameseTranslation, e.Furigana, e.OrderIndex, e.Source?.Name, e.ExternalId)).ToList(),
            g.Sources.Select(s => new SourceInfo(s.Source.Name, s.Source.Version, s.Source.SourceUrl, s.Source.License, s.Source.LicenseUrl, s.Source.Attribution, s.ExternalId)).ToList(),
            await db.ShadowingDialogueGrammars.CountAsync(t => t.GrammarId == id),
            await db.Set<ExploreSpotLessonGrammar>().CountAsync(t => t.GrammarId == id));
    }

    private async Task<List<LearningTopic>> ValidateTopicsAsync(List<int> ids, string level)
    {
        var distinct = ids.Distinct().ToArray();
        var topics = await db.LearningTopics.Where(t => distinct.Contains(t.Id)).ToListAsync();
        Check(topics.Count == distinct.Length, "Có chủ đề không tồn tại.");
        Check(topics.All(t => t.JLPTLevel == level), "Nội dung chỉ được gán vào chủ đề cùng level.");
        return topics;
    }

    public async Task<ContentDetail> SaveContentAsync(string kind, int? id, SaveContentRequest input)
    {
        Kind(kind);
        Check(Levels.Contains(input.JLPTLevel), "Level không hợp lệ.");
        Check(!string.IsNullOrWhiteSpace(input.Text) && !string.IsNullOrWhiteSpace(input.Meaning), "Nội dung và nghĩa không được trống.");
        Check(kind != "vocabularies" || input.Reading is null || input.Reading.Length <= 100, "Cách đọc từ vựng tối đa 100 ký tự.");
        Check(input.Examples.All(e => !string.IsNullOrWhiteSpace(e.JapaneseText)), "Câu ví dụ tiếng Nhật không được trống.");
        var exampleIds = input.Examples.Where(e => e.Id.HasValue).Select(e => e.Id!.Value).ToArray();
        Check(exampleIds.Distinct().Count() == exampleIds.Length, "ID ví dụ bị trùng.");
        var topics = await ValidateTopicsAsync(input.TopicIds, input.JLPTLevel);
        if (kind == "vocabularies")
        {
            var v = id.HasValue ? await Vocabularies().SingleOrDefaultAsync(v => v.Id == id) : new Vocabulary();
            Check(v is not null, "Không tìm thấy từ vựng.", 404);
            Check(exampleIds.All(i => v!.Examples.Any(e => e.Id == i)), "Ví dụ không thuộc từ vựng này.");
            if (!input.AllowSimilar)
                Check(!await db.Vocabularies.AnyAsync(other => other.Id != id && other.Word == input.Text.Trim()
                    && other.Reading == Clean(input.Reading)), "Đã có từ và cách đọc tương tự. Kiểm tra mục cũ hoặc xác nhận đây là mục nghĩa riêng.", 409);
            v!.Word = input.Text.Trim(); v.Reading = Clean(input.Reading); v.Meaning = input.Meaning.Trim();
            v.PartOfSpeech = Clean(input.PartOfSpeech); v.JLPTLevel = input.JLPTLevel;
            v.Explanation = Clean(input.Explanation); v.UsageNotes = Clean(input.UsageNotes);
            foreach (var link in v.TopicVocabularies.Where(t => !input.TopicIds.Contains(t.TopicId)).ToArray()) db.TopicVocabularies.Remove(link);
            foreach (var topic in topics.Where(t => v.TopicVocabularies.All(link => link.TopicId != t.Id)))
                v.TopicVocabularies.Add(new TopicVocabulary { Topic = topic, OrderIndex = await db.TopicVocabularies.Where(t => t.TopicId == topic.Id).Select(t => (int?)t.OrderIndex).MaxAsync() + 1 ?? 0 });
            foreach (var example in v.Examples.Where(e => !exampleIds.Contains(e.Id)).ToArray()) db.VocabularyExamples.Remove(example);
            foreach (var (row, index) in input.Examples.Select((e, i) => (e, i)))
            {
                var example = row.Id.HasValue ? v.Examples.Single(e => e.Id == row.Id) : new VocabularyExample();
                example.JapaneseText = row.JapaneseText.Trim(); example.VietnameseTranslation = Clean(row.VietnameseTranslation);
                example.Furigana = Clean(row.Furigana); example.OrderIndex = index;
                if (!row.Id.HasValue) v.Examples.Add(example);
            }
            if (id.HasValue) v.UpdatedAt = DateTime.UtcNow; else db.Vocabularies.Add(v);
            await db.SaveChangesAsync(); return await ContentAsync(kind, v.Id);
        }
        else
        {
            var g = id.HasValue ? await Grammars().SingleOrDefaultAsync(g => g.Id == id) : new Grammar();
            Check(g is not null, "Không tìm thấy ngữ pháp.", 404);
            Check(exampleIds.All(i => g!.Examples.Any(e => e.Id == i)), "Ví dụ không thuộc mẫu ngữ pháp này.");
            if (!input.AllowSimilar)
                Check(!await db.Grammars.AnyAsync(other => other.Id != id && other.Pattern == input.Text.Trim()),
                    "Đã có mẫu ngữ pháp tương tự. Kiểm tra mục cũ hoặc xác nhận đây là cách dùng riêng.", 409);
            g!.Pattern = input.Text.Trim(); g.Reading = Clean(input.Reading); g.Meaning = input.Meaning.Trim();
            g.Formation = Clean(input.Formation); g.JLPTLevel = input.JLPTLevel;
            g.Explanation = Clean(input.Explanation); g.UsageNotes = Clean(input.UsageNotes);
            foreach (var link in g.TopicGrammars.Where(t => !input.TopicIds.Contains(t.TopicId)).ToArray()) db.TopicGrammars.Remove(link);
            foreach (var topic in topics.Where(t => g.TopicGrammars.All(link => link.TopicId != t.Id)))
                g.TopicGrammars.Add(new TopicGrammar { Topic = topic, OrderIndex = await db.TopicGrammars.Where(t => t.TopicId == topic.Id).Select(t => (int?)t.OrderIndex).MaxAsync() + 1 ?? 0 });
            foreach (var example in g.Examples.Where(e => !exampleIds.Contains(e.Id)).ToArray()) db.GrammarExamples.Remove(example);
            foreach (var (row, index) in input.Examples.Select((e, i) => (e, i)))
            {
                var example = row.Id.HasValue ? g.Examples.Single(e => e.Id == row.Id) : new GrammarExample();
                example.JapaneseText = row.JapaneseText.Trim(); example.VietnameseTranslation = Clean(row.VietnameseTranslation);
                example.Furigana = Clean(row.Furigana); example.OrderIndex = index;
                if (!row.Id.HasValue) g.Examples.Add(example);
            }
            var firstExample = input.Examples.FirstOrDefault()?.JapaneseText.Trim();
            Check(firstExample?.Length <= 500 || firstExample is null, "Ví dụ đầu tiên tối đa 500 ký tự để tương thích các module hiện có.");
            g.ExampleSentence = firstExample;
            if (id.HasValue) g.UpdatedAt = DateTime.UtcNow; else db.Grammars.Add(g);
            await db.SaveChangesAsync(); return await ContentAsync(kind, g.Id);
        }
    }

    public async Task SetStatusAsync(string kind, int id, bool active)
    {
        if (kind == "topics")
        {
            var topic = await db.LearningTopics.FindAsync(id); Check(topic is not null, "Không tìm thấy chủ đề.", 404);
            topic!.IsActive = active; topic.UpdatedAt = DateTime.UtcNow;
        }
        else if (kind == "vocabularies")
        {
            var word = await db.Vocabularies.FindAsync(id); Check(word is not null, "Không tìm thấy từ vựng.", 404);
            word!.IsActive = active; word.UpdatedAt = DateTime.UtcNow;
        }
        else if (kind == "grammars")
        {
            var grammar = await db.Grammars.FindAsync(id); Check(grammar is not null, "Không tìm thấy ngữ pháp.", 404);
            grammar!.IsActive = active; grammar.UpdatedAt = DateTime.UtcNow;
        }
        else Kind(kind);
        await db.SaveChangesAsync();
    }

    public async Task BulkStatusAsync(BulkLearningStatusRequest input)
    {
        Kind(input.Kind);
        var ids = input.ItemIds.Distinct().ToArray();
        var now = DateTime.UtcNow;
        if (input.Kind == "vocabularies")
        {
            var items = await db.Vocabularies.Where(v => ids.Contains(v.Id)).ToListAsync();
            Check(items.Count == ids.Length && ids.Length > 0, "Có nội dung không tồn tại.");
            foreach (var item in items) { item.IsActive = input.IsActive; item.UpdatedAt = now; }
        }
        else
        {
            var items = await db.Grammars.Where(g => ids.Contains(g.Id)).ToListAsync();
            Check(items.Count == ids.Length && ids.Length > 0, "Có nội dung không tồn tại.");
            foreach (var item in items) { item.IsActive = input.IsActive; item.UpdatedAt = now; }
        }
        await db.SaveChangesAsync();
    }

    public async Task<TopicDetail> SetTopicContentsAsync(int id, TopicContentsRequest input)
    {
        var topic = await db.LearningTopics.Include(t => t.TopicVocabularies).Include(t => t.TopicGrammars)
            .AsSplitQuery().SingleOrDefaultAsync(t => t.Id == id);
        Check(topic is not null, "Không tìm thấy chủ đề.", 404);
        var vIds = input.VocabularyIds.Distinct().ToArray(); var gIds = input.GrammarIds.Distinct().ToArray();
        var words = await db.Vocabularies.Where(v => vIds.Contains(v.Id)).ToListAsync();
        var grammars = await db.Grammars.Where(g => gIds.Contains(g.Id)).ToListAsync();
        Check(words.Count == vIds.Length && grammars.Count == gIds.Length, "Có nội dung không tồn tại.");
        Check(words.All(v => Level(v.JLPTLevel) == topic!.JLPTLevel)
            && grammars.All(g => Level(g.JLPTLevel) == topic!.JLPTLevel), "Chỉ được gán nội dung cùng level với chủ đề.");
        foreach (var link in topic!.TopicVocabularies.Where(t => !vIds.Contains(t.VocabularyId)).ToArray()) db.TopicVocabularies.Remove(link);
        foreach (var link in topic.TopicGrammars.Where(t => !gIds.Contains(t.GrammarId)).ToArray()) db.TopicGrammars.Remove(link);
        foreach (var (itemId, index) in vIds.Select((itemId, index) => (itemId, index)))
        {
            var link = topic.TopicVocabularies.SingleOrDefault(t => t.VocabularyId == itemId);
            if (link is null) { link = new TopicVocabulary { VocabularyId = itemId }; topic.TopicVocabularies.Add(link); }
            link.OrderIndex = index;
        }
        foreach (var (itemId, index) in gIds.Select((itemId, index) => (itemId, index)))
        {
            var link = topic.TopicGrammars.SingleOrDefault(t => t.GrammarId == itemId);
            if (link is null) { link = new TopicGrammar { GrammarId = itemId }; topic.TopicGrammars.Add(link); }
            link.OrderIndex = index;
        }
        topic.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(); return await TopicAsync(id);
    }

    public async Task AssignTopicsAsync(AssignTopicsRequest input)
    {
        Kind(input.Kind);
        var ids = input.ItemIds.Distinct().ToArray();
        var levels = input.Kind == "vocabularies"
            ? await db.Vocabularies.Where(v => ids.Contains(v.Id)).Select(v => v.JLPTLevel ?? "N5").ToListAsync()
            : await db.Grammars.Where(g => ids.Contains(g.Id)).Select(g => g.JLPTLevel ?? "N5").ToListAsync();
        Check(levels.Count == ids.Length && ids.Length > 0, "Có nội dung không tồn tại.");
        Check(levels.Distinct().Count() == 1, "Chọn các nội dung cùng level để gán chủ đề hàng loạt.");
        var topics = await ValidateTopicsAsync(input.TopicIds, levels[0]);
        foreach (var topic in topics)
        {
            if (input.Kind == "vocabularies")
            {
                var existing = await db.TopicVocabularies.Where(t => t.TopicId == topic.Id).ToListAsync();
                var order = existing.Select(t => t.OrderIndex).DefaultIfEmpty(-1).Max() + 1;
                foreach (var id in ids.Where(id => existing.All(t => t.VocabularyId != id)))
                    db.TopicVocabularies.Add(new TopicVocabulary { TopicId = topic.Id, VocabularyId = id, OrderIndex = order++ });
            }
            else
            {
                var existing = await db.TopicGrammars.Where(t => t.TopicId == topic.Id).ToListAsync();
                var order = existing.Select(t => t.OrderIndex).DefaultIfEmpty(-1).Max() + 1;
                foreach (var id in ids.Where(id => existing.All(t => t.GrammarId != id)))
                    db.TopicGrammars.Add(new TopicGrammar { TopicId = topic.Id, GrammarId = id, OrderIndex = order++ });
            }
            topic.UpdatedAt = DateTime.UtcNow;
        }
        await db.SaveChangesAsync();
    }
}
