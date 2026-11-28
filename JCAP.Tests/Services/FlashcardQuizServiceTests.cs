using System;
using System.Threading.Tasks;
using JCAP.Data;
using JCAP.DTOs.Flashcard;
using JCAP.Models;
using JCAP.Services.Implementations;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace JCAP.Tests.Services;

public class FlashcardQuizServiceTests
{
    private static AppDbContext CreateInMemoryContext() =>
        new(new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase($"FlashcardQuizTests_{Guid.NewGuid()}")
            .Options);

    private static async Task<(Vocabulary Vocab1, Vocabulary Vocab2, Grammar Grammar1)> SeedEntitiesAsync(
        AppDbContext db,
        string userId = "learner-quiz-1")
    {
        var user = new ApplicationUser
        {
            Id = userId,
            UserName = "quizlearner@jcap.test",
            Email = "quizlearner@jcap.test",
            Role = "Learner",
            JLPTLevel = "N5",
            IsActive = true
        };

        var vocab1 = new Vocabulary
        {
            Id = 301,
            Word = "食べる",
            Reading = "たべる",
            Meaning = "Ăn",
            JLPTLevel = "N5",
            IsActive = true
        };

        var vocab2 = new Vocabulary
        {
            Id = 302,
            Word = "飲む",
            Reading = "のむ",
            Meaning = "Uống",
            JLPTLevel = "N5",
            IsActive = true
        };

        var grammar1 = new Grammar
        {
            Id = 401,
            Pattern = "〜たいです",
            Meaning = "Muốn làm ...",
            Formation = "Vます + たいです",
            JLPTLevel = "N5",
            IsActive = true
        };

        db.Users.Add(user);
        db.Vocabularies.AddRange(vocab1, vocab2);
        db.Grammars.Add(grammar1);

        var topic = new LearningTopic
        {
            Id = 10,
            Code = "TOPIC_FOOD_N5",
            Name = "Ăn uống N5",
            IsActive = true
        };
        topic.TopicVocabularies.Add(new TopicVocabulary { TopicId = 10, VocabularyId = vocab1.Id, Vocabulary = vocab1, OrderIndex = 1 });
        topic.TopicVocabularies.Add(new TopicVocabulary { TopicId = 10, VocabularyId = vocab2.Id, Vocabulary = vocab2, OrderIndex = 2 });
        topic.TopicGrammars.Add(new TopicGrammar { TopicId = 10, GrammarId = grammar1.Id, Grammar = grammar1, OrderIndex = 1 });
        db.LearningTopics.Add(topic);

        await db.SaveChangesAsync();
        return (vocab1, vocab2, grammar1);
    }

    [Fact]
    public async Task SubmitAttempt_And_GetHistoryAndDetail_WorkIndependentlyFromSrs()
    {
        using var db = CreateInMemoryContext();
        var (vocab1, vocab2, grammar1) = await SeedEntitiesAsync(db);
        var service = new FlashcardQuizService(db, new DefaultLearningTopicLookup(db));

        // 1. Submit TopicSet attempt (1 correct, 1 wrong, 1 skipped)
        var submitRes = await service.SubmitAttemptAsync("learner-quiz-1", new SubmitFlashcardQuizAttemptRequestDto
        {
            SourceType = "TopicSet",
            TopicId = 10,
            ContentType = "Mixed",
            Direction = "ja_to_vi",
            CardScope = "all",
            InstantFeedback = true,
            DurationSeconds = 75,
            Items =
            {
                new SubmitFlashcardQuizAttemptItemDto
                {
                    QuestionIndex = 1,
                    QuestionType = "multiple_choice",
                    Direction = "ja_to_vi",
                    ItemType = "Vocabulary",
                    ItemId = vocab1.Id,
                    PromptText = vocab1.Word,
                    CorrectAnswer = vocab1.Meaning,
                    UserAnswer = vocab1.Meaning,
                    IsCorrect = true,
                    IsSkipped = false
                },
                new SubmitFlashcardQuizAttemptItemDto
                {
                    QuestionIndex = 2,
                    QuestionType = "written",
                    Direction = "ja_to_vi",
                    ItemType = "Vocabulary",
                    ItemId = vocab2.Id,
                    PromptText = vocab2.Word,
                    CorrectAnswer = vocab2.Meaning,
                    UserAnswer = "Ngủ",
                    IsCorrect = false,
                    IsSkipped = false
                },
                new SubmitFlashcardQuizAttemptItemDto
                {
                    QuestionIndex = 3,
                    QuestionType = "true_false",
                    Direction = "ja_to_vi",
                    ItemType = "Grammar",
                    ItemId = grammar1.Id,
                    PromptText = grammar1.Pattern,
                    CorrectAnswer = "TRUE",
                    UserAnswer = null,
                    IsCorrect = false,
                    IsSkipped = true
                }
            }
        });

        Assert.True(submitRes.Success);
        Assert.NotNull(submitRes.Data);
        Assert.Equal("TopicSet", submitRes.Data!.SourceType);
        Assert.Equal(10, submitRes.Data.TopicId);
        Assert.Equal("Mixed", submitRes.Data.ContentType);
        Assert.Equal(3, submitRes.Data.TotalQuestions);
        Assert.Equal(1, submitRes.Data.CorrectCount);
        Assert.Equal(1, submitRes.Data.WrongCount);
        Assert.Equal(1, submitRes.Data.SkippedCount);
        Assert.Equal(33, submitRes.Data.ScorePercent);
        Assert.Equal(75, submitRes.Data.DurationSeconds);

        // Verify SRS tables are completely untouched
        Assert.Empty(db.FlashcardStudySessions);
        Assert.Empty(db.FlashcardReviewLogs);
        Assert.Empty(db.LearnerFlashcardProgresses);

        // 2. Get history list
        var historyRes = await service.GetHistoryAsync("learner-quiz-1");
        Assert.True(historyRes.Success);
        Assert.Single(historyRes.Data!);
        Assert.Equal(submitRes.Data.AttemptId, historyRes.Data![0].AttemptId);

        // 3. Get detail
        var detailRes = await service.GetHistoryDetailAsync("learner-quiz-1", submitRes.Data.AttemptId);
        Assert.True(detailRes.Success);
        Assert.Equal(3, detailRes.Data!.Items.Count);
        Assert.Equal("multiple_choice", detailRes.Data.Items[0].QuestionType);
        Assert.True(detailRes.Data.Items[0].IsCorrect);
        Assert.Equal("Ngủ", detailRes.Data.Items[1].UserAnswer);
        Assert.False(detailRes.Data.Items[1].IsCorrect);
        Assert.True(detailRes.Data.Items[2].IsSkipped);

        // 4. Another user cannot access this attempt
        var otherUserDetail = await service.GetHistoryDetailAsync("other-user", submitRes.Data.AttemptId);
        Assert.False(otherUserDetail.Success);

        // 5. Empty items fail cleanly
        var emptyRes = await service.SubmitAttemptAsync("learner-quiz-1", new SubmitFlashcardQuizAttemptRequestDto());
        Assert.False(emptyRes.Success);
    }
}
