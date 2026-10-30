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
                            TargetVocabularies = new List<TargetVocabulary>
                            {
                                new TargetVocabulary { Word = "ラーメン", Reading = "らーめん", Meaning = "Mì Ramen" },
                                new TargetVocabulary { Word = "水", Reading = "みず", Meaning = "Nước lọc" }
                            },
                            TargetGrammars = new List<TargetGrammar>
                            {
                                new TargetGrammar { Pattern = "～をお願いします", Meaning = "Cho tôi xin / Cho tôi gọi...", ExampleSentence = "豚骨ラーメンをお願いします。" }
                            },
                            Missions = new List<Mission>
                            {
                                new Mission
                                {
                                    Content = "Gọi 1 bát Tonkotsu Ramen",
                                    Order = 1,
                                    CompletionCriteriaJson = CreateCriteriaJson(
                                        "Order Tonkotsu Ramen",
                                        "1 bowl of Tonkotsu Ramen",
                                        "Learner asks for 1 bowl of Tonkotsu Ramen politely."
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
                                    Content = "Nói lời cảm ơn khi ra về",
                                    Order = 3,
                                    CompletionCriteriaJson = CreateCriteriaJson(
                                        "Express gratitude when leaving",
                                        "Staff member",
                                        "Learner says Gochisousama or Arigatou gozaimashita."
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
                            TargetVocabularies = new List<TargetVocabulary>
                            {
                                new TargetVocabulary { Word = "いくら", Reading = "いくら", Meaning = "Bao nhiêu tiền" },
                                new TargetVocabulary { Word = "固さ", Reading = "かたさ", Meaning = "Độ cứng / dai của mì" },
                                new TargetVocabulary { Word = "濃さ", Reading = "こさ", Meaning = "Độ đậm đà của nước dùng" }
                            },
                            TargetGrammars = new List<TargetGrammar>
                            {
                                new TargetGrammar { Pattern = "～はいくらですか", Meaning = "...bao nhiêu tiền?", ExampleSentence = "ラーメンはいくらですか。" },
                                new TargetGrammar { Pattern = "～にしてもらえますか", Meaning = "Bạn có thể làm/chỉnh thành... cho tôi được không?", ExampleSentence = "麺をかためてもらえますか。" }
                            },
                            Missions = new List<Mission>
                            {
                                new Mission
                                {
                                    Content = "Yêu cầu mì sợi cứng hoặc nước dùng đậm đà",
                                    Order = 1,
                                    CompletionCriteriaJson = CreateCriteriaJson(
                                        "Customize noodle hardness or broth richness",
                                        "Firm noodles or rich soup",
                                        "Learner specifies hard noodles (Katame) OR rich broth (Koime)."
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
                            TargetVocabularies = new List<TargetVocabulary>
                            {
                                new TargetVocabulary { Word = "会計", Reading = "かいけい", Meaning = "Tính tiền / Thanh toán" },
                                new TargetVocabulary { Word = "アレルギー", Reading = "あれるぎー", Meaning = "Dị ứng" }
                            },
                            TargetGrammars = new List<TargetGrammar>
                            {
                                new TargetGrammar { Pattern = "～はいくらですか", Meaning = "...bao nhiêu tiền?", ExampleSentence = "ラーメンはいくらですか。" },
                                new TargetGrammar { Pattern = "～にしてもらえますか", Meaning = "Bạn có thể làm/chỉnh thành... cho tôi được không?", ExampleSentence = "麺をかためてもらえますか。" }
                            },
                            Missions = new List<Mission>
                            {
                                new Mission
                                {
                                    Content = "Giải thích tình trạng dị ứng hải sản",
                                    Order = 1,
                                    CompletionCriteriaJson = CreateCriteriaJson(
                                        "Explain seafood allergy",
                                        "Seafood allergy",
                                        "Learner clearly explains seafood allergy in Japanese."
                                    )
                                },
                                new Mission
                                {
                                    Content = "Hỏi thành phần nước dùng",
                                    Order = 2,
                                    CompletionCriteriaJson = CreateCriteriaJson(
                                        "Ask soup ingredients",
                                        "Soup broth ingredients",
                                        "Learner asks if the soup contains seafood or fish broth."
                                    )
                                },
                                new Mission
                                {
                                    Content = "Đề nghị đổi nước dùng sang đậu phụ hoặc rau củ",
                                    Order = 3,
                                    CompletionCriteriaJson = CreateCriteriaJson(
                                        "Request ingredient substitution",
                                        "Vegetable or tofu broth alternative",
                                        "Learner requests changing soup broth to vegetable/tofu option politely."
                                    )
                                },
                                new Mission
                                {
                                    Content = "Đánh giá chất lượng món ăn và khen ngợi",
                                    Order = 4,
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
                            TargetVocabularies = new List<TargetVocabulary>
                            {
                                new TargetVocabulary { Word = "自己紹介", Reading = "じこしょうかい", Meaning = "Giới thiệu bản thân" },
                                new TargetVocabulary { Word = "アルバイト", Reading = "あるばいと", Meaning = "Việc làm thêm" }
                            },
                            TargetGrammars = new List<TargetGrammar>
                            {
                                new TargetGrammar { Pattern = "～と申します", Meaning = "Tôi tên là...", ExampleSentence = "グエンと申します。" }
                            },
                            Missions = new List<Mission>
                            {
                                new Mission
                                {
                                    Content = "Giới thiệu bản thân cơ bản (Tên hoặc Quốc tịch)",
                                    Order = 1,
                                    CompletionCriteriaJson = CreateCriteriaJson(
                                        "Self introduction",
                                        "Name or nationality",
                                        "Learner states either their name or their nationality politely in Japanese."
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
                            TargetVocabularies = new List<TargetVocabulary>
                            {
                                new TargetVocabulary { Word = "志望動機", Reading = "しぼうどうき", Meaning = "Lý do ứng tuyển" },
                                new TargetVocabulary { Word = "通勤", Reading = "つうきん", Meaning = "Đi làm (di chuyển)" }
                            },
                            TargetGrammars = new List<TargetGrammar>
                            {
                                new TargetGrammar { Pattern = "～たことがあります", Meaning = "Đã từng làm...", ExampleSentence = "レジの経験があります。" }
                            },
                            Missions = new List<Mission>
                            {
                                new Mission
                                {
                                    Content = "Nêu lý do ứng tuyển",
                                    Order = 1,
                                    CompletionCriteriaJson = CreateCriteriaJson(
                                        "Explain application motivation",
                                        "Job application reason",
                                        "Learner explains why they chose this store."
                                    )
                                },
                                new Mission
                                {
                                    Content = "Trình bày phương tiện di chuyển hoặc thời gian đi lại",
                                    Order = 2,
                                    CompletionCriteriaJson = CreateCriteriaJson(
                                        "Explain commute method or duration",
                                        "Commute method or duration",
                                        "Learner specifies either transportation method or travel duration from home."
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
                            TargetVocabularies = new List<TargetVocabulary>
                            {
                                new TargetVocabulary { Word = "接客", Reading = "せっきゃく", Meaning = "Phục vụ khách hàng" }
                            },
                            TargetGrammars = new List<TargetGrammar>
                            {
                                new TargetGrammar { Pattern = "～ように心がけております", Meaning = "Tôi luôn nỗ lực...", ExampleSentence = "丁寧な接客を心がけております。" }
                            },
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
                                    Content = "Thỏa thuận về việc làm ca đêm hoặc ngày lễ Tết",
                                    Order = 2,
                                    CompletionCriteriaJson = CreateCriteriaJson(
                                        "Negotiate shift availability",
                                        "Night shifts or holiday shifts",
                                        "Learner discusses availability for night shifts OR holiday/weekend shifts."
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
                },
                new Scenario
                {
                    Title = "Hỏi đường & mua vé tàu tại ga Shinjuku",
                    Description = "Thực hành giao tiếp tiếng Nhật khi hỏi đường đi tàu, tìm cửa soát vé và mua vé tàu điện tại ga Shinjuku sầm uất.",
                    Thumbnail = "https://images.unsplash.com/photo-1503899036084-c55cdd92da26",
                    IsActive = true,
                    ScenarioCode = "SCN_TRANSIT_01",
                    LevelConfigurations = new List<ScenarioLevelConfiguration>
                    {
                        // N5 Level
                        new ScenarioLevelConfiguration
                        {
                            JLPTLevel = "N5",
                            Title = "Hỏi đường đi tàu N5 - Tìm cửa soát vé",
                            Description = "Hỏi nhân viên nhà ga cửa soát vé tuyến Yamanote và hỏi giá vé đến Shibuya.",
                            AiPersona = "Nhân viên ga Shinjuku - 駅員",
                            CreditCost = 5,
                            Status = "Published",
                            TargetVocabularies = new List<TargetVocabulary>
                            {
                                new TargetVocabulary { Word = "駅", Reading = "えき", Meaning = "Nhà ga" },
                                new TargetVocabulary { Word = "切符", Reading = "きっぷ", Meaning = "Vé tàu" },
                                new TargetVocabulary { Word = "山手線", Reading = "やまのてせん", Meaning = "Tuyến tàu Yamanote" }
                            },
                            TargetGrammars = new List<TargetGrammar>
                            {
                                new TargetGrammar { Pattern = "～はどこですか", Meaning = "...ở đâu vậy?", ExampleSentence = "山手線の乗り場はどこですか。" },
                                new TargetGrammar { Pattern = "～までいくらですか", Meaning = "Đến... bao nhiêu tiền?", ExampleSentence = "渋谷までいくらですか。" }
                            },
                            Missions = new List<Mission>
                            {
                                new Mission
                                {
                                    Content = "Chào hỏi và hỏi lối vào tuyến tàu Yamanote",
                                    Order = 1,
                                    CompletionCriteriaJson = CreateCriteriaJson(
                                        "Ask for Yamanote line entrance",
                                        "Yamanote line gate or platform",
                                        "Learner greets and asks for Yamanote line gate politely in Japanese."
                                    )
                                },
                                new Mission
                                {
                                    Content = "Hỏi giá vé đi đến ga Shibuya",
                                    Order = 2,
                                    CompletionCriteriaJson = CreateCriteriaJson(
                                        "Inquire ticket fare",
                                        "Shibuya ticket price",
                                        "Learner asks how much the ticket to Shibuya costs."
                                    )
                                },
                                new Mission
                                {
                                    Content = "Cảm ơn nhân viên nhà ga trước khi di chuyển",
                                    Order = 3,
                                    CompletionCriteriaJson = CreateCriteriaJson(
                                        "Express gratitude to station staff",
                                        "Station officer",
                                        "Learner politely thanks the station officer."
                                    )
                                }
                            }
                        },
                        // N4 Level
                        new ScenarioLevelConfiguration
                        {
                            JLPTLevel = "N4",
                            Title = "Mua vé & Đổi tuyến N4 - Chuyển sang tuyến Chuo Line",
                            Description = "Hỏi cách đổi tàu nhanh sang tuyến Chuo Line và mua thẻ IC Suica nạp tiền.",
                            AiPersona = "Nhân viên trung tâm thông tin ga - 案内係",
                            CreditCost = 5,
                            Status = "Published",
                            TargetVocabularies = new List<TargetVocabulary>
                            {
                                new TargetVocabulary { Word = "乗り換え", Reading = "のりかえ", Meaning = "Đổi tàu / Chuyển tuyến" },
                                new TargetVocabulary { Word = "快速", Reading = "かいそく", Meaning = "Tàu nhanh / Tốc hành" },
                                new TargetVocabulary { Word = "チャージ", Reading = "ちゃーじ", Meaning = "Nạp tiền vào thẻ IC" }
                            },
                            TargetGrammars = new List<TargetGrammar>
                            {
                                new TargetGrammar { Pattern = "～はどうやって行けばいいですか", Meaning = "Đi đến... bằng cách nào thì tốt?", ExampleSentence = "東京駅へはどうやって行けばいいですか。" },
                                new TargetGrammar { Pattern = "～方（かた）", Meaning = "Cách thức làm gì đó", ExampleSentence = "Suicaのチャージの仕方を教えてください。" }
                            },
                            Missions = new List<Mission>
                            {
                                new Mission
                                {
                                    Content = "Hỏi cách đổi tàu sang tuyến Chuo Line tàu nhanh",
                                    Order = 1,
                                    CompletionCriteriaJson = CreateCriteriaJson(
                                        "Transfer to Chuo Rapid line",
                                        "Chuo rapid line platform",
                                        "Learner inquires how to transfer to the Chuo Rapid train."
                                    )
                                },
                                new Mission
                                {
                                    Content = "Hỏi cách mua hoặc nạp tiền vào thẻ Suica/Pasmo",
                                    Order = 2,
                                    CompletionCriteriaJson = CreateCriteriaJson(
                                        "Inquire IC card purchase or recharge",
                                        "Suica IC card recharge",
                                        "Learner asks how to buy or recharge an IC transit card."
                                    )
                                },
                                new Mission
                                {
                                    Content = "Xác nhận số ke ga (sân ga) xuất phát",
                                    Order = 3,
                                    CompletionCriteriaJson = CreateCriteriaJson(
                                        "Confirm platform number",
                                        "Train departure platform",
                                        "Learner confirms which platform number the train departs from."
                                    )
                                }
                            }
                        },
                        // N3 Level
                        new ScenarioLevelConfiguration
                        {
                            JLPTLevel = "N3",
                            Title = "Xử lý sự cố vé tàu N3 - Đổi vé Shinkansen & Hành lý thất lạc",
                            Description = "Đổi giờ tàu Shinkansen và báo quên túi xách trên toa tàu với nhân viên phụ trách.",
                            AiPersona = "Trưởng ga Shinjuku - 駅長",
                            CreditCost = 5,
                            Status = "Published",
                            TargetVocabularies = new List<TargetVocabulary>
                            {
                                new TargetVocabulary { Word = "指定席", Reading = "していせき", Meaning = "Ghế đặt trước" },
                                new TargetVocabulary { Word = "忘れ物", Reading = "わすれもの", Meaning = "Đồ bỏ quên / Thất lạc" },
                                new TargetVocabulary { Word = "払い戻し", Reading = "はらいもどし", Meaning = "Hoàn tiền vé" }
                            },
                            TargetGrammars = new List<TargetGrammar>
                            {
                                new TargetGrammar { Pattern = "～ていただけないでしょうか", Meaning = "Xin vui lòng... cho tôi được không?", ExampleSentence = "発車時刻を変更していただけないでしょうか。" },
                                new TargetGrammar { Pattern = "～てしまったのですが", Meaning = "Tôi lỡ... mất rồi", ExampleSentence = "網棚の上に鞄を忘れてしまったのですが。" }
                            },
                            Missions = new List<Mission>
                            {
                                new Mission
                                {
                                    Content = "Yêu cầu đổi giờ xuất phát cho vé ghế chỉ định Shinkansen",
                                    Order = 1,
                                    CompletionCriteriaJson = CreateCriteriaJson(
                                        "Change Shinkansen ticket departure time",
                                        "Reserved seat ticket",
                                        "Learner requests changing Shinkansen departure time politely."
                                    )
                                },
                                new Mission
                                {
                                    Content = "Khai báo thông tin đồ đạc bỏ quên trên tàu",
                                    Order = 2,
                                    CompletionCriteriaJson = CreateCriteriaJson(
                                        "Report lost property on train",
                                        "Lost baggage details",
                                        "Learner clearly describes lost property and seat location."
                                    )
                                },
                                new Mission
                                {
                                    Content = "Sử dụng kính ngữ chuẩn mực để cảm ơn sự hỗ trợ của nhà ga",
                                    Order = 3,
                                    CompletionCriteriaJson = CreateCriteriaJson(
                                        "Express formal gratitude",
                                        "Station master assistance",
                                        "Learner uses polite Keigo to express gratitude for staff assistance."
                                    )
                                }
                            }
                        }
                    }
                },
                new Scenario
                {
                    Title = "Mua sắm & thanh toán tại cửa hàng tiện lợi 7-Eleven",
                    Description = "Thực hành giao tiếp tiếng Nhật khi mua cơm hộp Bento, hâm nóng đồ ăn, từ chối túi ni lông và thanh toán tại Konbini.",
                    Thumbnail = "https://images.unsplash.com/photo-1542838132-92c53300491e",
                    IsActive = true,
                    ScenarioCode = "SCN_KONBINI_01",
                    LevelConfigurations = new List<ScenarioLevelConfiguration>
                    {
                        // N5 Level
                        new ScenarioLevelConfiguration
                        {
                            JLPTLevel = "N5",
                            Title = "Mua đồ Konbini N5 - Hâm nóng cơm hộp & Thanh toán",
                            Description = "Mua một hộp cơm bento, yêu cầu hâm nóng và thanh toán tiền mặt.",
                            AiPersona = "Nhân viên thu ngân Konbini - 店員",
                            CreditCost = 5,
                            Status = "Published",
                            TargetVocabularies = new List<TargetVocabulary>
                            {
                                new TargetVocabulary { Word = "お弁当", Reading = "おべんとう", Meaning = "Cơm hộp Bento" },
                                new TargetVocabulary { Word = "温め", Reading = "あたため", Meaning = "Hâm nóng" },
                                new TargetVocabulary { Word = "レジ袋", Reading = "れじぶくろ", Meaning = "Túi ni lông" }
                            },
                            TargetGrammars = new List<TargetGrammar>
                            {
                                new TargetGrammar { Pattern = "～を温めてください", Meaning = "Xin vui lòng hâm nóng...", ExampleSentence = "お弁当を温めてください。" },
                                new TargetGrammar { Pattern = "～は結構です", Meaning = "...thì tôi không cần / xin thôi", ExampleSentence = "レジ袋は結構です。" }
                            },
                            Missions = new List<Mission>
                            {
                                new Mission
                                {
                                    Content = "Chọn mua cơm hộp và nhờ nhân viên hâm nóng",
                                    Order = 1,
                                    CompletionCriteriaJson = CreateCriteriaJson(
                                        "Ask to microwave bento",
                                        "Warm up bento meal",
                                        "Learner asks the staff member to warm up the bento."
                                    )
                                },
                                new Mission
                                {
                                    Content = "Từ chối lấy túi ni lông một cách lịch sự",
                                    Order = 2,
                                    CompletionCriteriaJson = CreateCriteriaJson(
                                        "Decline plastic bag politely",
                                        "Plastic bag refusal",
                                        "Learner politely declines taking a plastic bag."
                                    )
                                },
                                new Mission
                                {
                                    Content = "Hỏi tổng số tiền và nói lời cảm ơn",
                                    Order = 3,
                                    CompletionCriteriaJson = CreateCriteriaJson(
                                        "Confirm payment amount and thank",
                                        "Cashier checkout",
                                        "Learner asks total amount and thanks the cashier."
                                    )
                                }
                            }
                        },
                        // N4 Level
                        new ScenarioLevelConfiguration
                        {
                            JLPTLevel = "N4",
                            Title = "Thanh toán điện tử N4 - Sử dụng ví điện tử & Tích điểm",
                            Description = "Thanh toán bằng PayPay, hỏi về thẻ tích điểm và xin thêm thìa nĩa.",
                            AiPersona = "Trưởng ca cửa hàng tiện lợi - バイトリーダー",
                            CreditCost = 5,
                            Status = "Published",
                            TargetVocabularies = new List<TargetVocabulary>
                            {
                                new TargetVocabulary { Word = "電子マネー", Reading = "でんしまねー", Meaning = "Tiền điện tử / Thanh toán không tiền mặt" },
                                new TargetVocabulary { Word = "ポイントカード", Reading = "ぽいんとかーど", Meaning = "Thẻ tích điểm" },
                                new TargetVocabulary { Word = "スプーン", Reading = "すぷーん", Meaning = "Chiếc thìa / muỗng" }
                            },
                            TargetGrammars = new List<TargetGrammar>
                            {
                                new TargetGrammar { Pattern = "～で支払えますか", Meaning = "Có thể thanh toán bằng... không?", ExampleSentence = "PayPayで支払えますか。" },
                                new TargetGrammar { Pattern = "～をつけてもらえますか", Meaning = "Có thể cho tôi kèm thêm... được không?", ExampleSentence = "スプーンをひとつ付けてもらえますか。" }
                            },
                            Missions = new List<Mission>
                            {
                                new Mission
                                {
                                    Content = "Hỏi và xác nhận phương thức thanh toán bằng mã QR / ví điện tử",
                                    Order = 1,
                                    CompletionCriteriaJson = CreateCriteriaJson(
                                        "Pay with QR code or e-money",
                                        "PayPay or e-money payment",
                                        "Learner asks to pay using electronic money or QR payment."
                                    )
                                },
                                new Mission
                                {
                                    Content = "Thông báo có hoặc không có thẻ tích điểm (Point Card)",
                                    Order = 2,
                                    CompletionCriteriaJson = CreateCriteriaJson(
                                        "State point card status",
                                        "Point card inquiry",
                                        "Learner clarifies point card status clearly."
                                    )
                                },
                                new Mission
                                {
                                    Content = "Xin thêm thìa hoặc đũa ăn kèm",
                                    Order = 3,
                                    CompletionCriteriaJson = CreateCriteriaJson(
                                        "Request cutlery spoon or chopsticks",
                                        "Cutlery utensil request",
                                        "Learner politely asks for an extra spoon or chopsticks."
                                    )
                                }
                            }
                        },
                        // N3 Level
                        new ScenarioLevelConfiguration
                        {
                            JLPTLevel = "N3",
                            Title = "Dịch vụ tiện ích N3 - Gửi bưu kiện & Xuất vé",
                            Description = "Sử dụng dịch vụ chuyển phát hành lý tại quầy Konbini và in vé đặt trước.",
                            AiPersona = "Chủ cửa hàng nhượng quyền - オーナー",
                            CreditCost = 5,
                            Status = "Published",
                            TargetVocabularies = new List<TargetVocabulary>
                            {
                                new TargetVocabulary { Word = "宅配便", Reading = "たくはいびん", Meaning = "Chuyển phát bưu kiện tận nhà" },
                                new TargetVocabulary { Word = "伝票", Reading = "でんぴょう", Meaning = "Phiếu gửi hàng / Hóa đơn" },
                                new TargetVocabulary { Word = "発券", Reading = "はっけん", Meaning = "Xuất vé / In vé đặt trước" }
                            },
                            TargetGrammars = new List<TargetGrammar>
                            {
                                new TargetGrammar { Pattern = "～の手続きをお願いしたいのですが", Meaning = "Tôi muốn làm thủ tục...", ExampleSentence = "荷物の発送手続きをお願いしたいのですが。" },
                                new TargetGrammar { Pattern = "～に届けていただくことは可能でしょうか", Meaning = "Có thể chuyển đến... được không ạ?", ExampleSentence = "明日の午前に届けていただくことは可能でしょうか。" }
                            },
                            Missions = new List<Mission>
                            {
                                new Mission
                                {
                                    Content = "Yêu cầu gửi gói hàng bưu phẩm đến khách sạn hoặc sân bay",
                                    Order = 1,
                                    CompletionCriteriaJson = CreateCriteriaJson(
                                        "Request parcel shipment",
                                        "Luggage delivery service",
                                        "Learner asks to ship luggage or a parcel politely."
                                    )
                                },
                                new Mission
                                {
                                    Content = "Điền và xác nhận khung giờ nhận hàng mong muốn",
                                    Order = 2,
                                    CompletionCriteriaJson = CreateCriteriaJson(
                                        "Specify preferred delivery time",
                                        "Delivery time slot",
                                        "Learner specifies their preferred delivery time window."
                                    )
                                },
                                new Mission
                                {
                                    Content = "Hỏi cách sử dụng máy in đa năng để xuất vé",
                                    Order = 3,
                                    CompletionCriteriaJson = CreateCriteriaJson(
                                        "Inquire ticket printing machine",
                                        "Multicopy machine ticketing",
                                        "Learner asks how to operate the ticket printing terminal."
                                    )
                                }
                            }
                        }
                    }
                },
                new Scenario
                {
                    Title = "Phỏng vấn xin việc & chào hỏi công sở",
                    Description = "Thực hành chào hỏi ngày đầu đi làm, giới thiệu bản thân trước tập thể và đối thoại công việc chuẩn văn hóa Nhật Bản.",
                    Thumbnail = "https://images.unsplash.com/photo-1497366216548-37526070297c",
                    IsActive = true,
                    ScenarioCode = "SCN_OFFICE_01",
                    LevelConfigurations = new List<ScenarioLevelConfiguration>
                    {
                        // N5 Level
                        new ScenarioLevelConfiguration
                        {
                            JLPTLevel = "N5",
                            Title = "Chào hỏi công sở N5 - Giới thiệu ngày đầu nhận việc",
                            Description = "Chào hỏi cấp trên và đồng nghiệp, tự giới thiệu đơn giản ngày đầu vào công ty.",
                            AiPersona = "Đồng nghiệp hướng dẫn - 先輩社員",
                            CreditCost = 5,
                            Status = "Published",
                            TargetVocabularies = new List<TargetVocabulary>
                            {
                                new TargetVocabulary { Word = "新人", Reading = "しんじん", Meaning = "Nhân viên mới" },
                                new TargetVocabulary { Word = "部署", Reading = "ぶしょ", Meaning = "Phòng ban công tác" },
                                new TargetVocabulary { Word = "よろしくお願いします", Reading = "よろしくおねがいします", Meaning = "Rất mong được giúp đỡ" }
                            },
                            TargetGrammars = new List<TargetGrammar>
                            {
                                new TargetGrammar { Pattern = "～から参りました", Meaning = "Tôi đến từ...", ExampleSentence = "ベトナムから参りました。" },
                                new TargetGrammar { Pattern = "どうぞよろしくお願いします", Meaning = "Rất mong nhận được sự chỉ giáo", ExampleSentence = "本日よりどうぞよろしくお願いします。" }
                            },
                            Missions = new List<Mission>
                            {
                                new Mission
                                {
                                    Content = "Chào hỏi chuẩn mực khi bước vào văn phòng làm việc",
                                    Order = 1,
                                    CompletionCriteriaJson = CreateCriteriaJson(
                                        "Formal greeting at office entrance",
                                        "Colleagues and supervisor",
                                        "Learner greets office team with Ohayou gozaimasu or Shitsurei shimasu."
                                    )
                                },
                                new Mission
                                {
                                    Content = "Giới thiệu tên, xuất thân và phòng ban công tác",
                                    Order = 2,
                                    CompletionCriteriaJson = CreateCriteriaJson(
                                        "Self introduction in office",
                                        "Name and assigned department",
                                        "Learner introduces their name and assigned department."
                                    )
                                },
                                new Mission
                                {
                                    Content = "Nói lời chào kết thúc thể hiện tinh thần học hỏi cầu tiến",
                                    Order = 3,
                                    CompletionCriteriaJson = CreateCriteriaJson(
                                        "Closing greeting statement",
                                        "Work commitment",
                                        "Learner concludes with Douzo yoroshiku onegai itashimasu."
                                    )
                                }
                            }
                        },
                        // N4 Level
                        new ScenarioLevelConfiguration
                        {
                            JLPTLevel = "N4",
                            Title = "Giao tiếp công sở N4 - Báo cáo tiến độ (Horenso)",
                            Description = "Thực hành báo cáo kết quả công việc với cấp trên và xin phép xác nhận tài liệu.",
                            AiPersona = "Trưởng nhóm - チームリーダー",
                            CreditCost = 5,
                            Status = "Published",
                            TargetVocabularies = new List<TargetVocabulary>
                            {
                                new TargetVocabulary { Word = "進捗", Reading = "しんちょく", Meaning = "Tiến độ công việc" },
                                new TargetVocabulary { Word = "報告", Reading = "ほうこく", Meaning = "Báo cáo" },
                                new TargetVocabulary { Word = "確認", Reading = "かくにん", Meaning = "Xác nhận / Kiểm tra" }
                            },
                            TargetGrammars = new List<TargetGrammar>
                            {
                                new TargetGrammar { Pattern = "～についてご報告いたします", Meaning = "Tôi xin phép báo cáo về...", ExampleSentence = "本日の業務進捗についてご報告いたします。" },
                                new TargetGrammar { Pattern = "～てよろしいでしょうか", Meaning = "Tôi làm... có được không ạ?", ExampleSentence = "資料をご確認いただいてもよろしいでしょうか。" }
                            },
                            Missions = new List<Mission>
                            {
                                new Mission
                                {
                                    Content = "Mở đầu báo cáo công việc theo quy tắc Horenso",
                                    Order = 1,
                                    CompletionCriteriaJson = CreateCriteriaJson(
                                        "Initiate Horenso progress report",
                                        "Team leader attention",
                                        "Learner politely requests a moment to report progress."
                                    )
                                },
                                new Mission
                                {
                                    Content = "Báo cáo rõ ràng việc đã hoàn thành và việc còn tồn đọng",
                                    Order = 2,
                                    CompletionCriteriaJson = CreateCriteriaJson(
                                        "Report completed and pending tasks",
                                        "Work status update",
                                        "Learner outlines completed tasks and pending deliverables clearly."
                                    )
                                },
                                new Mission
                                {
                                    Content = "Xin phép cấp trên xem xét và góp ý cho bản tài liệu",
                                    Order = 3,
                                    CompletionCriteriaJson = CreateCriteriaJson(
                                        "Request document review",
                                        "Leader feedback on draft",
                                        "Learner asks supervisor to check document draft politely."
                                    )
                                }
                            }
                        },
                        // N3 Level
                        new ScenarioLevelConfiguration
                        {
                            JLPTLevel = "N3",
                            Title = "Giao dịch thương mại N3 - Tiếp đón khách hàng & Trao danh thiếp",
                            Description = "Đón tiếp đối tác quan trọng đến thăm công ty, trao đổi danh thiếp và dẫn vào phòng họp với Keigo cao cấp.",
                            AiPersona = "Khách hàng đối tác - 取引先担当者",
                            CreditCost = 5,
                            Status = "Published",
                            TargetVocabularies = new List<TargetVocabulary>
                            {
                                new TargetVocabulary { Word = "名刺", Reading = "めいし", Meaning = "Danh thiếp thương mại" },
                                new TargetVocabulary { Word = "応接室", Reading = "おうせつしつ", Meaning = "Phòng tiếp khách / Phòng họp" },
                                new TargetVocabulary { Word = "お目にかかる", Reading = "おめにかかる", Meaning = "Được diện kiến (khiêm nhường ngữ)" }
                            },
                            TargetGrammars = new List<TargetGrammar>
                            {
                                new TargetGrammar { Pattern = "お目にかかれて光栄に存じます", Meaning = "Thật vinh hạnh khi được diện kiến quý khách", ExampleSentence = "本日お目にかかれて光栄に存じます。" },
                                new TargetGrammar { Pattern = "～へご案内いたします", Meaning = "Tôi xin phép hướng dẫn quý khách đến...", ExampleSentence = "こちら側の応接室へご案内いたします。" }
                            },
                            Missions = new List<Mission>
                            {
                                new Mission
                                {
                                    Content = "Chào đón đối tác và xưng danh công ty theo nghi thức khiêm nhường ngữ",
                                    Order = 1,
                                    CompletionCriteriaJson = CreateCriteriaJson(
                                        "Welcome business partner",
                                        "Client greeting with Keigo",
                                        "Learner welcomes client and states company affiliation politely."
                                    )
                                },
                                new Mission
                                {
                                    Content = "Thực hiện nghi thức trao đổi danh thiếp Meishi-koukan trang trọng",
                                    Order = 2,
                                    CompletionCriteriaJson = CreateCriteriaJson(
                                        "Business card exchange etiquette",
                                        "Meishi koukan protocol",
                                        "Learner exchanges business card with proper etiquette phrases."
                                    )
                                },
                                new Mission
                                {
                                    Content = "Mời đối tác vào phòng tiếp khách và mời nước trà",
                                    Order = 3,
                                    CompletionCriteriaJson = CreateCriteriaJson(
                                        "Guide client to meeting room",
                                        "Meeting room guidance",
                                        "Learner guides the guest to the reception room and offers tea/seating."
                                    )
                                }
                            }
                        }
                    }
                },
                new Scenario
                {
                    Title = "Đặt cà phê & bánh ngọt tại quán cafe Harajuku",
                    Description = "Thực hành gọi món nước, chọn size, tùy chỉnh độ ngọt, chọn bánh kem và tìm chỗ ngồi tại quán cafe phong cách Harajuku.",
                    Thumbnail = "https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb",
                    IsActive = true,
                    ScenarioCode = "SCN_CAFE_01",
                    LevelConfigurations = new List<ScenarioLevelConfiguration>
                    {
                        // N5 Level
                        new ScenarioLevelConfiguration
                        {
                            JLPTLevel = "N5",
                            Title = "Gọi cà phê N5 - Đặt đồ uống & Chọn size",
                            Description = "Gọi 1 ly cafe sữa đá size vừa và thanh toán.",
                            AiPersona = "Nhân viên quán cafe - カフェ店員",
                            CreditCost = 5,
                            Status = "Published",
                            TargetVocabularies = new List<TargetVocabulary>
                            {
                                new TargetVocabulary { Word = "アイスコーヒー", Reading = "あいすこーひー", Meaning = "Cà phê đá" },
                                new TargetVocabulary { Word = "サイズ", Reading = "さいず", Meaning = "Kích cỡ đồ uống" },
                                new TargetVocabulary { Word = "店内", Reading = "てんない", Meaning = "Dùng tại quán" }
                            },
                            TargetGrammars = new List<TargetGrammar>
                            {
                                new TargetGrammar { Pattern = "～をください", Meaning = "Cho tôi xin...", ExampleSentence = "アイスコーヒーのMサイズをください。" },
                                new TargetGrammar { Pattern = "～でお願いします", Meaning = "Cho tôi chọn...", ExampleSentence = "店内でお願いします。" }
                            },
                            Missions = new List<Mission>
                            {
                                new Mission
                                {
                                    Content = "Gọi một loại đồ uống cụ thể kèm kích cỡ (S/M/L)",
                                    Order = 1,
                                    CompletionCriteriaJson = CreateCriteriaJson(
                                        "Order beverage with cup size",
                                        "Coffee drink and size",
                                        "Learner requests a coffee beverage with a specific size."
                                    )
                                },
                                new Mission
                                {
                                    Content = "Chọn hình thức dùng tại quán (店内) hoặc mang đi (持ち帰り)",
                                    Order = 2,
                                    CompletionCriteriaJson = CreateCriteriaJson(
                                        "Specify dine in or takeout",
                                        "Dining preference",
                                        "Learner specifies whether to drink inside or take away."
                                    )
                                },
                                new Mission
                                {
                                    Content = "Nói lời cảm ơn khi nhận hóa đơn hoặc thẻ rung chờ đồ uống",
                                    Order = 3,
                                    CompletionCriteriaJson = CreateCriteriaJson(
                                        "Thank barista politely",
                                        "Barista checkout",
                                        "Learner says thank you upon receiving receipt/buzzer."
                                    )
                                }
                            }
                        },
                        // N4 Level
                        new ScenarioLevelConfiguration
                        {
                            JLPTLevel = "N4",
                            Title = "Tùy chỉnh đồ uống N4 - Chọn sữa hạt & Bánh ngọt Harajuku",
                            Description = "Yêu cầu đổi sang sữa đậu nành, ít ngọt và gọi thêm bánh crepe dâu.",
                            AiPersona = "Barista trưởng - バリスタ",
                            CreditCost = 5,
                            Status = "Published",
                            TargetVocabularies = new List<TargetVocabulary>
                            {
                                new TargetVocabulary { Word = "豆乳", Reading = "とうにゅう", Meaning = "Sữa đậu nành / Sữa thực vật" },
                                new TargetVocabulary { Word = "甘さ控えめ", Reading = "あまさひかえめ", Meaning = "Ít ngọt / Giảm đường" },
                                new TargetVocabulary { Word = "クレープ", Reading = "くれーぷ", Meaning = "Bánh Crepe Harajuku" }
                            },
                            TargetGrammars = new List<TargetGrammar>
                            {
                                new TargetGrammar { Pattern = "～に変更できますか", Meaning = "Có thể đổi thành... được không?", ExampleSentence = "ミルクを豆乳に変更できますか。" },
                                new TargetGrammar { Pattern = "～のおすすめはありますか", Meaning = "Có gợi ý món... nào ngon không?", ExampleSentence = "本日のおすすめスイーツはありますか。" }
                            },
                            Missions = new List<Mission>
                            {
                                new Mission
                                {
                                    Content = "Hỏi xin đổi sang sữa thực vật hoặc yêu cầu giảm độ ngọt",
                                    Order = 1,
                                    CompletionCriteriaJson = CreateCriteriaJson(
                                        "Customize beverage milk or sweetness",
                                        "Soy milk or less sweet customization",
                                        "Learner requests soy milk substitution or sweetness adjustment."
                                    )
                                },
                                new Mission
                                {
                                    Content = "Hỏi xin tư vấn loại bánh ngọt đặc trưng của quán",
                                    Order = 2,
                                    CompletionCriteriaJson = CreateCriteriaJson(
                                        "Ask for recommended dessert",
                                        "Recommended sweet or crepe",
                                        "Learner asks for recommended dessert from the barista."
                                    )
                                },
                                new Mission
                                {
                                    Content = "Chọn 1 phần bánh ngọt ăn kèm với nước",
                                    Order = 3,
                                    CompletionCriteriaJson = CreateCriteriaJson(
                                        "Order pastry or crepe",
                                        "Dessert order confirmation",
                                        "Learner confirms selection of a pastry or crepe."
                                    )
                                }
                            }
                        },
                        // N3 Level
                        new ScenarioLevelConfiguration
                        {
                            JLPTLevel = "N3",
                            Title = "Thưởng thức trà chiều N3 - Tìm hiểu hạt rang xay & Không gian làm việc",
                            Description = "Hỏi nguồn gốc hạt cafe thủ công, mật khẩu Wi-Fi và vị trí ổ cắm điện làm việc.",
                            AiPersona = "Chủ tiệm cafe Harajuku - 店主",
                            CreditCost = 5,
                            Status = "Published",
                            TargetVocabularies = new List<TargetVocabulary>
                            {
                                new TargetVocabulary { Word = "自家焙煎", Reading = "じかばいせん", Meaning = "Cà phê tự rang xay thủ công" },
                                new TargetVocabulary { Word = "電源席", Reading = "でんげんせき", Meaning = "Bàn có ổ cắm sạc điện thoại/laptop" },
                                new TargetVocabulary { Word = "酸味", Reading = "さんみ", Meaning = "Vị chua thanh tự nhiên" }
                            },
                            TargetGrammars = new List<TargetGrammar>
                            {
                                new TargetGrammar { Pattern = "～を使わせていただいてもよろしいでしょうか", Meaning = "Tôi xin phép sử dụng... có được không ạ?", ExampleSentence = "Wi-Fiを使わせていただいてもよろしいでしょうか。" },
                                new TargetGrammar { Pattern = "～の特徴を教えていただけますか", Meaning = "Bạn có thể giải thích đặc trưng của... được không?", ExampleSentence = "このコーヒー豆の特徴を教えていただけますか。" }
                            },
                            Missions = new List<Mission>
                            {
                                new Mission
                                {
                                    Content = "Hỏi chủ quán về hương vị hoặc nguồn gốc hạt cà phê tự rang",
                                    Order = 1,
                                    CompletionCriteriaJson = CreateCriteriaJson(
                                        "Inquire artisan coffee roast profile",
                                        "House roast beans flavor profile",
                                        "Learner discusses roasted coffee bean flavor profile or origins politely."
                                    )
                                },
                                new Mission
                                {
                                    Content = "Hỏi xin mật khẩu Wi-Fi và chỗ ngồi có ổ cắm sạc máy tính",
                                    Order = 2,
                                    CompletionCriteriaJson = CreateCriteriaJson(
                                        "Inquire Wi-Fi and power outlet seat",
                                        "Wi-Fi credentials and power plug seat",
                                        "Learner politely inquires about Wi-Fi access and power outlet seat."
                                    )
                                },
                                new Mission
                                {
                                    Content = "Khen ngợi không gian quán và bày tỏ sẽ quay lại",
                                    Order = 3,
                                    CompletionCriteriaJson = CreateCriteriaJson(
                                        "Praise cafe ambiance and promise return",
                                        "Cafe owner rapport",
                                        "Learner compliments cafe ambiance and expresses intent to revisit."
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
