using System.Text.Json;
using JCAP.Models;

namespace JCAP.Data.Seeds
{
    public static class ScenarioSeedData
    {
        private static readonly JsonSerializerOptions JsonOptions = new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            WriteIndented = false
        };

        private static string CreateCriteriaJson(string intent, string target, params string[] conditions)
        {
            var criteria = new MissionCompletionCriteria
            {
                Intent = intent,
                Target = target,
                Conditions = conditions.ToList()
            };
            return JsonSerializer.Serialize(criteria, JsonOptions);
        }

        public static List<Scenario> GetInitialScenarios()
        {
            return new List<Scenario>
            {
                new Scenario
                {
                    Title = "Gọi món tại quán mì Ramen",
                    Description = "Thực hành giao tiếp tiếng Nhật cơ bản khi gọi món, chọn khẩu vị và thanh toán tại quán mì Ramen Nhật Bản.",
                    Thumbnail = "https://images.unsplash.com/photo-1569718212165-3a8278d5f624",
                    IsActive = true,
                    ScenarioCode = "SCN_RAMEN_01",
                    TargetVocabularies = new List<TargetVocabulary>
                    {
                        new TargetVocabulary { Word = "ラーメン", Reading = "らーめん", Meaning = "Mì Ramen" },
                        new TargetVocabulary { Word = "水", Reading = "みず", Meaning = "Nước lọc" },
                        new TargetVocabulary { Word = "いくら", Reading = "いくら", Meaning = "Bao nhiêu tiền" },
                        new TargetVocabulary { Word = "会計", Reading = "かいけい", Meaning = "Tính tiền / Thanh toán" },
                        new TargetVocabulary { Word = "固さ", Reading = "かたさ", Meaning = "Độ cứng / dai của mì" },
                        new TargetVocabulary { Word = "濃さ", Reading = "こさ", Meaning = "Độ đậm đà của nước dùng" },
                        new TargetVocabulary { Word = "アレルギー", Reading = "あれるぎー", Meaning = "Dị ứng" }
                    },
                    TargetGrammars = new List<TargetGrammar>
                    {
                        new TargetGrammar { Pattern = "～をお願いします", Meaning = "Cho tôi xin / Cho tôi gọi...", ExampleSentence = "豚骨ラーメンをお願いします。" },
                        new TargetGrammar { Pattern = "～はいくらですか", Meaning = "...bao nhiêu tiền?", ExampleSentence = "ラーメンはいくらですか。" },
                        new TargetGrammar { Pattern = "～にしてもらえますか", Meaning = "Bạn có thể làm/chỉnh thành... cho tôi được không?", ExampleSentence = "麺をかためてもらえますか。" }
                    },
                    LevelConfigurations = new List<ScenarioLevelConfiguration>
                    {
                        // N5 Level
                        new ScenarioLevelConfiguration
                        {
                            JLPTLevel = "N5",
                            Title = "Gọi món Ramen N5 - Đặt món đơn giản",
                            Description = "Chào hỏi và gọi bát mì Tonkotsu Ramen cơ bản.",
                            AiPersona = "Nhân viên quán mì - 店員",
                            CreditCost = 5,
                            Status = "Published",
                            Missions = new List<Mission>
                            {
                                new Mission
                                {
                                    Content = "Chào nhân viên và gọi 1 bát Tonkotsu Ramen",
                                    Order = 1,
                                    CompletionCriteriaJson = CreateCriteriaJson(
                                        "Order Tonkotsu Ramen",
                                        "1 bowl of Tonkotsu Ramen",
                                        "Learner greets the staff politely in Japanese.",
                                        "Learner explicitly asks for 1 bowl of Tonkotsu Ramen."
                                    )
                                },
                                new Mission
                                {
                                    Content = "Hỏi giá tiền của bát Ramen",
                                    Order = 2,
                                    CompletionCriteriaJson = CreateCriteriaJson(
                                        "Ask for price",
                                        "Ramen price",
                                        "Learner asks how much the ramen costs using N5 grammar."
                                    )
                                },
                                new Mission
                                {
                                    Content = "Cảm ơn và chào tạm biệt khi ra về",
                                    Order = 3,
                                    CompletionCriteriaJson = CreateCriteriaJson(
                                        "Say thank you and goodbye",
                                        "Staff member",
                                        "Learner says thank you (Gochisousama / Arigatou) and goodbye."
                                    )
                                }
                            }
                        },
                        // N4 Level
                        new ScenarioLevelConfiguration
                        {
                            JLPTLevel = "N4",
                            Title = "Gọi món Ramen N4 - Tùy chỉnh độ dai & nước dùng",
                            Description = "Giao tiếp tùy chỉnh mì sợi cứng, nước dùng đậm và thêm topping.",
                            AiPersona = "Chủ cửa hàng - 店長",
                            CreditCost = 5,
                            Status = "Published",
                            Missions = new List<Mission>
                            {
                                new Mission
                                {
                                    Content = "Yêu cầu mì sợi cứng và nước dùng đậm đà",
                                    Order = 1,
                                    CompletionCriteriaJson = CreateCriteriaJson(
                                        "Customize noodle hardness and broth richness",
                                        "Firm noodles and rich soup",
                                        "Learner specifies hard noodles (Katame).",
                                        "Learner specifies rich broth (Koime)."
                                    )
                                },
                                new Mission
                                {
                                    Content = "Thêm topping trứng lòng đào (味玉)",
                                    Order = 2,
                                    CompletionCriteriaJson = CreateCriteriaJson(
                                        "Order extra topping",
                                        "Soft-boiled egg (Ajitama)",
                                        "Learner asks to add Ajitama topping."
                                    )
                                },
                                new Mission
                                {
                                    Content = "Hỏi xem quán có thanh toán bằng thẻ hay không",
                                    Order = 3,
                                    CompletionCriteriaJson = CreateCriteriaJson(
                                        "Inquire payment method",
                                        "Credit card or electronic payment",
                                        "Learner asks if card/e-money payment is supported."
                                    )
                                }
                            }
                        },
                        // N3 Level
                        new ScenarioLevelConfiguration
                        {
                            JLPTLevel = "N3",
                            Title = "Gọi món Ramen N3 - Yêu cầu đặc biệt & Dị ứng",
                            Description = "Xử lý tình huống dị ứng thực phẩm và yêu cầu thay đổi nguyên liệu.",
                            AiPersona = "Quản lý nhà hàng - 店長",
                            CreditCost = 5,
                            Status = "Published",
                            Missions = new List<Mission>
                            {
                                new Mission
                                {
                                    Content = "Giải thích dị ứng hải sản và hỏi thành phần nước dùng",
                                    Order = 1,
                                    CompletionCriteriaJson = CreateCriteriaJson(
                                        "Explain allergy and ask ingredients",
                                        "Seafood allergy & soup broth ingredients",
                                        "Learner clearly explains seafood allergy in Japanese.",
                                        "Learner asks if soup broth contains seafood."
                                    )
                                },
                                new Mission
                                {
                                    Content = "Đề nghị đổi nước dùng sang chanh đậu phụ hoặc rau củ",
                                    Order = 2,
                                    CompletionCriteriaJson = CreateCriteriaJson(
                                        "Request ingredient substitution",
                                        "Vegetable or tofu broth alternative",
                                        "Learner requests changing soup broth to vegetable/tofu option politely."
                                    )
                                },
                                new Mission
                                {
                                    Content = "Đánh giá chất lượng món ăn và khen ngợi",
                                    Order = 3,
                                    CompletionCriteriaJson = CreateCriteriaJson(
                                        "Express gratitude and praise meal",
                                        "Restaurant manager & food quality",
                                        "Learner compliments food quality using polite Keigo."
                                    )
                                }
                            }
                        }
                    }
                },
                new Scenario
                {
                    Title = "Phỏng vấn xin việc làm thêm (Baito)",
                    Description = "Luyện tập phỏng vấn xin việc làm thêm tại cửa hàng tiện lợi hoặc quán ăn tại Nhật Bản.",
                    Thumbnail = "https://images.unsplash.com/photo-1521791136064-7986c2920216",
                    IsActive = true,
                    ScenarioCode = "SCN_BAITO_01",
                    TargetVocabularies = new List<TargetVocabulary>
                    {
                        new TargetVocabulary { Word = "自己紹介", Reading = "じこしょうかい", Meaning = "Giới thiệu bản thân" },
                        new TargetVocabulary { Word = "アルバイト", Reading = "あるばいと", Meaning = "Việc làm thêm" },
                        new TargetVocabulary { Word = "志望動機", Reading = "しぼうどうき", Meaning = "Lý do ứng tuyển" },
                        new TargetVocabulary { Word = "通勤", Reading = "つうきん", Meaning = "Đi làm (di chuyển)" },
                        new TargetVocabulary { Word = "接客", Reading = "せっきゃく", Meaning = "Phục vụ khách hàng" }
                    },
                    TargetGrammars = new List<TargetGrammar>
                    {
                        new TargetGrammar { Pattern = "～と申します", Meaning = "Tôi tên là...", ExampleSentence = "グエンと申します。" },
                        new TargetGrammar { Pattern = "～たことがあります", Meaning = "Đã từng làm...", ExampleSentence = "レジの経験があります。" },
                        new TargetGrammar { Pattern = "～ように心がけております", Meaning = "Tôi luôn nỗ lực...", ExampleSentence = "丁寧な接客を心がけております。" }
                    },
                    LevelConfigurations = new List<ScenarioLevelConfiguration>
                    {
                        // N5 Level
                        new ScenarioLevelConfiguration
                        {
                            JLPTLevel = "N5",
                            Title = "Phỏng vấn Baito N5 - Giới thiệu bản thân",
                            Description = "Trả lời các câu hỏi phỏng vấn cơ bản về tên, quốc tịch, thời gian làm việc.",
                            AiPersona = "Người phỏng vấn - 面接官",
                            CreditCost = 5,
                            Status = "Published",
                            Missions = new List<Mission>
                            {
                                new Mission
                                {
                                    Content = "Giới thiệu bản thân cơ bản (Tên, Quốc tịch)",
                                    Order = 1,
                                    CompletionCriteriaJson = CreateCriteriaJson(
                                        "Self introduction",
                                        "Name and nationality",
                                        "Learner states full name in Japanese.",
                                        "Learner states nationality."
                                    )
                                },
                                new Mission
                                {
                                    Content = "Trả lời số ngày trong tuần bạn có thể đi làm",
                                    Order = 2,
                                    CompletionCriteriaJson = CreateCriteriaJson(
                                        "State available work days",
                                        "Weekly work schedule",
                                        "Learner specifies available days of the week."
                                    )
                                },
                                new Mission
                                {
                                    Content = "Thể hiện tinh thần muốn cố gắng làm việc",
                                    Order = 3,
                                    CompletionCriteriaJson = CreateCriteriaJson(
                                        "Express motivation",
                                        "Work commitment",
                                        "Learner states readiness to work hard (Ganbarimasu)."
                                    )
                                }
                            }
                        },
                        // N4 Level
                        new ScenarioLevelConfiguration
                        {
                            JLPTLevel = "N4",
                            Title = "Phỏng vấn Baito N4 - Lý do ứng tuyển & Đi lại",
                            Description = "Trình bày lý do chọn công việc và phương tiện di chuyển.",
                            AiPersona = "Chủ cửa hàng tiện lợi - 店長",
                            CreditCost = 5,
                            Status = "Published",
                            Missions = new List<Mission>
                            {
                                new Mission
                                {
                                    Content = "Nêu lý do ứng tuyển (志望動機)",
                                    Order = 1,
                                    CompletionCriteriaJson = CreateCriteriaJson(
                                        "Explain application motivation",
                                        "Job application reason",
                                        "Learner explains why they chose this store."
                                    )
                                },
                                new Mission
                                {
                                    Content = "Trình bày phương tiện di chuyển và thời gian đi từ nhà",
                                    Order = 2,
                                    CompletionCriteriaJson = CreateCriteriaJson(
                                        "Explain commute method and duration",
                                        "Commute details",
                                        "Learner specifies transportation method.",
                                        "Learner specifies travel duration from home."
                                    )
                                },
                                new Mission
                                {
                                    Content = "Hỏi về thời gian nhận kết quả phỏng vấn",
                                    Order = 3,
                                    CompletionCriteriaJson = CreateCriteriaJson(
                                        "Ask interview result timeline",
                                        "Result notification date",
                                        "Learner asks when interview results will be announced."
                                    )
                                }
                            }
                        },
                        // N3 Level
                        new ScenarioLevelConfiguration
                        {
                            JLPTLevel = "N3",
                            Title = "Phỏng vấn Baito N3 - Xử lý tình huống & Kính ngữ",
                            Description = "Phỏng vấn nâng cao về xử lý phàn nàn của khách hàng và ca làm việc.",
                            AiPersona = "Quản lý nhân sự - 採用担当者",
                            CreditCost = 5,
                            Status = "Published",
                            Missions = new List<Mission>
                            {
                                new Mission
                                {
                                    Content = "Giải thích cách xử lý khi khách hàng phàn nàn",
                                    Order = 1,
                                    CompletionCriteriaJson = CreateCriteriaJson(
                                        "Explain customer complaint handling",
                                        "Customer complaint procedure",
                                        "Learner describes steps to handle customer complaints professionally."
                                    )
                                },
                                new Mission
                                {
                                    Content = "Thỏa thuận về việc làm ca đêm và ngày lễ Tết",
                                    Order = 2,
                                    CompletionCriteriaJson = CreateCriteriaJson(
                                        "Negotiate shift availability",
                                        "Night shifts and holiday shifts",
                                        "Learner discusses availability for night/holiday shifts."
                                    )
                                },
                                new Mission
                                {
                                    Content = "Sử dụng khiêm nhường ngữ và tôn kính ngữ phù hợp",
                                    Order = 3,
                                    CompletionCriteriaJson = CreateCriteriaJson(
                                        "Use formal Keigo language",
                                        "Interviewer communication",
                                        "Learner uses polite humble/honorific grammar correctly."
                                    )
                                }
                            }
                        }
                    }
                }
            };
        }
    }
}
