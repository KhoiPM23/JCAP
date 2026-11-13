using JCAP.Services.Implementations;
using Xunit;

namespace JCAP.Tests.Services;

public class EventDirectorTests
{
    private readonly EventDirector _director = new();

    [Fact]
    public void Catalog_ContainsAllFiveCanonicalEvents()
    {
        var allEvents = _director.GetAllEvents();
        Assert.Equal(5, allEvents.Count);

        var codes = allEvents.Select(e => e.EventCode).ToHashSet();
        Assert.Contains("EV_SOLD_OUT", codes);
        Assert.Contains("EV_DELAY", codes);
        Assert.Contains("EV_SPEAK_FAST", codes);
        Assert.Contains("EV_MISHEARD", codes);
        Assert.Contains("EV_INDIRECT_REFUSAL", codes);
    }

    [Theory]
    [InlineData(1)]
    [InlineData(2)]
    public void TimingGuard_PreventsEvents_InFirstTwoTurns(int turnIndex)
    {
        var decision = _director.EvaluateEventTrigger(
            jlptLevel: "N4",
            currentTurnIndex: turnIndex,
            turnsSinceLastEvent: 10,
            totalEventsTriggeredSoFar: 0,
            remainingMissionsCount: 2,
            compatibleEventsJson: null);

        Assert.False(decision.ShouldTriggerEvent);
        Assert.Null(decision.TriggeredEvent);
    }

    [Fact]
    public void TimingGuard_PreventsEvents_WhenAllMissionsAreAlreadyCompleted()
    {
        var decision = _director.EvaluateEventTrigger(
            jlptLevel: "N3",
            currentTurnIndex: 4,
            turnsSinceLastEvent: 4,
            totalEventsTriggeredSoFar: 0,
            remainingMissionsCount: 0, // No remaining missions
            compatibleEventsJson: null);

        Assert.False(decision.ShouldTriggerEvent);
    }

    [Theory]
    [InlineData("N5", 1)]
    [InlineData("N4", 2)]
    [InlineData("N3", 2)]
    public void LevelGating_RestrictsMaxEventsPerSession(string level, int maxAllowed)
    {
        // When already reached the max allowed events
        var decision = _director.EvaluateEventTrigger(
            jlptLevel: level,
            currentTurnIndex: 5,
            turnsSinceLastEvent: 5,
            totalEventsTriggeredSoFar: maxAllowed,
            remainingMissionsCount: 2,
            compatibleEventsJson: null);

        Assert.False(decision.ShouldTriggerEvent);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(1)]
    [InlineData(2)]
    public void CooldownGuard_BlocksConsecutiveEvents_WithinThreeTurns(int turnsSinceLast)
    {
        var decision = _director.EvaluateEventTrigger(
            jlptLevel: "N3",
            currentTurnIndex: 5,
            turnsSinceLastEvent: turnsSinceLast,
            totalEventsTriggeredSoFar: 1, // Already triggered 1
            remainingMissionsCount: 2,
            compatibleEventsJson: null);

        Assert.False(decision.ShouldTriggerEvent);
    }

    [Fact]
    public void CooldownGuard_AllowsEvent_WhenThreeOrMoreTurnsElapsed()
    {
        var decision = _director.EvaluateEventTrigger(
            jlptLevel: "N4",
            currentTurnIndex: 6,
            turnsSinceLastEvent: 3, // At least 3 turns since previous
            totalEventsTriggeredSoFar: 1,
            remainingMissionsCount: 2,
            compatibleEventsJson: null);

        Assert.True(decision.ShouldTriggerEvent);
        Assert.NotNull(decision.TriggeredEvent);
        Assert.NotNull(decision.DirectiveForAiPrompt);
    }

    [Fact]
    public void CompatibleEventsPool_RestrictsCandidates_ToSpecifiedList()
    {
        var compatibleJson = "[\"EV_DELAY\", \"EV_INDIRECT_REFUSAL\"]";

        var decision = _director.EvaluateEventTrigger(
            jlptLevel: "N3",
            currentTurnIndex: 3,
            turnsSinceLastEvent: 10,
            totalEventsTriggeredSoFar: 0,
            remainingMissionsCount: 3,
            compatibleEventsJson: compatibleJson);

        Assert.True(decision.ShouldTriggerEvent);
        Assert.NotNull(decision.TriggeredEvent);
        Assert.Contains(decision.TriggeredEvent.EventCode, new[] { "EV_DELAY", "EV_INDIRECT_REFUSAL" });
    }

    [Fact]
    public void EvaluateEventTrigger_ProducesCompleteDirectives_AndSoftLandingPrompt()
    {
        var decision = _director.EvaluateEventTrigger(
            jlptLevel: "N4",
            currentTurnIndex: 3,
            turnsSinceLastEvent: 10,
            totalEventsTriggeredSoFar: 0,
            remainingMissionsCount: 2,
            compatibleEventsJson: "[\"EV_SOLD_OUT\"]");

        Assert.True(decision.ShouldTriggerEvent);
        Assert.Equal("EV_SOLD_OUT", decision.TriggeredEvent!.EventCode);
        Assert.Contains("[BRANCHING EVENT: EV_SOLD_OUT", decision.DirectiveForAiPrompt);
        Assert.Contains("[SOFT LANDING SAFEGUARD:", decision.DirectiveForAiPrompt);
        Assert.False(string.IsNullOrWhiteSpace(decision.TriggeredEvent.CueJapanese));
        Assert.False(string.IsNullOrWhiteSpace(decision.TriggeredEvent.CueVietnamese));
    }
}
