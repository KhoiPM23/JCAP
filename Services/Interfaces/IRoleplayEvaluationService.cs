using JCAP.Models;

namespace JCAP.Services.Interfaces;

public interface IRoleplayEvaluationService
{
    RoleplayEvaluationResult? Evaluate(
        IEnumerable<string?> linguisticFeedbackJsonValues,
        int completedMissionCount,
        int totalMissionCount,
        bool isNaturallyConcluded);
}
