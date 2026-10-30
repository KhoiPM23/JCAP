using JCAP.Data;
using JCAP.Data.Seeds;
using JCAP.DTOs.Explore;
using JCAP.Models;
using JCAP.Services.Implementations;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace JCAP.Tests.Services
{
    public class AdminExploreSpotServiceTests
    {
        private const int Hokkaido = 1, Tokyo = 13, Nara = 29;

        private sealed record Refs(int GrammarId, int VocabId, int DialogueId, int InactiveDialogueId, int RoleplayId, int ArchivedRoleplayId);

        private static async Task<(AppDbContext Db, Refs Refs)> SeededContext(string name)
        {
            var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>()
                .UseInMemoryDatabase($"JCAP_AdminExploreSpot_{name}_{Guid.NewGuid()}").Options);
            var services = new ServiceCollection().AddSingleton(db).BuildServiceProvider();
            await ExploreSeeder.SeedAsync(services);

            var scenario = new Scenario { Title = "Ở nhà ga", Description = "d" };
            var grammar = new Grammar { Pattern = "N をください", Meaning = "Xin cho tôi N", JLPTLevel = "N5" };
            var vocab = new Vocabulary { Word = "切符", Reading = "きっぷ", Meaning = "vé", JLPTLevel = "N5" };
            var dialogue = new ShadowingDialogue { Title = "Mua vé tàu", Scenario = scenario, JLPTLevel = "N5" };
            var inactive = new ShadowingDialogue { Title = "Bài cũ", Scenario = scenario, JLPTLevel = "N5", IsActive = false };
            var roleplay = new ScenarioLevelConfiguration { Scenario = scenario, JLPTLevel = "N5", Title = "Hỏi đường", Status = "Published" };
            var archived = new ScenarioLevelConfiguration { Scenario = scenario, JLPTLevel = "N5", Title = "Cũ", Status = "Archived" };
            db.AddRange(grammar, vocab, dialogue, inactive, roleplay, archived);
            await db.SaveChangesAsync();
            return (db, new Refs(grammar.Id, vocab.Id, dialogue.Id, inactive.Id, roleplay.Id, archived.Id));
        }

        /// <summary>Mốc đủ mọi mục kiểm tra</summary>
        private static SaveExploreSpotDto Complete(Refs r) => new()
        {
            IconId = "P_test",
            NameVi = "Ga Sapporo",
            NameJp = "札幌駅",
            NameKana = "さっぽろえき",
            Latitude = 43.0687,
            Longitude = 141.3508,
            JLPTLevel = "N5",
            Situation = "Bạn mua vé tàu ở quầy.",
            RealUse = "Mua vé ở mọi nhà ga.",
            Sentence = new() { new() { Text = "切符", Reading = "きっぷ" }, new() { Text = "を" }, new() { Text = "ください。" } },
            Meaning = "Cho tôi một vé.",
            EstimatedMinutes = 4,
            GrammarIds = new() { r.GrammarId },
            VocabularyIds = new() { r.VocabId },
            Activities = new() { new() { Type = ExploreActivityType.Shadowing, ReferenceId = r.DialogueId } },
        };

        /// <summary>Mốc nháp mới chỉ có tên và vị trí</summary>
        private static SaveExploreSpotDto Minimal() => new()
        {
            IconId = "P_test",
            NameVi = "Ga Sapporo",
            NameJp = "札幌駅",
            Latitude = 43.0687,
            Longitude = 141.3508,
        };

        [Fact]
        public async Task PrefectureContent_ListsDraftAndPublished_WithMissingChecks()
        {
            var (db, _) = await SeededContext("content");
            using var _db = db;
            var result = await new AdminExploreSpotService(db).GetPrefectureContentAsync(Nara);

            Assert.True(result.Success);
            Assert.True(result.Data!.IsOpen);
            Assert.Equal("鹿", result.Data.Word!.Word);
            Assert.Equal(4, result.Data.Spots.Count);
            Assert.Single(result.Data.Spots, s => s.Status == ExploreSpotStatus.Draft);
            // Mốc seed chưa gắn mục tiêu và Shadowing
            Assert.All(result.Data.Spots, s => Assert.Contains(ExploreSpotCheck.Shadowing, s.Missing));
            Assert.All(result.Data.Spots, s => Assert.DoesNotContain(ExploreSpotCheck.Situation, s.Missing));
        }

        [Fact]
        public async Task CreateSpot_AlwaysDraft_AndNormalizesSentence()
        {
            var (db, r) = await SeededContext("create");
            using var _db = db;
            var dto = Complete(r);
            dto.Sentence = new() { new() { Text = " 切符", Reading = "きっぷ" }, new() { Text = "を" }, new() { Text = "ください。 ", Reading = " " } };

            var result = await new AdminExploreSpotService(db).CreateSpotAsync(Hokkaido, dto);

            Assert.True(result.Success);
            var spot = result.Data!;
            Assert.Equal(ExploreSpotStatus.Draft, spot.Status);
            Assert.Empty(spot.Missing);
            Assert.Equal(2, spot.Sentence.Count);
            Assert.Equal("切符", spot.Sentence[0].Text);
            Assert.Equal("をください。", spot.Sentence[1].Text);
            Assert.Null(spot.Sentence[1].Reading);
            Assert.Equal(60, spot.Activities.Single().PassThreshold);
            Assert.Equal("Mua vé tàu", spot.Activities.Single().Reference!.Title);
            Assert.Equal("N をください", spot.Grammars.Single().Title);
        }

        [Fact]
        public async Task CreateSpot_MinimalDraft_IsAllowed_ButReportsMissing()
        {
            var (db, _) = await SeededContext("minimal");
            using var _db = db;
            var result = await new AdminExploreSpotService(db).CreateSpotAsync(Hokkaido, Minimal());

            Assert.True(result.Success);
            Assert.Equal(
                new[] { ExploreSpotCheck.Sentence, ExploreSpotCheck.Target, ExploreSpotCheck.Situation, ExploreSpotCheck.RealUse, ExploreSpotCheck.Shadowing },
                result.Data!.Missing);
        }

        [Fact]
        public async Task CreateSpot_InvalidInput_Fails()
        {
            var (db, r) = await SeededContext("invalid");
            using var _db = db;
            var service = new AdminExploreSpotService(db);

            var outside = Minimal();
            outside.Latitude = 10;
            var badIcon = Minimal();
            badIcon.IconId = "../evil";
            var quiz = Complete(r);
            quiz.Activities.Add(new() { Type = ExploreActivityType.Quiz });
            var inactiveDialogue = Complete(r);
            inactiveDialogue.Activities[0].ReferenceId = r.InactiveDialogueId;
            var archivedRoleplay = Complete(r);
            archivedRoleplay.Activities.Add(new() { Type = ExploreActivityType.Roleplay, ReferenceId = r.ArchivedRoleplayId });
            var unknownGrammar = Complete(r);
            unknownGrammar.GrammarIds.Add(99999);
            var badLevel = Complete(r);
            badLevel.JLPTLevel = "N1";

            foreach (var dto in new[] { outside, badIcon, quiz, inactiveDialogue, archivedRoleplay, unknownGrammar, badLevel })
            {
                var result = await service.CreateSpotAsync(Hokkaido, dto);
                Assert.False(result.Success);
                Assert.NotEmpty(result.Errors!);
            }
            Assert.Equal(0, await db.ExploreSpots.CountAsync(s => s.PrefectureId == Hokkaido));
        }

        [Fact]
        public async Task Publish_RequiresAllChecks()
        {
            var (db, r) = await SeededContext("publish");
            using var _db = db;
            var service = new AdminExploreSpotService(db);
            var draft = (await service.CreateSpotAsync(Hokkaido, Minimal())).Data!;

            var refused = await service.SetStatusAsync(draft.Id, ExploreSpotStatus.Published);
            Assert.False(refused.Success);
            Assert.Contains("bài Shadowing", refused.Errors!);

            await service.UpdateSpotAsync(draft.Id, Complete(r));
            var published = await service.SetStatusAsync(draft.Id, ExploreSpotStatus.Published);
            Assert.True(published.Success);
            Assert.Equal(ExploreSpotStatus.Published, published.Data!.Status);
        }

        [Fact]
        public async Task Publish_FailsWhenShadowingDialogueWasDeactivatedLater()
        {
            var (db, r) = await SeededContext("stale");
            using var _db = db;
            var service = new AdminExploreSpotService(db);
            var draft = (await service.CreateSpotAsync(Hokkaido, Complete(r))).Data!;

            (await db.ShadowingDialogues.FindAsync(r.DialogueId))!.IsActive = false;
            await db.SaveChangesAsync();

            var result = await service.SetStatusAsync(draft.Id, ExploreSpotStatus.Published);
            Assert.False(result.Success);
            Assert.Contains(ExploreSpotCheck.Shadowing, (await service.GetSpotAsync(draft.Id)).Data!.Missing);
        }

        [Fact]
        public async Task UpdatePublishedSpot_CannotBlankWhatLearnersSee_ButCanSaveOtherwise()
        {
            var (db, r) = await SeededContext("update-published");
            using var _db = db;
            var service = new AdminExploreSpotService(db);
            var asakusa = await db.ExploreSpots.AsNoTracking().FirstAsync(s => s.NameJp == "浅草");

            var blank = Complete(r);
            blank.Situation = "";
            Assert.False((await service.UpdateSpotAsync(asakusa.Id, blank)).Success);
            Assert.NotEqual("", (await db.ExploreSpotLessons.AsNoTracking().FirstAsync(l => l.SpotId == asakusa.Id)).Situation);

            // Mốc seed (chưa gắn mục tiêu) vẫn lưu dần được
            var partial = Complete(r);
            partial.GrammarIds.Clear();
            partial.VocabularyIds.Clear();
            var saved = await service.UpdateSpotAsync(asakusa.Id, partial);
            Assert.True(saved.Success);
            Assert.Equal(ExploreSpotStatus.Published, saved.Data!.Status);
            Assert.Contains(ExploreSpotCheck.Target, saved.Data.Missing);
        }

        [Fact]
        public async Task Update_KeepsActivityRowsByType_AndReplacesTargets()
        {
            var (db, r) = await SeededContext("activities");
            using var _db = db;
            var service = new AdminExploreSpotService(db);
            var spot = (await service.CreateSpotAsync(Hokkaido, Complete(r))).Data!;
            var shadowingRowId = (await db.ExploreSpotActivities.AsNoTracking().SingleAsync()).Id;

            var dto = Complete(r);
            dto.Activities[0].PassThreshold = 75;
            dto.Activities.Add(new() { Type = ExploreActivityType.Roleplay, ReferenceId = r.RoleplayId, PassThreshold = 50 });
            dto.GrammarIds.Clear();
            var updated = (await service.UpdateSpotAsync(spot.Id, dto)).Data!;

            Assert.Equal(new[] { ExploreActivityType.Shadowing, ExploreActivityType.Roleplay }, updated.Activities.Select(a => a.Type));
            Assert.Equal(75, updated.Activities[0].PassThreshold);
            Assert.Null(updated.Activities[1].PassThreshold);
            Assert.Equal(shadowingRowId, (await db.ExploreSpotActivities.AsNoTracking().SingleAsync(a => a.ActivityType == ExploreActivityType.Shadowing)).Id);
            Assert.Empty(updated.Grammars);
            Assert.Equal(0, await db.ExploreSpotLessonGrammars.CountAsync());

            dto.Activities.RemoveAt(1);
            Assert.Single((await service.UpdateSpotAsync(spot.Id, dto)).Data!.Activities);
        }

        [Fact]
        public async Task Unpublish_LastPublishedSpotOfOpenPrefecture_IsBlocked()
        {
            var (db, r) = await SeededContext("last");
            using var _db = db;
            var service = new AdminExploreSpotService(db);
            var chibaSpots = await db.ExploreSpots.Where(s => s.PrefectureId == 12).OrderBy(s => s.Id).ToListAsync();

            Assert.True((await service.SetStatusAsync(chibaSpots[0].Id, ExploreSpotStatus.Draft)).Success);
            Assert.True((await service.SetStatusAsync(chibaSpots[1].Id, ExploreSpotStatus.Draft)).Success);
            var last = await service.SetStatusAsync(chibaSpots[2].Id, ExploreSpotStatus.Draft);

            Assert.False(last.Success);
            Assert.Equal(ExploreSpotStatus.Published, (await db.ExploreSpots.AsNoTracking().FirstAsync(s => s.Id == chibaSpots[2].Id)).Status);
        }

        [Fact]
        public async Task Deactivate_OnlyDraftSpots_SoftDeletes()
        {
            var (db, r) = await SeededContext("deactivate");
            using var _db = db;
            var service = new AdminExploreSpotService(db);
            var draft = (await service.CreateSpotAsync(Hokkaido, Minimal())).Data!;
            var asakusa = await db.ExploreSpots.AsNoTracking().FirstAsync(s => s.NameJp == "浅草");

            Assert.False((await service.DeactivateSpotAsync(asakusa.Id)).Success);
            Assert.True((await service.DeactivateSpotAsync(draft.Id)).Success);

            var stored = await db.ExploreSpots.AsNoTracking().FirstAsync(s => s.Id == draft.Id);
            Assert.False(stored.IsActive);
            Assert.False((await service.GetSpotAsync(draft.Id)).Success);
            Assert.DoesNotContain((await service.GetPrefectureContentAsync(Hokkaido)).Data!.Spots, s => s.Id == draft.Id);
        }

        [Fact]
        public async Task SaveWord_CreatesThenUpdates_AndValidates()
        {
            var (db, _) = await SeededContext("word");
            using var _db = db;
            var service = new AdminExploreSpotService(db);

            Assert.False((await service.SaveWordAsync(Hokkaido, new AdminExploreWordDto { Word = "", Kana = "", Meaning = "", Status = "Draft" })).Success);

            var created = await service.SaveWordAsync(Hokkaido, new AdminExploreWordDto { Word = "雪", Kana = "ゆき", Meaning = "tuyết", Status = "Draft" });
            Assert.True(created.Success);
            var updated = await service.SaveWordAsync(Hokkaido, new AdminExploreWordDto { Word = "雪", Kana = "ゆき", Meaning = "tuyết", Note = " Mùa đông ", Status = "Published" });
            Assert.Equal("Mùa đông", updated.Data!.Note);
            Assert.Equal(ExploreSpotStatus.Published, (await db.ExploreProvinceWords.FindAsync(Hokkaido))!.Status);
        }

        [Fact]
        public async Task Lookup_FiltersByKindLevelAndQuery_HidesInactive()
        {
            var (db, r) = await SeededContext("lookup");
            using var _db = db;
            var service = new AdminExploreSpotService(db);

            Assert.Single((await service.LookupAsync("grammar", "N5", "ください")).Data!);
            Assert.Empty((await service.LookupAsync("grammar", "N4", null)).Data!);
            Assert.Equal("切符 (きっぷ)", (await service.LookupAsync("vocabulary", null, "vé")).Data!.Single().Title);
            Assert.Equal(new[] { r.DialogueId }, (await service.LookupAsync("shadowing", "N5", null)).Data!.Select(d => d.Id));
            Assert.Equal(new[] { r.RoleplayId }, (await service.LookupAsync("roleplay", null, null)).Data!.Select(d => d.Id));
            Assert.False((await service.LookupAsync("quiz", null, null)).Success);
        }

        [Fact]
        public async Task Lookup_ShowsWhichSpotsUseEachItem_IgnoringDeactivatedSpots()
        {
            var (db, r) = await SeededContext("usedby");
            using var _db = db;
            var service = new AdminExploreSpotService(db);
            var sapporo = (await service.CreateSpotAsync(Hokkaido, Complete(r))).Data!;
            var tokyoDto = Complete(r);
            tokyoDto.NameVi = "Ga Tokyo";
            tokyoDto.Latitude = 35.6812;
            tokyoDto.Longitude = 139.7671;
            var tokyo = (await service.CreateSpotAsync(Tokyo, tokyoDto)).Data!;
            var removed = (await service.CreateSpotAsync(Nara, Complete(r))).Data!;
            await service.DeactivateSpotAsync(removed.Id);

            var dialogue = (await service.LookupAsync("shadowing", null, null)).Data!.Single();
            Assert.Equal(new[] { sapporo.Id, tokyo.Id }, dialogue.UsedBy.Select(u => u.SpotId));
            Assert.Equal(new[] { Hokkaido, Tokyo }, dialogue.UsedBy.Select(u => u.PrefectureId));
            Assert.All(dialogue.UsedBy, u => Assert.Equal(ExploreSpotStatus.Draft, u.Status));

            Assert.Equal(2, (await service.LookupAsync("grammar", null, null)).Data!.Single(g => g.Id == r.GrammarId).UsedBy.Count);
            Assert.Empty((await service.LookupAsync("roleplay", null, null)).Data!.Single().UsedBy);

            // Trình soạn cũng biết bài Shadowing đang gắn còn được dùng ở mốc nào khác
            var reference = (await service.GetSpotAsync(sapporo.Id)).Data!.Activities.Single().Reference!;
            Assert.Equal(new[] { sapporo.Id, tokyo.Id }, reference.UsedBy.Select(u => u.SpotId));
        }

        [Fact]
        public async Task GetUsages_ByKindAndId()
        {
            var (db, r) = await SeededContext("usages");
            using var _db = db;
            var service = new AdminExploreSpotService(db);
            var dto = Complete(r);
            dto.Activities.Add(new() { Type = ExploreActivityType.Roleplay, ReferenceId = r.RoleplayId });
            var spot = (await service.CreateSpotAsync(Hokkaido, dto)).Data!;

            Assert.Equal(spot.Id, (await service.GetUsagesAsync("roleplay", r.RoleplayId)).Data!.Single().SpotId);
            Assert.Equal(spot.Id, (await service.GetUsagesAsync("vocabulary", r.VocabId)).Data!.Single().SpotId);
            Assert.Empty((await service.GetUsagesAsync("shadowing", r.InactiveDialogueId)).Data!);
            Assert.False((await service.GetUsagesAsync("quiz", 1)).Success);
        }

        [Fact]
        public async Task ListSpots_CoversAllPrefectures_WithAttachedContentAndWarnings()
        {
            var (db, r) = await SeededContext("list");
            using var _db = db;
            var service = new AdminExploreSpotService(db);
            var dto = Complete(r);
            dto.Activities.Add(new() { Type = ExploreActivityType.Roleplay, ReferenceId = r.RoleplayId });
            var spot = (await service.CreateSpotAsync(Hokkaido, dto)).Data!;

            var rows = (await service.ListSpotsAsync()).Data!;
            Assert.Equal(16, rows.Count); // 15 mốc seed + 1 mốc mới
            Assert.Equal(rows.OrderBy(x => x.PrefectureId).ThenBy(x => x.Id).Select(x => x.Id), rows.Select(x => x.Id));
            var row = rows.Single(x => x.Id == spot.Id);
            Assert.Equal("Mua vé tàu", row.Shadowing!.Title);
            Assert.Equal("Ở nhà ga · Hỏi đường", row.Roleplay!.Title);
            Assert.Equal(1, row.GrammarCount);
            Assert.Empty(row.Missing);
            Assert.False(row.HasUnavailableContent);
            Assert.Equal(15, rows.Count(x => x.Missing.Contains(ExploreSpotCheck.Shadowing)));

            // Nhóm ngừng dùng bài Shadowing -> mốc bị đánh dấu
            (await db.ShadowingDialogues.FindAsync(r.DialogueId))!.IsActive = false;
            await db.SaveChangesAsync();
            row = (await service.ListSpotsAsync()).Data!.Single(x => x.Id == spot.Id);
            Assert.True(row.HasUnavailableContent);
            Assert.False(row.Shadowing!.Available);
            Assert.Contains(ExploreSpotCheck.Shadowing, row.Missing);
        }

        [Fact]
        public async Task LearnerApi_OnlySeesPublishedSpots()
        {
            var (db, r) = await SeededContext("learner");
            using var _db = db;
            var service = new AdminExploreSpotService(db);
            var draft = (await service.CreateSpotAsync(Tokyo, Complete(r))).Data!;
            var learner = new ExploreService(db);
            await ExploreServiceTests.UnlockAllChapters(db, "learner-1");

            Assert.DoesNotContain((await learner.GetPrefectureAsync("learner-1", Tokyo)).Data!.Spots, s => s.Id == draft.Id);
            await service.SetStatusAsync(draft.Id, ExploreSpotStatus.Published);
            var shown = (await learner.GetPrefectureAsync("learner-1", Tokyo)).Data!.Spots.Single(s => s.Id == draft.Id);
            Assert.Equal("Shadowing", shown.Lesson!.Activities.Single().Type);
        }
    }
}
