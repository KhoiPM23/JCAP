namespace JCAP.DTOs.PlacementTest
{
    /// <summary>
    /// Trạng thái điều phối thích ứng và dữ liệu thu thập của bài Placement Test (lưu trong RoleplaySession.AssessmentStateJson).
    /// </summary>
    public sealed class PlacementAssessmentState
    {
        // 1. Trạng thái Sự kiện & Bối cảnh Kịch bản (Do Backend C# kiểm soát - BR-PT-09)
        public string CurrentEvent { get; set; } = "EVT-01"; // EVT-01 .. EVT-05
        public string CurrentDifficultyBand { get; set; } = "N4"; // Bậc độ khó câu thoại AI: "N5" | "N4" | "N3"
        public int CurrentEventScaffoldingStep { get; set; } = 0; // 0 = Bình thường, 1 = Diễn đạt lại đơn giản, 2 = Gợi mở ngắn
        public int CurrentEventStayCount { get; set; } = 0; // Số lượt đã ở tại Event hiện tại
        public string? PreferredAiModel { get; set; } // Model Gemini đang hoạt động ổn định cho phiên hiện tại (sticky fallback)

        public bool ReservationConfirmed { get; set; } = false;
        public string AssignedRoom { get; set; } = "Standard_512_NearElevator";
        public bool RoomChangeRequested { get; set; } = false;
        public bool AlternativeRoomOffered { get; set; } = false;
        public string SelectedRoom { get; set; } = "Undecided"; // Undecided | Standard_512 | Deluxe_Upgrade
        public string BreakfastDecision { get; set; } = "Undecided"; // Undecided | Added | Declined

        // 2. Bộ đếm Phân loại Input tách biệt (BR-PT-14, BR-PT-21)
        public int ValidEvidenceTurnCount { get; set; } = 0;
        public int AbuseOrSpamStrikeCount { get; set; } = 0;
        public int ConsecutiveOffTopicCount { get; set; } = 0;
        public int CommunicationDifficultyCount { get; set; } = 0;
        public string TerminationReason { get; set; } = "None"; // None | CompletedNormally | AbuseOrSpamLimit | OffTopicLimit | InsufficientEvidence

        // 3. Nhật ký Bằng chứng theo từng Lượt & từng Sự kiện
        public List<PlacementTurnEvidence> TurnEvidences { get; set; } = [];
        public List<PlacementEventEvidenceSummary> EventSummaries { get; set; } = [];
    }

    /// <summary>
    /// Bằng chứng đánh giá thu thập được tại mỗi lượt hội thoại của học viên.
    /// </summary>
    public sealed class PlacementTurnEvidence
    {
        public int TurnIndex { get; set; }
        public string EventCode { get; set; } = string.Empty;
        public string PromptDifficultyBand { get; set; } = string.Empty;
        public int ScaffoldingStepUsed { get; set; }
        public string InputClassification { get; set; } = "Valid"; // Valid | CommunicationDifficulty | OffTopic | AbusiveOrSpam
        public string DetectedIntent { get; set; } = string.Empty;
        public string DemonstratedBand { get; set; } = "Unobserved"; // Unobserved | N5 | N4 | N3
        public int TaskFulfillmentScore { get; set; }
        public int GrammarAccuracyScore { get; set; }
        public int VocabularyRangeScore { get; set; }
        public int PragmaticsScore { get; set; }
        public int? OverallTurnScore { get; set; }
        public SpeechDeliveryReferenceDto? SpeechDeliveryReference { get; set; } // Nullable (BR-PT-23)
        public List<string> DetectedRuleErrorCodes { get; set; } = [];
        public PlacementTurnObservableEvidence? ObservableEvidence { get; set; }
        public string EvidenceNote { get; set; } = string.Empty;
    }

    /// <summary>
    /// Tổng kết bằng chứng thu thập theo từng sự kiện trong kịch bản.
    /// </summary>
    public sealed class PlacementEventEvidenceSummary
    {
        public string EventCode { get; set; } = string.Empty;
        public string CommunicativeGoal { get; set; } = string.Empty;
        public string OutcomeStatus { get; set; } = "Pending"; // Fulfilled | FulfilledWithScaffolding | InsufficientEvidence | Skipped
        public string HighestDemonstratedBand { get; set; } = "Unobserved"; // Unobserved | N5 | N4 | N3
        public int ScaffoldingStepsNeeded { get; set; }
        public string SummaryExplanation { get; set; } = string.Empty;
    }

    /// <summary>
    /// Dữ liệu phát âm và tốc độ nói chỉ mang tính chất tham khảo (Nullable - BR-PT-23).
    /// </summary>
    public sealed class SpeechDeliveryReferenceDto
    {
        public double SpeakingDurationSeconds { get; set; }
        public double ResponseLatencySeconds { get; set; }
        public double? SpeechConfidence { get; set; }
        public string Note { get; set; } = "Chỉ dùng tham khảo trải nghiệm giọng nói, không dùng làm thước đo quyết định xếp lớp JLPT.";
    }

    /// <summary>
    /// Gói dữ liệu bối cảnh trực quan Khách sạn Sakura (Hotel Context Package).
    /// </summary>
    public sealed class HotelContextPackageDto
    {
        public string HotelName { get; set; } = "ホテルさくら (Hotel Sakura)";
        public string GuestName { get; set; } = "Tanaka";
        public string BookingDates { get; set; } = "11月10日 ～ 11月13日 (3泊)";
        public string BookedRoomType { get; set; } = "Standard Room";
        public string SpecialRequest { get; set; } = "Ưu tiên phòng yên tĩnh";
        public string BreakfastPolicy { get; set; } = "Chưa bao gồm (1,500円/người/ngày, phục vụ 7:00 – 10:00)";
        public string CheckInTime { get; set; } = "15:00";
        public string CheckOutTime { get; set; } = "11:00";
        public int ReceptionistSpeakerId { get; set; } = 14;
        public List<HotelRoomOptionDto> RoomOptions { get; set; } =
        [
            new()
            {
                Code = "Standard",
                Name = "Standard Room (18m²)",
                BedType = "1 Giường đơn",
                Status = "Đã xếp Phòng 512",
                SurchargePerNight = 0,
                IsAvailable = true
            },
            new()
            {
                Code = "Deluxe",
                Name = "Deluxe Room (28m²)",
                BedType = "1 Giường đôi lớn (Xa thang máy, rất yên tĩnh)",
                Status = "Còn phòng trống",
                SurchargePerNight = 2000,
                IsAvailable = true
            },
            new()
            {
                Code = "Twin",
                Name = "Twin Room (25m²)",
                BedType = "2 Giường đơn",
                Status = "Hết phòng (満室)",
                SurchargePerNight = 0,
                IsAvailable = false
            }
        ];
    }

    /// <summary>
    /// Các thuộc tính bằng chứng ngôn ngữ quan sát được (theo chuẩn JF Standard &amp; Dekiru Nihongo)
    /// do AI trích xuất để Backend C# tự tính điểm tất định (Approach C).
    /// </summary>
    public sealed class PlacementTurnObservableEvidence
    {
        public string TaskAchievement { get; set; } = "Fulfilled_Core"; // Exceeded_ProactiveDetail | Fulfilled_Core | Partial_IncompleteInfo | Unfulfilled_Unclear
        public string SentenceStructure { get; set; } = "Simple_CompleteClause"; // Complex_MultiClause | Compound_LinkedClause | Simple_CompleteClause | Fragment_WordOnly
        public string GrammarErrorSeverity { get; set; } = "NoError"; // NoError | MinorSlip_MeaningIntact | MajorError_MeaningAffected
        public List<string> GrammarErrors { get; set; } = [];
        public string LexicalUsage { get; set; } = "Adequate_StandardTopic"; // Rich_SituationalSpecific | Adequate_StandardTopic | Basic_Minimal | Inaccurate_WrongWord
        public string PolitenessRegister { get; set; } = "Standard_Teineigo"; // Advanced_KeigoOrCushioned | Standard_Teineigo | Inconsistent_Mixed | Abrupt_Casual
    }

    public sealed class HotelRoomOptionDto
    {
        public string Code { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;
        public string BedType { get; set; } = string.Empty;
        public string Status { get; set; } = string.Empty;
        public int SurchargePerNight { get; set; }
        public bool IsAvailable { get; set; }
    }
}
