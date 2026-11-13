using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using JCAP.DTOs.PlacementTest;
using JCAP.Services.Implementations;
using JCAP.Services.Interfaces;
using JCAP.Services.Models;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Xunit;

namespace JCAP.Tests.Services
{
    public class PlacementAssessmentEngineTests
    {
        private readonly VietnameseLearnerErrorDetector _errorDetector = new();

        private PlacementAssessmentEngine CreateEngine(Mock<IAiClient> aiClientMock)
        {
            return new PlacementAssessmentEngine(
                aiClientMock.Object,
                _errorDetector,
                NullLogger<PlacementAssessmentEngine>.Instance);
        }

        /// <summary>
        /// Kiểm chứng bộ 15 Câu trả lời Mẫu (Benchmark Validation Dataset S01 - S15)
        /// theo chuẩn JF Standard &amp; Giáo trình Dekiru Nihongo.
        /// Đảm bảo 100% điểm số do Backend C# tự tính toán tất định từ thuộc tính bằng chứng.
        /// </summary>
        [Theory]
        // S01: N5 chuẩn - Câu đơn đúng ngữ pháp 100%
        [InlineData("S01", "チェックインをお願いします。田中です。", "ConfirmReservation", "N5",
            "Fulfilled_Core", "Simple_CompleteClause", "NoError", "Adequate_StandardTopic", "Standard_Teineigo",
            false, 80, 85, 78, 80, "N5")]
        // S02: N4 chuẩn - Mệnh đề bổ nghĩa + khiêm nhường ngữ と申します
        [InlineData("S02", "今日から3泊予約した田中と申します。チェックインをお願いします。", "ConfirmReservation", "N4",
            "Exceeded_ProactiveDetail", "Compound_LinkedClause", "NoError", "Rich_SituationalSpecific", "Advanced_KeigoOrCushioned",
            false, 92, 92, 90, 92, "N4")]
        // S03: N3 chuẩn - Nhắc lại yêu cầu đặc biệt + rào đón んですが + kính ngữ ていただけますか
        [InlineData("S03", "本日3泊で予約している田中と申します。予約時に静かな部屋をお願いしたんですが、確認していただけますか。", "ConfirmReservationWithQuietRequest", "N3",
            "Exceeded_ProactiveDetail", "Complex_MultiClause", "NoError", "Rich_SituationalSpecific", "Advanced_KeigoOrCushioned",
            false, 92, 92, 90, 92, "N3")]
        // S04: N5 cơ bản - Hỏi phòng khác bằng câu đơn
        [InlineData("S04", "ほかの部屋はありますか？", "RequestRoomChange", "N5",
            "Fulfilled_Core", "Simple_CompleteClause", "NoError", "Adequate_StandardTopic", "Standard_Teineigo",
            false, 80, 85, 78, 80, "N5")]
        // S05: N4 chuẩn - Nêu lý do から + mẫu nhờ vả てもらえませんか
        [InlineData("S05", "エレベーターの隣はちょっとうるさいですから、静かな部屋に変えてもらえませんか。", "RequestRoomChange", "N4",
            "Exceeded_ProactiveDetail", "Compound_LinkedClause", "NoError", "Adequate_StandardTopic", "Advanced_KeigoOrCushioned",
            false, 92, 92, 78, 92, "N4")]
        // S06: N4 có lỗi trợ từ nhẹ (で thay vì に) -> Grammar giảm từ 92 xuống 70
        [InlineData("S06", "静かな部屋がいいので、他の部屋で変えてもらえませんか？", "RequestRoomChange", "N4",
            "Exceeded_ProactiveDetail", "Compound_LinkedClause", "MinorSlip_MeaningIntact", "Adequate_StandardTopic", "Standard_Teineigo",
            false, 92, 70, 78, 80, "N4")]
        // S07: N5 yếu & nói trống không (Tameguchi) -> Pragmatics = 48
        [InlineData("S07", "部屋、うるさい。変えて。", "RequestRoomChange", "N5",
            "Fulfilled_Core", "Fragment_WordOnly", "MinorSlip_MeaningIntact", "Basic_Minimal", "Abrupt_Casual",
            false, 80, 70, 65, 48, "N5")]
        // S08: N4 ngắn gọn đúng ngữ cảnh (〜にします)
        [InlineData("S08", "はい、デラックスルームにします。", "AcceptDeluxeUpgrade", "N4",
            "Fulfilled_Core", "Simple_CompleteClause", "NoError", "Adequate_StandardTopic", "Standard_Teineigo",
            false, 80, 85, 78, 80, "N4")]
        // S09: N3 chuẩn - Giả định なら + nguyên nhân ですので + kính ngữ
        [InlineData("S09", "1泊2,000円の追加なら予算内ですので、静かなデラックスルームに変更していただけますでしょうか。", "AcceptDeluxeUpgrade", "N3",
            "Exceeded_ProactiveDetail", "Complex_MultiClause", "NoError", "Rich_SituationalSpecific", "Advanced_KeigoOrCushioned",
            false, 92, 92, 90, 92, "N3")]
        // S10: Trả lời lửng lơ, chưa chốt quyết định -> Task = 65, Pragmatics = 62
        [InlineData("S10", "高いですね… どうしようかな。", "AskUpgradeDetails", "N5",
            "Partial_IncompleteInfo", "Simple_CompleteClause", "NoError", "Basic_Minimal", "Inconsistent_Mixed",
            false, 65, 85, 65, 62, "N5")]
        // S11: N5 chuẩn - Hỏi giờ ăn sáng
        [InlineData("S11", "朝ごはんは何時から何時までですか？", "AskBreakfastInfo", "N5",
            "Fulfilled_Core", "Simple_CompleteClause", "NoError", "Adequate_StandardTopic", "Standard_Teineigo",
            false, 80, 85, 78, 80, "N5")]
        // S12: N3 cao cấp - Từ chối lịch sự + chuyển ý ただ + điều kiện のであれば
        [InlineData("S12", "翌朝は早く出発する予定なので今回は結構です。ただ、もし1日だけ追加できるのであれば検討したいのですが。", "DeclineBreakfast", "N3",
            "Exceeded_ProactiveDetail", "Complex_MultiClause", "NoError", "Rich_SituationalSpecific", "Advanced_KeigoOrCushioned",
            false, 92, 92, 90, 92, "N3")]
        // S13: N4 chuẩn - Mệnh đề phụ thể thông thường trước から + mệnh đề chính lịch sự
        [InlineData("S13", "わたしは朝ごはんを食べないから、いりません。", "DeclineBreakfast", "N4",
            "Exceeded_ProactiveDetail", "Compound_LinkedClause", "NoError", "Adequate_StandardTopic", "Standard_Teineigo",
            false, 92, 92, 78, 80, "N4")]
        // S14: Chiến lược giao tiếp (Communication Repair) - Xin nói chậm lại lịch sự
        [InlineData("S14", "すみません、もう少しゆっくり話していただけますか？", "RequestRepetition", "N4",
            "Partial_IncompleteInfo", "Simple_CompleteClause", "NoError", "Adequate_StandardTopic", "Advanced_KeigoOrCushioned",
            true, 65, 85, 78, 92, "N4")]
        // S15: N3 chuẩn - Chốt thủ tục & cảm ơn trang trọng tại EVT-05
        [InlineData("S15", "いろいろ丁寧にご対応いただきありがとうございました。3日間よろしくお願いします。", "ConfirmAndThank", "N3",
            "Exceeded_ProactiveDetail", "Compound_LinkedClause", "NoError", "Rich_SituationalSpecific", "Advanced_KeigoOrCushioned",
            false, 92, 92, 90, 92, "N3")]
        public void ComputeDeterministicTurnScores_Benchmark15Samples_MatchesExpectedScores(
            string sampleId,
            string utterance,
            string intent,
            string rawBand,
            string taskAchievement,
            string sentenceStructure,
            string grammarSeverity,
            string lexicalUsage,
            string politenessRegister,
            bool isClarification,
            int expectedTask,
            int expectedGrammar,
            int expectedVocab,
            int expectedPragmatics,
            string expectedBand)
        {
            Assert.NotNull(sampleId);
            var evidence = new PlacementTurnObservableEvidence
            {
                TaskAchievement = taskAchievement,
                SentenceStructure = sentenceStructure,
                GrammarErrorSeverity = grammarSeverity,
                LexicalUsage = lexicalUsage,
                PolitenessRegister = politenessRegister
            };

            var result = PlacementAssessmentEngine.ComputeDeterministicTurnScores(
                utterance,
                "Valid",
                intent,
                rawBand,
                evidence,
                Array.Empty<string>(),
                isClarification);

            Assert.Equal(expectedTask, result.TaskScore);
            Assert.Equal(expectedGrammar, result.GrammarScore);
            Assert.Equal(expectedVocab, result.VocabScore);
            Assert.Equal(expectedPragmatics, result.PragmaticsScore);
            Assert.Equal(expectedBand, result.ValidatedBand);
        }

