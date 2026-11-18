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
        /// theo chuẩn JF Standard &amp; Giáo trình Dekiru Nihongo với động cơ chấm điểm nội bậc (Band-Relative Scoring 2.0).
        /// Đảm bảo mỗi bậc N5 / N4 / N3 đều có thang 0-100 độc lập đo đúng mức độ hoàn thiện trong bậc đó.
        /// </summary>
        [Theory]
        // S01: N5 chuẩn - Câu đơn đúng ngữ pháp 100%, từ vựng & lịch sự đạt chuẩn tốt của N5 (90/92/90/90 -> Overall 91)
        [InlineData("S01", "チェックインをお願いします。田中です。", "ConfirmReservation", "N5",
            "Fulfilled_Core", "Simple_CompleteClause", "NoError", "Adequate_StandardTopic", "Standard_Teineigo",
            false, 90, 92, 90, 90, "N5")]
        // S02: N4 xuất sắc - Mệnh đề bổ nghĩa + khiêm nhường ngữ と申します (94/93/93/94 -> Overall 94)
        [InlineData("S02", "今日から3泊予約した田中と申します。チェックインをお願いします。", "ConfirmReservation", "N4",
            "Exceeded_ProactiveDetail", "Compound_LinkedClause", "NoError", "Rich_SituationalSpecific", "Advanced_KeigoOrCushioned",
            false, 94, 93, 93, 94, "N4")]
        // S03: N3 chuẩn mực - Nhắc lại yêu cầu đặc biệt + rào đón んですが + kính ngữ ていただけますか (94/95/94/94 -> Overall 94)
        [InlineData("S03", "本日3泊で予約している田中と申します。予約時に静かな部屋をお願いしたんですが、確認していただけますか。", "ConfirmReservationWithQuietRequest", "N3",
            "Exceeded_ProactiveDetail", "Complex_MultiClause", "NoError", "Rich_SituationalSpecific", "Advanced_KeigoOrCushioned",
            false, 94, 95, 94, 94, "N3")]
        // S04: N5 cơ bản - Hỏi phòng khác bằng câu đơn lịch sự chuẩn N5
        [InlineData("S04", "ほかの部屋はありますか？", "RequestRoomChange", "N5",
            "Fulfilled_Core", "Simple_CompleteClause", "NoError", "Adequate_StandardTopic", "Standard_Teineigo",
            false, 90, 92, 90, 90, "N5")]
        // S05: N4 chuẩn - Nêu lý do から + mẫu nhờ vả てもらえませんか (từ vựng thông dụng 86đ trong khung N4)
        [InlineData("S05", "エレベーターの隣はちょっとうるさいですから、静かな部屋に変えてもらえませんか。", "RequestRoomChange", "N4",
            "Exceeded_ProactiveDetail", "Compound_LinkedClause", "NoError", "Adequate_StandardTopic", "Advanced_KeigoOrCushioned",
            false, 94, 93, 86, 94, "N4")]
        // S06: N4 có lỗi trợ từ nhẹ (で thay vì に) -> Grammar trong khung N4 giảm từ 93 xuống 74
        [InlineData("S06", "静かな部屋がいいので、他の部屋で変えてもらえませんか？", "RequestRoomChange", "N4",
            "Exceeded_ProactiveDetail", "Compound_LinkedClause", "MinorSlip_MeaningIntact", "Adequate_StandardTopic", "Standard_Teineigo",
            false, 94, 74, 86, 86, "N4")]
        // S07: N5 yếu & nói trống không (Tameguchi) -> Pragmatics = 48, Vocab = 72, Grammar = 70
        [InlineData("S07", "部屋、うるさい。変えて。", "RequestRoomChange", "N5",
            "Fulfilled_Core", "Fragment_WordOnly", "MinorSlip_MeaningIntact", "Basic_Minimal", "Abrupt_Casual",
            false, 90, 70, 72, 48, "N5")]
        // S08: Câu đơn chọn phương án cơ bản không nêu lý do -> N5 chuẩn (90/92/90/90)
        [InlineData("S08", "はい、デラックスルームにします。", "AcceptDeluxeUpgrade", "N4",
            "Fulfilled_Core", "Simple_CompleteClause", "NoError", "Adequate_StandardTopic", "Standard_Teineigo",
            false, 90, 92, 90, 90, "N5")]
        // S09: N3 chuẩn - Giả định なら + nguyên nhân ですので + kính ngữ (94/95/94/94)
        [InlineData("S09", "1泊2,000円の追加なら予算内ですので、静かなデラックスルームに変更していただけますでしょうか。", "AcceptDeluxeUpgrade", "N3",
            "Exceeded_ProactiveDetail", "Complex_MultiClause", "NoError", "Rich_SituationalSpecific", "Advanced_KeigoOrCushioned",
            false, 94, 95, 94, 94, "N3")]
        // S10: Trả lời lửng lơ, chưa chốt quyết định -> Task = 68, Vocab = 72, Pragmatics = 64 trong khung N5
        [InlineData("S10", "高いですね… どうしようかな。", "AskUpgradeDetails", "N5",
            "Partial_IncompleteInfo", "Simple_CompleteClause", "NoError", "Basic_Minimal", "Inconsistent_Mixed",
            false, 68, 92, 72, 64, "N5")]
        // S11: N5 chuẩn - Hỏi giờ ăn sáng
        [InlineData("S11", "朝ごはんは何時から何時までですか？", "AskBreakfastInfo", "N5",
            "Fulfilled_Core", "Simple_CompleteClause", "NoError", "Adequate_StandardTopic", "Standard_Teineigo",
            false, 90, 92, 90, 90, "N5")]
        // S12: N3 cao cấp - Từ chối lịch sự + chuyển ý ただ + điều kiện のであれば
        [InlineData("S12", "翌朝は早く出発する予定なので今回は結構です。ただ、もし1日だけ追加できるのであれば検討したいのですが。", "DeclineBreakfast", "N3",
            "Exceeded_ProactiveDetail", "Complex_MultiClause", "NoError", "Rich_SituationalSpecific", "Advanced_KeigoOrCushioned",
            false, 94, 95, 94, 94, "N3")]
        // S13: N4 chuẩn - Mệnh đề phụ thể thông thường trước から + mệnh đề chính lịch sự
        [InlineData("S13", "わたしは朝ごはんを食べないから、いりません。", "DeclineBreakfast", "N4",
            "Exceeded_ProactiveDetail", "Compound_LinkedClause", "NoError", "Adequate_StandardTopic", "Standard_Teineigo",
            false, 94, 93, 86, 86, "N4")]
        // S14: Chiến lược giao tiếp (Communication Repair) ở mức N4 - Không bị phạt Task nặng (Task = 84)
        [InlineData("S14", "すみません、もう少しゆっくり話していただけますか？", "RequestRepetition", "N4",
            "Partial_IncompleteInfo", "Simple_CompleteClause", "NoError", "Adequate_StandardTopic", "Advanced_KeigoOrCushioned",
            true, 84, 88, 86, 94, "N4")]
        // S15: N3 chuẩn - Chốt thủ tục & cảm ơn trang trọng tại EVT-05 (Compound_LinkedClause ở N3 có Grammar = 91)
        [InlineData("S15", "いろいろ丁寧にご対応いただきありがとうございました。3日間よろしくお願いします。", "ConfirmAndThank", "N3",
            "Exceeded_ProactiveDetail", "Compound_LinkedClause", "NoError", "Rich_SituationalSpecific", "Advanced_KeigoOrCushioned",
            false, 94, 91, 94, 94, "N3")]
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

            Assert.Equal(72, scores.GrammarScore); // Hạ từ 92 xuống 72 do có phần tử trong GrammarErrors
            Assert.Equal(64, scores.PragmaticsScore); // Hạ từ 90 xuống 64 do thiếu dấu hiệu lịch sự
            Assert.Equal("N5", scores.ValidatedBand); // Câu đơn không kính ngữ, thiếu lịch sự -> chốt N5
        }

        [Fact]
        public void ComputeFinalResult_MixedBandsSession_ReAnchorsAndWeightsTurnsFairly()
        {
            var aiMock = new Mock<IAiClient>();
            var engine = CreateEngine(aiMock);

            var state = new PlacementAssessmentState
            {
                CurrentEvent = "CONCLUDED",
                TerminationReason = "CompletedNormally",
                TurnEvidences =
                [
                    // Lượt 1 (EVT-01): N4 chuẩn (90/93/86/86)
                    new PlacementTurnEvidence
                    {
                        TurnIndex = 1, EventCode = "EVT-01", InputClassification = "Valid",
                        DetectedIntent = "ConfirmReservation", DemonstratedBand = "N4",
                        TaskFulfillmentScore = 90, GrammarAccuracyScore = 93, VocabularyRangeScore = 86, PragmaticsScore = 86
                    },
                    // Lượt 2 (EVT-02): N4 chuẩn (90/93/86/86)
                    new PlacementTurnEvidence
                    {
                        TurnIndex = 2, EventCode = "EVT-02", InputClassification = "Valid",
                        DetectedIntent = "RequestRoomChange", DemonstratedBand = "N4",
                        TaskFulfillmentScore = 90, GrammarAccuracyScore = 93, VocabularyRangeScore = 86, PragmaticsScore = 86
                    },
                    // Lượt 3 (EVT-03): Bứt phá lên N3 (85/88/85/85 theo thang N3 -> khi quy về N4 được nhân 1.12 và trọng số 1.25)
                    new PlacementTurnEvidence
                    {
                        TurnIndex = 3, EventCode = "EVT-03", InputClassification = "Valid",
                        DetectedIntent = "AcceptDeluxeUpgrade", DemonstratedBand = "N3",
                        TaskFulfillmentScore = 85, GrammarAccuracyScore = 88, VocabularyRangeScore = 85, PragmaticsScore = 85
                    },
                    // Lượt 4 (EVT-04): Nói câu đơn N5 ở sự kiện chính (90/92/90/90 theo thang N5 -> quy về N4 nhân 0.85 và trọng số 0.65)
                    new PlacementTurnEvidence
                    {
                        TurnIndex = 4, EventCode = "EVT-04", InputClassification = "Valid",
                        DetectedIntent = "DeclineBreakfast", DemonstratedBand = "N5",
                        TaskFulfillmentScore = 90, GrammarAccuracyScore = 92, VocabularyRangeScore = 90, PragmaticsScore = 90
                    },
                    // Lượt 5 (EVT-05): Cảm ơn kết thúc ngắn ở mức N5 (Lượt phụ trợ -> nhân 0.96, trọng số 0.35)
                    new PlacementTurnEvidence
                    {
                        TurnIndex = 5, EventCode = "EVT-05", InputClassification = "Valid",
                        DetectedIntent = "ConfirmAndThank", DemonstratedBand = "N5",
                        TaskFulfillmentScore = 90, GrammarAccuracyScore = 92, VocabularyRangeScore = 90, PragmaticsScore = 90
                    }
                ],
                EventSummaries =
                [
                    new PlacementEventEvidenceSummary { EventCode = "EVT-01", OutcomeStatus = "Fulfilled", HighestDemonstratedBand = "N4" },
                    new PlacementEventEvidenceSummary { EventCode = "EVT-02", OutcomeStatus = "Fulfilled", HighestDemonstratedBand = "N4" },
                    new PlacementEventEvidenceSummary { EventCode = "EVT-03", OutcomeStatus = "Fulfilled", HighestDemonstratedBand = "N3" },
                    new PlacementEventEvidenceSummary { EventCode = "EVT-04", OutcomeStatus = "Fulfilled", HighestDemonstratedBand = "N5" },
                    new PlacementEventEvidenceSummary { EventCode = "EVT-05", OutcomeStatus = "Fulfilled", HighestDemonstratedBand = "N5" }
                ]
            };

            var finalResult = engine.ComputeFinalResult(99, state);

            Assert.Equal("Completed", finalResult.PlacementTestStatus);
            Assert.Equal("N4", finalResult.InitialEstimatedLevel);
            Assert.Equal("High", finalResult.InitialConfidenceTier);
            Assert.InRange(finalResult.OverallScore, 88, 91);
        }

        [Fact]
        public async Task EvaluateTurnAsync_Session91Regression_BlocksPrematureKeyHandoverBeforeEvt05()
        {
            var aiMock = new Mock<IAiClient>();
            aiMock.Setup(x => x.GenerateAsync(It.IsAny<AiRequest>(), It.IsAny<CancellationToken>()))
                .ReturnsAsync(AiResponse.Ok(@"{
                    ""userVietnameseMeaning"": ""Nếu phụ phí không quá cao thì đổi cho tôi sang phòng Deluxe 801 được không?"",
                    ""turnAnalysis"": {
                        ""inputCategory"": ""Valid"",
                        ""detectedIntent"": ""RequestRoomChange"",
                        ""demonstratedBand"": ""N3"",
                        ""evidence"": {
                            ""taskAchievement"": ""Exceeded_ProactiveDetail"",
                            ""sentenceStructure"": ""Complex_MultiClause"",
                            ""grammarErrorSeverity"": ""NoError"",
                            ""grammarErrors"": [],
                            ""lexicalUsage"": ""Rich_SituationalSpecific"",
                            ""politenessRegister"": ""Advanced_KeigoOrCushioned""
                        },
                        ""evidenceNote"": ""Khách đặt điều kiện về phụ phí và đề nghị đổi sang Deluxe 801.""
                    },
                    ""replyJapanese"": ""かしこまりました。それでは、プラス6,000円でデラックスルームの801号室に変更いたしますね。こちらの鍵でございます。ごゆっくりお寛ぎください。"",
                    ""replyVietnamese"": ""Tôi đã rõ ạ. Vậy tôi sẽ đổi sang phòng Deluxe 801 với phụ phí 6,000 yên. Đây là chìa khóa phòng của quý khách. Chúc quý khách nghỉ ngơi thoải mái.""
                }"));

            var engine = CreateEngine(aiMock);
            var state = new PlacementAssessmentState
            {
                CurrentEvent = "EVT-02",
                CurrentDifficultyBand = "N3",
                ReservationConfirmed = true
            };

            var (updatedState, outcome) = await engine.EvaluateTurnAsync(
                state,
                new PlacementTestMessageRequestDto { Message = "もし追加料金がそれほど高くなければ、801号室のデラックスルームに変更していただけますでしょうか。" },
                "Tanaka");

            Assert.Equal("EVT-03", updatedState.CurrentEvent);
            Assert.Equal("Undecided", updatedState.SelectedRoom);
            Assert.False(outcome.IsConcluded);
            Assert.DoesNotContain("鍵", outcome.AiReplyJapanese);
            Assert.DoesNotContain("お寛ぎ", outcome.AiReplyJapanese);
            Assert.Contains("801号室", outcome.AiReplyJapanese);
            Assert.Contains("？", outcome.AiReplyJapanese);
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
