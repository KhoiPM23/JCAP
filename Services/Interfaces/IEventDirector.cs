namespace JCAP.Services.Interfaces;

public sealed record BranchingEventDefinition
{
    public string EventCode { get; init; } = null!;
    public string Name { get; init; } = null!;
    public string CueJapanese { get; init; } = null!;
    public string CueVietnamese { get; init; } = null!;
    public string TestedSkill { get; init; } = null!;
    public string CompletionCriteria { get; init; } = null!;
}

public sealed record EventDirectorDecision
{
    public bool ShouldTriggerEvent { get; init; }
    public BranchingEventDefinition? TriggeredEvent { get; init; }
    public string? DirectiveForAiPrompt { get; init; }
    public string? EventCode { get; init; }
}

public interface IEventDirector
{
    EventDirectorDecision EvaluateEventTrigger(
        string jlptLevel,
        int currentTurnIndex,
        int turnsSinceLastEvent,
        int totalEventsTriggeredSoFar,
        int remainingMissionsCount,
        string? compatibleEventsJson,
        string? lastUserUtterance = null);

    BranchingEventDefinition? GetEventByCode(string eventCode);
    IReadOnlyList<BranchingEventDefinition> GetAllEvents();
}