        [Fact]
        public async Task EvaluateTurnAsync_OffTopicUtterance_ForcesZeroScoresAndDoesNotAdvanceEvent()
        {
            var aiMock = new Mock<IAiClient>();
            aiMock.Setup(x => x.GenerateAsync(It.IsAny<AiRequest>(), It.IsAny<CancellationToken>()))
                .ReturnsAsync(AiResponse.Ok(@"{
                    ""userVietnameseMeaning"": ""Mì Ramen Nhật Bản ngon lắm nhỉ."",
                    ""userFuriganaHtml"": ""日本のラーメンはおいしいですね"",
                    ""turnAnalysis"": {
                        ""inputCategory"": ""OffTopic"",
                        ""detectedIntent"": ""OffTopic"",
                        ""demonstratedBand"": ""N3"",
                        ""evidence"": {
                            ""taskAchievement"": ""Exceeded_ProactiveDetail"",
                            ""sentenceStructure"": ""Compound_LinkedClause"",
                            ""grammarErrorSeverity"": ""NoError"",
                            ""grammarErrors"": [],
                            ""lexicalUsage"": ""Rich_SituationalSpecific"",
                            ""politenessRegister"": ""Standard_Teineigo""
                        },
                        ""evidenceNote"": ""Câu nói ngoài lề về ẩm thực.""
                    },
                    ""replyJapanese"": ""恐れ入りますが、チェックインのお名前をお伺いしてもよろしいでしょうか？"",
                    ""replyVietnamese"": ""Xin lỗi quý khách, tôi có thể xin tên nhận phòng được không ạ?""
                }"));

            var engine = CreateEngine(aiMock);
            var state = new PlacementAssessmentState { CurrentEvent = "EVT-01", CurrentDifficultyBand = "N4" };
            var req = new PlacementTestMessageRequestDto { Message = "日本のラーメンはとてもおいしいですね。" };

            var (updatedState, outcome) = await engine.EvaluateTurnAsync(state, req, "Tanaka");

            Assert.Equal("OffTopic", outcome.InputClassification);
            Assert.Equal("Unobserved", outcome.DemonstratedBand);
            Assert.Equal(0, outcome.TaskFulfillmentScore);
            Assert.Equal(0, outcome.GrammarAccuracyScore);
            Assert.Equal(0, outcome.VocabularyRangeScore);
            Assert.Equal(0, outcome.PragmaticsScore);
            Assert.Equal("EVT-01", updatedState.CurrentEvent); // Không được chuyển Event
            Assert.Equal("N4", updatedState.CurrentDifficultyBand); // Không được nâng lên N3 dù AI trả về N3
            Assert.Equal(1, updatedState.ConsecutiveOffTopicCount);
            Assert.True(outcome.IsStrikeWarning);
        }

        [Fact]
        public async Task EvaluateTurnAsync_JapaneseGibberishDetectedByAi_IncrementsSpamStrikeAndForcesZeroScores()
        {
            var aiMock = new Mock<IAiClient>();
            aiMock.Setup(x => x.GenerateAsync(It.IsAny<AiRequest>(), It.IsAny<CancellationToken>()))
                .ReturnsAsync(AiResponse.Ok(@"{
                    ""userVietnameseMeaning"": ""아かさたなはまやら"",
                    ""userFuriganaHtml"": ""あかさたなはまやら"",
                    ""turnAnalysis"": {
                        ""inputCategory"": ""AbusiveOrSpam"",
                        ""detectedIntent"": ""AbusiveOrSpam"",
                        ""demonstratedBand"": ""Unobserved"",
                        ""evidence"": {
                            ""taskAchievement"": ""Unfulfilled_Unclear"",
                            ""sentenceStructure"": ""Fragment_WordOnly"",
                            ""grammarErrorSeverity"": ""MajorError_MeaningAffected"",
                            ""grammarErrors"": [""Chuỗi ký tự vô nghĩa""],
                            ""lexicalUsage"": ""Inaccurate_WrongWord"",
                            ""politenessRegister"": ""Abrupt_Casual""
                        },
                        ""evidenceNote"": ""Gõ bàn phím chữ Nhật vô nghĩa.""
                    },
                    ""replyJapanese"": ""恐れ入りますが、日本語でお話しいただけますでしょうか。"",
                    ""replyVietnamese"": ""Xin thứ lỗi, quý khách có thể trao đổi bằng tiếng Nhật có nghĩa được không ạ?""
                }"));

            var engine = CreateEngine(aiMock);
            var state = new PlacementAssessmentState { CurrentEvent = "EVT-01", CurrentDifficultyBand = "N4" };
            var req = new PlacementTestMessageRequestDto { Message = "あかさたなはまやら" };

            var (updatedState, outcome) = await engine.EvaluateTurnAsync(state, req, "Tanaka");

            Assert.Equal("AbusiveOrSpam", outcome.InputClassification);
            Assert.Equal("Unobserved", outcome.DemonstratedBand);
            Assert.Equal(0, outcome.TaskFulfillmentScore);
            Assert.Equal(0, outcome.GrammarAccuracyScore);
            Assert.Equal(0, outcome.VocabularyRangeScore);
            Assert.Equal(0, outcome.PragmaticsScore);
            Assert.Equal(1, updatedState.AbuseOrSpamStrikeCount);
            Assert.Equal("EVT-01", updatedState.CurrentEvent);
            Assert.True(outcome.IsStrikeWarning);
        }

        [Fact]
        public void ComputeDeterministicTurnScores_BackendCrossChecks_EnforceConsistencyGuards()
        {
            // Trường hợp AI báo NoError nhưng lại liệt kê lỗi trong grammarErrors,
            // và báo Standard_Teineigo nhưng câu tiếng Nhật hoàn toàn nói trống không (không có です/ます)
            var contradictoryEvidence = new PlacementTurnObservableEvidence
            {
                TaskAchievement = "Fulfilled_Core",
                SentenceStructure = "Simple_CompleteClause",
                GrammarErrorSeverity = "NoError",
                GrammarErrors = new List<string> { "Nhầm trợ từ" },
                LexicalUsage = "Adequate_StandardTopic",
                PolitenessRegister = "Standard_Teineigo"
            };

            var scores = PlacementAssessmentEngine.ComputeDeterministicTurnScores(
                "他の部屋で変える", // Không có です/ます, độ dài > 4
                "Valid",
                "RequestRoomChange",
                "N3", // AI lỡ gán N3 cho câu đơn
                contradictoryEvidence,
                Array.Empty<string>());

            Assert.Equal(70, scores.GrammarScore); // Hạ từ 85 xuống 70 do có phần tử trong GrammarErrors
            Assert.Equal(62, scores.PragmaticsScore); // Hạ từ 80 xuống 62 do thiếu dấu hiệu lịch sự
            Assert.Equal("N4", scores.ValidatedBand); // Hạ từ N3 xuống N4 vì chỉ là câu đơn không kính ngữ
        }

        [Fact]
        public void ComputeTurnOverallScore_MatchesWeightedRubricFormula()
        {
            // Turn 1 Session #80: 0.35*80 + 0.25*85 + 0.20*78 + 0.20*80 = 80.85 -> 81
            Assert.Equal(81, PlacementAssessmentEngine.ComputeTurnOverallScore(80, 85, 78, 80));
            Assert.Equal(0, PlacementAssessmentEngine.ComputeTurnOverallScore(0, 0, 0, 0));
        }

        [Fact]
        public void ApplyEventTransition_Session80_OtherRoomInquiryMovesEvt02ToEvt03AndSelectsDeluxe()
        {
            var state = new PlacementAssessmentState
            {
                CurrentEvent = "EVT-02",
                CurrentDifficultyBand = "N4",
                ReservationConfirmed = true
            };

            // Mô phỏng Turn 3 của phiên #80: AI trả về intent ghép nhưng học viên hỏi phòng khác & AI báo Standard đã kín
            PlacementAssessmentEngine.ApplyEventTransition(
                state,
                detectedIntent: "AskRoomInfo / ExpressConcernNearElevator",
                demonstratedBand: "N4",
                taskScore: 80,
                grammarScore: 92,
                vocabScore: 78,
                evidenceNote: "Khách hỏi phòng khác vì phòng 512 ồn.",
                userText: "あの、それはちょっとうるさいですよね。ほかの部屋はありますか？",
                aiReplyJapanese: "申し訳ございません。あいにく、他のスタンダードルームはすべて満室でございます。");

            Assert.Equal("EVT-03", state.CurrentEvent);
            Assert.True(state.RoomChangeRequested);

            // Turn 4: Học viên hỏi về Deluxe tại EVT-03 -> giữ ở EVT-03, không nhảy cóc sang EVT-04
            PlacementAssessmentEngine.ApplyEventTransition(
                state,
                detectedIntent: "AskUpgradeDetails",
                demonstratedBand: "N4",
                taskScore: 80,
                grammarScore: 92,
                vocabScore: 78,
                evidenceNote: "Khách hỏi thông tin phòng Deluxe.",
                userText: "で、デラックスルームはどうですか。まだ予約できますか。",
                aiReplyJapanese: "はい、デラックスルームは空いておりますが、1泊につき2,000円の追加料金がかかりますが、よろしいでしょうか。");

            Assert.Equal("EVT-03", state.CurrentEvent);

            // Turn 5: Học viên chốt chọn phòng Deluxe -> lưu đúng Deluxe_Upgrade và sang EVT-04
            PlacementAssessmentEngine.ApplyEventTransition(
                state,
                detectedIntent: "AcceptDeluxeUpgrade",
                demonstratedBand: "N4",
                taskScore: 80,
                grammarScore: 85,
                vocabScore: 78,
                evidenceNote: "Khách đồng ý nâng hạng Deluxe.",
                userText: "じゃ、それにします。",
                aiReplyJapanese: "ありがとうございます。ご朝食はいかがなさいますか？");

            Assert.Equal("Deluxe_Upgrade", state.SelectedRoom);
            Assert.Equal("EVT-04", state.CurrentEvent);
            Assert.Contains(state.EventSummaries, e => e.EventCode == "EVT-03" && e.OutcomeStatus == "Fulfilled");
        }

        [Fact]
        public async Task EvaluateTurnAsync_PinsWorkingFallbackModelAcrossSubsequentTurns()
        {
            var aiMock = new Mock<IAiClient>();

            var validJson = """
                {
                  "userVietnameseMeaning": "Xin làm thủ tục nhận phòng. Tôi là Tanaka.",
                  "userFuriganaHtml": "チェックインをお願いします。",
                  "turnAnalysis": {
                    "inputCategory": "Valid",
                    "detectedIntent": "ConfirmReservation",
                    "demonstratedBand": "N5",
                    "evidence": {
                      "taskAchievement": "Fulfilled_Core",
                      "sentenceStructure": "Simple_CompleteClause",
                      "grammarErrorSeverity": "NoError",
                      "grammarErrors": [],
                      "lexicalUsage": "Adequate_StandardTopic",
                      "politenessRegister": "Standard_Teineigo"
                    },
                    "evidenceNote": "Câu đơn lịch sự đúng chuẩn N5."
                  },
                  "replyJapanese": "かしこまりました。512号室ですが、よろしいでしょうか。",
                  "replyFuriganaHtml": "かしこまりました。",
                  "replyVietnamese": "Tôi đã rõ ạ."
                }
                """;

            var seenPreferred = new List<string?>();
            var seenFallbackAny = new List<bool>();
            var callCount = 0;
            aiMock
                .Setup(x => x.GenerateAsync(It.IsAny<AiRequest>(), It.IsAny<CancellationToken>()))
                .ReturnsAsync((AiRequest req, CancellationToken _) =>
                {
                    seenPreferred.Add(req.PreferredModel);
                    seenFallbackAny.Add(req.FallbackOnAnyError);
                    callCount++;
                    var modelUsed = callCount == 1 ? "gemini-3.1-flash-lite" : "gemini-3-flash-preview";
                    return AiResponse.Ok(validJson, modelUsed);
                });

            var engine = CreateEngine(aiMock);
            var state = new PlacementAssessmentState();

            // Lượt 1: Chưa ghim model -> gửi PreferredModel=null, fallback sang 3.1 -> ghim 3.1
            await engine.EvaluateTurnAsync(state, new PlacementTestMessageRequestDto { Message = "チェックインをお願いします。田中です。" }, "Tanaka");
            Assert.Null(seenPreferred[0]);
            Assert.True(seenFallbackAny[0]);
            Assert.Equal("gemini-3.1-flash-lite", state.PreferredAiModel);

            // Lượt 2: Phải truyền 3.1; giả sử 3.1 lại lỗi nên fallback tiếp sang gemini-3-flash-preview -> ghim model thứ 3
            await engine.EvaluateTurnAsync(state, new PlacementTestMessageRequestDto { Message = "静かな部屋がいいです。" }, "Tanaka");
            Assert.Equal("gemini-3.1-flash-lite", seenPreferred[1]);
            Assert.Equal("gemini-3-flash-preview", state.PreferredAiModel);

            // Lượt 3: Phải truyền thẳng model thứ 3 cho đến hết phiên
            await engine.EvaluateTurnAsync(state, new PlacementTestMessageRequestDto { Message = "デラックスにします。" }, "Tanaka");
            Assert.Equal("gemini-3-flash-preview", seenPreferred[2]);
            Assert.Equal("gemini-3-flash-preview", state.PreferredAiModel);
        }
    }
}
