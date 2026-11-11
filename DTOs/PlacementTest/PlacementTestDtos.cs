namespace JCAP.DTOs.PlacementTest
{
    /// <summary>
    /// DTO trạng thái tổng thể Placement Test của người dùng.
    /// </summary>
    public sealed class PlacementTestStatusDto
    {
        public string PlacementTestStatus { get; set; } = "NotStarted"; // NotStarted | Skipped | InProgress | InsufficientEvidence | Completed
        public bool HasSeenPlacementPrompt { get; set; } = false;
        public int? ActiveSessionId { get; set; }
        public string? InitialEstimatedLevel { get; set; }
        public string? InitialConfidenceTier { get; set; }
        public string? InitialProficiencySnapshotJson { get; set; }
        public HotelContextPackageDto ContextPackage { get; set; } = new();
        public List<PlacementEventEvidenceSummary> EventSummaries { get; set; } = [];
    }

    /// <summary>
    /// DTO trả về khi khởi tạo hoặc tiếp tục (Resume) phiên Placement Test.
    /// </summary>
    public sealed class PlacementTestStartResponseDto
    {
        public int SessionId { get; set; }
        public string Status { get; set; } = "Active";
        public string CurrentEvent { get; set; } = "EVT-01";
        public string CurrentDifficultyBand { get; set; } = "N4";
        public bool IsResumed { get; set; }
        public PlacementTestTurnMessageDto OpeningMessage { get; set; } = new();
        public List<PlacementTestTurnMessageDto> MessageHistory { get; set; } = [];
        public HotelContextPackageDto ContextPackage { get; set; } = new();
        public List<PlacementEventEvidenceSummary> EventSummaries { get; set; } = [];
    }

    /// <summary>
    /// DTO gửi lên từ client khi học viên nói/nhập câu trả lời.
    /// </summary>
    public sealed class PlacementTestMessageRequestDto
    {
        public string Message { get; set; } = string.Empty;
        public bool FallbackToTextInput { get; set; } = false;
        public string? AudioUrl { get; set; }
        public double SpeakingDurationSeconds { get; set; }
        public double ResponseLatencySeconds { get; set; }
        public double? SpeechConfidence { get; set; }
    }

    /// <summary>
    /// DTO tin nhắn hiển thị trong phòng hội thoại Placement Test.
    /// </summary>
    public sealed class PlacementTestTurnMessageDto
    {
        public int Id { get; set; }
        public string Sender { get; set; } = "Ai"; // "Ai" | "User"
        public string JapaneseText { get; set; } = string.Empty;
        public string? VietnameseMeaning { get; set; }
        public string? FuriganaHtml { get; set; }
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }

    /// <summary>
    /// DTO phản hồi sau mỗi lượt tin nhắn trong Placement Test.
    /// </summary>
    public sealed class PlacementTestMessageResponseDto
    {
        public int SessionId { get; set; }
        public PlacementTestTurnMessageDto UserMessage { get; set; } = new();
        public PlacementTestTurnMessageDto AiMessage { get; set; } = new();
        public string CurrentEvent { get; set; } = "EVT-01";
        public string CurrentDifficultyBand { get; set; } = "N4";
        public int ScaffoldingStep { get; set; }
        public string InputClassification { get; set; } = "Valid"; // Valid | CommunicationDifficulty | OffTopic | AbusiveOrSpam
        public string DetectedIntent { get; set; } = string.Empty;
        public string DemonstratedBand { get; set; } = "Unobserved";
        public bool IsConcluded { get; set; }
        public string TerminationReason { get; set; } = "None"; // None | CompletedNormally | AbuseOrSpamLimit | OffTopicLimit | InsufficientEvidence
        public bool IsStrikeWarning { get; set; }
        public string? StrikeWarningMessage { get; set; }
        public int? TaskFulfillmentScore { get; set; }
        public int? GrammarAccuracyScore { get; set; }
        public int? VocabularyRangeScore { get; set; }
        public int? PragmaticsScore { get; set; }
        public string? EvidenceNote { get; set; }
        public string? EstimatedLevelSoFar { get; set; }
        public List<PlacementEventEvidenceSummary> EventSummaries { get; set; } = [];
    }

    /// <summary>
    /// DTO kết quả sau khi hoàn tất hoặc dừng phiên Placement Test.
    /// </summary>
    public sealed class PlacementTestCompleteResponseDto
    {
        public int SessionId { get; set; }
        public string PlacementTestStatus { get; set; } = "Completed"; // Completed | InsufficientEvidence
        public string InitialEstimatedLevel { get; set; } = "N5";
        public string InitialConfidenceTier { get; set; } = "Medium";
        public int OverallScore { get; set; }
        public int TaskFulfillmentScore { get; set; }
        public int GrammarAccuracyScore { get; set; }
        public int VocabularyRangeScore { get; set; }
        public int PragmaticsScore { get; set; }
        public SpeechDeliveryReferenceDto? SpeechDeliveryReference { get; set; } // Nullable nếu dùng bàn phím (BR-PT-23)
        public List<PlacementEventEvidenceSummary> EventSummaries { get; set; } = [];
        public string SummaryFeedback { get; set; } = string.Empty;
        public string Disclaimer { get; set; } = "Lưu ý: Kết quả này là ước lượng năng lực giao tiếp ban đầu trên hệ thống JCAP nhằm cá nhân hóa lộ trình học tập, không phải là chứng chỉ hay kết quả kỳ thi năng lực Nhật ngữ JLPT chính thức.";
        public DateTime CompletedAtUtc { get; set; } = DateTime.UtcNow;
    }

    /// <summary>
    /// DTO tóm tắt lịch sử một phiên kiểm tra xếp lớp (phục vụ danh sách lịch sử).
    /// </summary>
    public sealed class PlacementTestHistoryItemDto
    {
        public int SessionId { get; set; }
        public string Status { get; set; } = "Completed"; // Completed | InsufficientEvidence | Active | TerminatedEarly
        public string InitialEstimatedLevel { get; set; } = "Chưa xác định";
        public string InitialConfidenceTier { get; set; } = "Low";
        public int OverallScore { get; set; }
        public int TaskFulfillmentScore { get; set; }
        public int GrammarAccuracyScore { get; set; }
        public int VocabularyRangeScore { get; set; }
        public int PragmaticsScore { get; set; }
        public int TotalTurns { get; set; }
        public int FulfilledEventsCount { get; set; }
        public DateTime CreatedAt { get; set; }
        public DateTime? CompletedAt { get; set; }
    }

    /// <summary>
    /// DTO chi tiết toàn diện của một phiên kiểm tra xếp lớp trong lịch sử.
    /// </summary>
    public sealed class PlacementTestHistoryDetailDto
    {
        public int SessionId { get; set; }
        public string Status { get; set; } = "Completed";
        public string InitialEstimatedLevel { get; set; } = "Chưa xác định";
        public string InitialConfidenceTier { get; set; } = "Low";
        public int OverallScore { get; set; }
        public int TaskFulfillmentScore { get; set; }
        public int GrammarAccuracyScore { get; set; }
        public int VocabularyRangeScore { get; set; }
        public int PragmaticsScore { get; set; }
        public string SummaryFeedback { get; set; } = string.Empty;
        public string Disclaimer { get; set; } = string.Empty;
        public DateTime CreatedAt { get; set; }
        public DateTime? CompletedAt { get; set; }

        public List<PlacementEventEvidenceSummary> EventSummaries { get; set; } = [];
        public List<PlacementTurnEvidence> TurnEvidences { get; set; } = [];
        public List<PlacementTestTurnMessageDto> MessageHistory { get; set; } = [];
    }
}