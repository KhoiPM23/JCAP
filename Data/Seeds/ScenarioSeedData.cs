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
                                new TargetVocabulary { Word = "豚骨ラーメン", Reading = "とんこつらーめん", Meaning = "Mì Ramen xương heo (Tonkotsu ramen) • N5 [Danh từ] • Món mì nổi tiếng với nước hầm xương đậm đà" },
                                new TargetVocabulary { Word = "お冷", Reading = "おひや", Meaning = "Nước lọc đá miễn phí (Ohiya) • N5 [Danh từ] • Phục vụ miễn phí tại quầy ăn Nhật Bản" },
                                new TargetVocabulary { Word = "一人", Reading = "ひとり", Meaning = "Một người / Đi một mình (Hitori) • N5 [Danh từ/Phó từ] • Dùng báo số lượng khách: 一人です" },
                                new TargetVocabulary { Word = "カウンター席", Reading = "かうんたーせき", Meaning = "Ghế quầy bar (Counter seki) • N5 [Danh từ] • Dãy ghế ngồi đối diện khu bếp nấu ramen" },
                                new TargetVocabulary { Word = "ごちそうさま", Reading = "ごちそうさま", Meaning = "Cảm ơn bữa ăn ngon (Gochisousama) • N5 [Thành ngữ] • Lời chào cảm ơn lễ phép khi ăn xong ra về" }
                            },
                            TargetGrammars = new List<TargetGrammar>
                            {
                                new TargetGrammar { Pattern = "～をお願いします", Meaning = "Cho tôi xin... / Làm ơn cho tôi... [N + をお願いします] (Lịch sự - Teineigo, gọi món chuẩn mực)", ExampleSentence = "豚骨ラーメンをお願いします。（とんこつらーめんをおねがいします - Cho tôi một bát mì Tonkotsu Ramen ạ.）" },
                                new TargetGrammar { Pattern = "～はいくらですか", Meaning = "...giá bao nhiêu tiền? [N + はいくらですか] (Nghi vấn từ hỏi giá tiền cơ bản)", ExampleSentence = "このラーメンはいくらですか。（このらーめんはいくらですか - Bát mì ramen này giá bao nhiêu tiền vậy ạ?）" },
                                new TargetGrammar { Pattern = "～を［số lượng］ください", Meaning = "Cho tôi xin [số lượng]... [N + を + số lượng + ください] (Mẫu gọi số lượng món ăn trực tiếp)", ExampleSentence = "お冷を一杯ください。（おひやをいっぱいください - Làm ơn cho tôi xin một cốc nước lạnh ạ.）" }
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
                                new TargetVocabulary { Word = "麺の固さ", Reading = "めんのかたさ", Meaning = "Độ cứng của sợi mì (Men no katasa) • N4 [Danh từ] • Gồm các mức: 硬め (dai cứng), 普通 (vừa), 柔らかめ (mềm)" },
                                new TargetVocabulary { Word = "味の濃さ", Reading = "あじのこさ", Meaning = "Độ đậm đà của nước dùng (Aji no kosa) • N4 [Danh từ] • Gồm các mức: 濃いめ (đậm đà), 普通 (chuẩn), 薄め (thanh nhạt)" },
                                new TargetVocabulary { Word = "味玉", Reading = "あじたま", Meaning = "Trứng ngâm tương lòng đào (Ajitama) • N4 [Danh từ] • Topping ramen phổ biến nhất nấu từ trứng lòng đào" },
                                new TargetVocabulary { Word = "替玉", Reading = "かえだま", Meaning = "Gọi thêm vắt mì (Kaedama) • N4 [Danh từ] • Văn hóa ramen Hakata: giữ lại nước dùng và gọi thêm mì" },
                                new TargetVocabulary { Word = "クレジットカード", Reading = "くれじっとかーど", Meaning = "Thẻ tín dụng (Credit card) • N4 [Danh từ] • Phương thức thanh toán thẻ quốc tế" }
                            },
                            TargetGrammars = new List<TargetGrammar>
                            {
                                new TargetGrammar { Pattern = "～にしてもらえますか", Meaning = "Bạn có thể chỉnh thành... giúp tôi được không? [N + に / A-く + してもらえますか] (Nhờ vả tùy biến món ăn thân thiện)", ExampleSentence = "麺を硬めにしてもらえますか。（めんをかためにしてもらえますか - Bạn có thể làm sợi mì dai cứng hơn một chút giúp tôi được không?）" },
                                new TargetGrammar { Pattern = "～を追加できますか", Meaning = "Có thể thêm... được không ạ? [N + を追加できますか] (Yêu cầu bổ sung topping hoặc phần ăn)", ExampleSentence = "トッピングに味玉を追加できますか。（とっぴんぐにあじたまをついかできますか - Tôi có thể gọi thêm topping trứng lòng đào được không ạ?）" },
                                new TargetGrammar { Pattern = "～で支払えますか", Meaning = "Có thể thanh toán bằng... không ạ? [Phương thức + で支払えますか] (Xác nhận phương thức thanh toán)", ExampleSentence = "クレジットカードで支払えますか。（くれじっとかーどでしはらえますか - Tôi có thể thanh toán bằng thẻ tín dụng được không ạ?）" }
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
                                new TargetVocabulary { Word = "アレルギー", Reading = "あれるぎー", Meaning = "Dị ứng thực phẩm (Allergy) • N3 [Danh từ] • Báo tình trạng dị ứng: 海鮮アレルギー (dị ứng hải sản)" },
                                new TargetVocabulary { Word = "魚介類", Reading = "ぎょかいるい", Meaning = "Hải sản / Tôm cua cá (Gyokairui) • N3 [Danh từ] • Thành phần chính trong nước dùng dashi Nhật Bản" },
                                new TargetVocabulary { Word = "出汁", Reading = "だし", Meaning = "Nước dùng cốt ninh (Dashi) • N3 [Danh từ] • Linh hồn ẩm thực Nhật nấu từ cá bào, tảo bẹ hoặc rau củ" },
                                new TargetVocabulary { Word = "変更", Reading = "へんこう", Meaning = "Thay đổi / Chuyển đổi (Henkou) • N3 [Danh từ/Động từ nhóm 3] • Dùng khi xin đổi nguyên liệu nấu" },
                                new TargetVocabulary { Word = "絶品", Reading = "ぜっぴん", Meaning = "Món ngon tuyệt phẩm (Zeppin) • N3 [Danh từ/Tính từ な] • Lời khen ngợi tinh tế dành cho nghệ thuật ẩm thực" }
                            },
                            TargetGrammars = new List<TargetGrammar>
                            {
                                new TargetGrammar { Pattern = "～アレルギーがあるのですが", Meaning = "Tôi bị dị ứng với... nên là... [N + アレルギーがあるのですが] (Trình bày lý do y tế tế nhị trước khi yêu cầu)", ExampleSentence = "実は魚介類アレルギーがあるのですが、スープにエビは使われていますか。（じつはぎょかいるいアレルギーがあるのですが、すーぷにえびはつかわれていますか - Thật ra tôi bị dị ứng hải sản, không biết trong nước dùng có tôm không ạ?）" },
                                new TargetGrammar { Pattern = "～に変更していただけないでしょうか", Meaning = "Xin vui lòng đổi sang... giúp tôi được không ạ? [N + に変更していただけないでしょうか] (Khiêm nhường ngữ nhờ vả trang trọng)", ExampleSentence = "スープを野菜ベースのものに変更していただけないでしょうか。（すーぷをやさいべーすのものにへんこうしていただけないでしょうか - Liệu quán có thể đổi nước dùng sang loại nấu từ rau củ giúp tôi được không ạ?）" },
                                new TargetGrammar { Pattern = "～は今まで食べた中で一番～です", Meaning = "...là món ngon nhất tôi từng ăn từ trước đến nay [N + は今まで食べた中で一番 + Tính từ + です] (Khen ngợi trải nghiệm ẩm thực sâu sắc)", ExampleSentence = "このラーメンは今まで食べた中で一番奥深い味わいでした。（このらーめんは今までにたべたなかでいちばんおくぶかいあじわいでした - Bát mì ramen này có hương vị đậm đà tinh tế nhất mà tôi từng được thưởng thức ạ.）" }
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
                                new TargetVocabulary { Word = "自己紹介", Reading = "じこしょうかい", Meaning = "Giới thiệu bản thân (Jikoshoukai) • N5 [Danh từ] • Nghi thức mở đầu bắt buộc trong phỏng vấn Nhật" },
                                new TargetVocabulary { Word = "アルバイト", Reading = "あるばいと", Meaning = "Việc làm thêm bán thời gian (Arubaito) • N5 [Danh từ] • Công việc part-time dành cho du học sinh" },
                                new TargetVocabulary { Word = "出身", Reading = "しゅっしん", Meaning = "Quê quán / Xuất thân (Shusshin) • N5 [Danh từ] • Khai báo nguồn gốc quốc gia: ベトナム出身です" },
                                new TargetVocabulary { Word = "勤務可能", Reading = "きんむかのう", Meaning = "Có thể đi làm (Kinmu kanou) • N5 [Danh từ/Tính từ な] • Trả lời số buổi có thể nhận ca trong tuần" },
                                new TargetVocabulary { Word = "一生懸命", Reading = "いっしょうけんめい", Meaning = "Hết sức mình / Chăm chỉ nỗ lực (Isshoukenmei) • N5 [Phó từ] • Cam kết thái độ: 一生懸命頑張ります" }
                            },
                            TargetGrammars = new List<TargetGrammar>
                            {
                                new TargetGrammar { Pattern = "～と申します", Meaning = "Tôi tên là... [Tên + と申します] (Khiêm nhường ngữ giới thiệu họ tên trang trọng)", ExampleSentence = "グエン・ヴァン・ナムと申します。（ぐえん・ゔぁん・なむともうします - Dạ tôi tên là Nguyen Van Nam ạ.）" },
                                new TargetGrammar { Pattern = "週に～日働くことができます", Meaning = "Một tuần tôi có thể làm việc... ngày [Thời gian + に + Số ngày + 働くことができます] (Trình bày khả năng đáp ứng ca làm việc)", ExampleSentence = "週に3日、月曜日と水曜日と金曜日に働くことができます。（しゅうにみっか、げつようびとすいようびときんようびにはたらくことができます - Một tuần em có thể làm 3 ngày vào thứ Hai, Tư và Sáu ạ.）" },
                                new TargetGrammar { Pattern = "精一杯頑張りますので、よろしくお願いします", Meaning = "Em sẽ cố gắng hết mình, rất mong nhận được sự giúp đỡ [Mệnh đề lý do + よろしくお願いします] (Câu kết phỏng vấn ghi điểm thái độ)", ExampleSentence = "一生懸命頑張りますので、どうぞよろしくお願いいたします。（いっしょうけんめいがんばりますので、どうぞよろしくおねがいいたします - Em sẽ nỗ lực làm việc hết sức mình, kính mong anh/chị nhận và giúp đỡ em ạ.）" }
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
                                new TargetVocabulary { Word = "志望動機", Reading = "しぼうどうき", Meaning = "Lý do ứng tuyển (Shiboudouki) • N4 [Danh từ] • Câu hỏi then chốt về động lực xin việc" },
                                new TargetVocabulary { Word = "通勤時間", Reading = "つうきんじかん", Meaning = "Thời gian đi lại từ nhà đến chỗ làm (Tsuukin jikan) • N4 [Danh từ] • Yếu tố đánh giá việc đi làm đúng giờ" },
                                new TargetVocabulary { Word = "徒歩", Reading = "とほ", Meaning = "Đi bộ (Toho) • N4 [Danh từ] • Phương tiện di chuyển: 徒歩10分 (đi bộ 10 phút)" },
                                new TargetVocabulary { Word = "接客経験", Reading = "せっきゃくけいけん", Meaning = "Kinh nghiệm phục vụ khách hàng (Sekkyaku keiken) • N4 [Danh từ] • Điểm cộng lớn khi làm quán ăn/tiện lợi" },
                                new TargetVocabulary { Word = "合否結果", Reading = "ごうひけっか", Meaning = "Kết quả đỗ hay trượt (Gouhi kekka) • N4 [Danh từ] • Thông báo kết quả tuyển dụng" }
                            },
                            TargetGrammars = new List<TargetGrammar>
                            {
                                new TargetGrammar { Pattern = "～に興味があり、応募いたしました", Meaning = "Vì có hứng thú với... nên tôi đã nộp đơn ứng tuyển [N + に興味があり、応募いたしました] (Trình bày lý do ứng tuyển mạch lạc)", ExampleSentence = "日本の接客文化に興味があり、こちらの店舗に応募いたしました。（にほんのせっきゃくぶんかにきょうみがあり、こちらのてんぽにおうぼいたしました - Em rất hứng thú với văn hóa phục vụ của Nhật nên đã nộp đơn vào cửa hàng mình ạ.）" },
                                new TargetGrammar { Pattern = "自宅から～で～分ほどかかります", Meaning = "Từ nhà em đi bằng... mất khoảng... phút [自宅から + Phương tiện + で + Thời gian + かかります] (Miêu tả phương thức và thời gian đi lại)", ExampleSentence = "自宅から自転車で15分ほどかかります。（じたくからじてんしゃでじゅうごふんほどかかります - Từ nhà đến quán em đi xe đạp mất khoảng 15 phút thôi ạ.）" },
                                new TargetGrammar { Pattern = "面接の結果はいつ頃分かりますでしょうか", Meaning = "Khoảng khi nào thì có kết quả phỏng vấn ạ? [N + はいつ頃分かりますでしょうか] (Hỏi thời hạn kết quả lễ phép)", ExampleSentence = "面接の合否結果はいつ頃ご連絡いただけますでしょうか。（めんせつのごうひけっかはいつごろごれんらくいただけますでしょうか - Dạ khoảng khi nào thì em có thể nhận được thông báo kết quả phỏng vấn ạ?）" }
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
                                new TargetVocabulary { Word = "接客マナー", Reading = "せっきゃくまなー", Meaning = "Tác phong phục vụ khách hàng (Sekkyaku manaa) • N3 [Danh từ] • Chuẩn mực cúi chào, ánh mắt và nụ cười dịch vụ Nhật" },
                                new TargetVocabulary { Word = "クレーム対応", Reading = "くれーむたいおう", Meaning = "Kỹ năng xử lý khiếu nại (Kureemu taiou) • N3 [Danh từ] • Quy trình xin lỗi, lắng nghe và báo cáo cấp trên" },
                                new TargetVocabulary { Word = "深夜シフト", Reading = "しんやしふと", Meaning = "Ca làm việc ban đêm (Shinya shifuto) • N3 [Danh từ] • Ca làm sau 22h đêm với phụ cấp 25% lương" },
                                new TargetVocabulary { Word = "年末年始", Reading = "ねんまつねんし", Meaning = "Dịp nghỉ lễ Tết cuối năm (Nenmatsu nenshi) • N3 [Danh từ] • Thời điểm cửa hàng thiếu nhân sự cần hỗ trợ" },
                                new TargetVocabulary { Word = "柔軟に対応", Reading = "じゅうなんにたいおう", Meaning = "Ứng phó linh hoạt (Juunan ni taiou) • N3 [Phó từ + Động từ] • Sẵn sàng đổi ca và hỗ trợ tập thể" }
                            },
                            TargetGrammars = new List<TargetGrammar>
                            {
                                new TargetGrammar { Pattern = "まずお詫びを申し上げ、速やかに報告いたします", Meaning = "Trước tiên em sẽ xin lỗi khách và báo cáo ngay lập tức [まずお詫びを申し上げ、速やかに + N + へ報告いたします] (Nguyên tắc vàng xử lý phàn nàn dịch vụ)", ExampleSentence = "万が一お客様からご指摘を受けた際は、まず丁寧にお詫びを申し上げ、店長へ報告いたします。（まんがいちおきゃくさまからごしてきをうけたさいは、まずていねいにおわびをもうしあげ、てんちょうへほうこくいたします - Nếu chẳng may có phàn nàn, trước hết em sẽ cúi đầu xin lỗi chân thành rồi báo cáo ngay với cửa hàng trưởng ạ.）" },
                                new TargetGrammar { Pattern = "～にも柔軟に対応させていただく所存です", Meaning = "Em sẵn sàng linh hoạt hỗ trợ làm ca... [N + にも柔軟に対応させていただく所存です] (Kính ngữ thương mại cao cấp thể hiện tinh thần trách nhiệm)", ExampleSentence = "土日祝日や深夜シフトにも柔軟に対応させていただく所存です。（どにちしゅくじつやしんやしふとにもじゅうなんにたいおうさせていただくしょぞんです - Dịp cuối tuần, ngày lễ hay ca đêm em đều sẵn sàng linh hoạt nhận ca theo phân công ạ.）" },
                                new TargetGrammar { Pattern = "～ように常に心がけております", Meaning = "Em luôn tâm niệm và nỗ lực để... [V-る / V-ない + ように常に心がけております] (Thói quen tích cực tự giác trong công việc)", ExampleSentence = "お客様に気持ちよく過ごしていただけるよう、常に笑顔での挨拶を心がけております。（おきゃくさまにきもちよくすごしていただけるよう、つねにえがおでのあいさつをこころがけております - Em luôn tâm niệm chào hỏi với nụ cười niềm nở để khách hàng có trải nghiệm dễ chịu nhất ạ.）" }
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
                                new TargetVocabulary { Word = "改札口", Reading = "かいさつぐち", Meaning = "Cửa soát vé nhà ga (Kaisatsuguchi) • N5 [Danh từ] • Nơi quẹt thẻ IC hoặc đưa vé giấy vào cổng" },
                                new TargetVocabulary { Word = "山手線", Reading = "やまのてせん", Meaning = "Tuyến tàu điện vòng tròn Yamanote (Yamanotesen) • N5 [Danh từ riêng] • Tuyến đường sắt huyết mạch trung tâm Tokyo" },
                                new TargetVocabulary { Word = "切符売り場", Reading = "きっぷうりば", Meaning = "Khu vực bán vé tàu tự động (Kippu uriba) • N5 [Danh từ] • Nơi đặt máy bán vé tự động" },
                                new TargetVocabulary { Word = "運賃", Reading = "うんちん", Meaning = "Giá vé tàu / Cước phí chuyến đi (Unchin) • N5 [Danh từ] • Số tiền cần trả cho chặng tàu" },
                                new TargetVocabulary { Word = "～番線", Reading = "～ばんせん", Meaning = "Ke ga số... / Đường ray số... (Bansen) • N5 [Hậu tố đếm] • Ví dụ: 14番線 (Sân ga số 14)" }
                            },
                            TargetGrammars = new List<TargetGrammar>
                            {
                                new TargetGrammar { Pattern = "～はどこですか", Meaning = "...ở đâu vậy ạ? [N + はどこですか] (Mẫu câu hỏi vị trí cơ bản)", ExampleSentence = "すみません、山手線の改札口はどちらですか。（すみません、やまのてせんのかいさつぐちはどちらですか - Xin lỗi, cửa soát vé tuyến Yamanote ở hướng nào vậy ạ?）" },
                                new TargetGrammar { Pattern = "～までいくらですか", Meaning = "Đi đến... hết bao nhiêu tiền ạ? [Địa điểm + までいくらですか] (Hỏi giá cước di chuyển)", ExampleSentence = "ここから渋谷駅まではいくらですか。（ここからしぶやえきまではいくらですか - Từ đây đi đến ga Shibuya hết bao nhiêu tiền vé ạ?）" },
                                new TargetGrammar { Pattern = "ありがとうございます、助かりました", Meaning = "Cảm ơn anh/chị, may quá đã được chỉ giúp [Lời cảm ơn + 助かりました] (Lời cảm ơn ấm áp tự nhiên khi nhận chỉ đường)", ExampleSentence = "詳しく教えていただき、ありがとうございました。（くわしくおしえていただき、ありがとうございました - Cảm ơn bác đã chỉ dẫn tận tình cho tôi ạ.）" }
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
                                new TargetVocabulary { Word = "乗り換え", Reading = "のりかえ", Meaning = "Chuyển tuyến / Đổi tàu (Norikae) • N4 [Danh từ] • Chuyển đổi giữa các tuyến đường sắt trong ga" },
                                new TargetVocabulary { Word = "中央線快速", Reading = "ちゅうおうせんかいそく", Meaning = "Tàu nhanh tuyến Chuo (Chuuousen kaisoku) • N4 [Danh từ riêng] • Tuyến tàu màu cam chạy nhanh cắt ngang Tokyo" },
                                new TargetVocabulary { Word = "交通系ICカード", Reading = "こうつうけいあいしーかーど", Meaning = "Thẻ IC giao thông (Suica/Pasmo) • N4 [Danh từ] • Thẻ quẹt chạm thanh toán tàu xe tiện lợi" },
                                new TargetVocabulary { Word = "チャージ", Reading = "ちゃーじ", Meaning = "Nạp tiền vào thẻ (Charge) • N4 [Danh từ/Động từ nhóm 3] • Nạp thêm số dư tại máy bán vé tự động" },
                                new TargetVocabulary { Word = "発車ホーム", Reading = "はっしゃほーむ", Meaning = "Sân ke ga tàu xuất phát (Hassha hoomu) • N4 [Danh từ] • Sân ga đón tàu chờ khởi hành" }
                            },
                            TargetGrammars = new List<TargetGrammar>
                            {
                                new TargetGrammar { Pattern = "～へはどうやって乗り換えればいいですか", Meaning = "Đi đến... thì đổi tàu bằng cách nào ạ? [Địa điểm + へはどうやって乗り換えればいいですか] (Hỏi lộ trình trung chuyển chuẩn xác)", ExampleSentence = "東京駅へ行くには、中央線快速にどうやって乗り換えればいいですか。（とうきょうえきへいくには、ちゅうおうせんかいそくにどうやってのりかえればいいですか - Để đi ga Tokyo thì tôi đổi sang tuyến Chuo nhanh bằng cách nào ạ?）" },
                                new TargetGrammar { Pattern = "～のチャージの仕方を教えていただけますか", Meaning = "Xin hãy chỉ cho tôi cách [làm gì đó] được không ạ? [N + のV-bỏ masu + 方を教えていただけますか] (Hỏi cách sử dụng máy móc thiết bị)", ExampleSentence = "券売機でのSuicaのチャージの仕方を教えていただけますか。（けんばいきでのスイカのチャージのかたをおしえていただけますか - Bạn có thể chỉ giúp tôi cách nạp tiền thẻ Suica ở máy bán vé được không ạ?）" },
                                new TargetGrammar { Pattern = "何番ホームから発車しますか", Meaning = "Tàu chạy từ sân ga số mấy vậy ạ? [何番ホーム + から発車しますか] (Xác nhận ke ga khởi hành tránh đi nhầm chiều)", ExampleSentence = "次の中央線快速は何番ホームから出ますか。（つぎのちゅうおうせんかいそくはなんばんほーむからでますか - Chuyến tàu Chuo nhanh tiếp theo sẽ chạy từ ke ga số mấy ạ?）" }
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
                                new TargetVocabulary { Word = "新幹線指定席", Reading = "しんかんせんしていせき", Meaning = "Ghế ngồi đặt trước Shinkansen (Shiteiseki) • N3 [Danh từ] • Phân biệt với 自由席 (ghế tự do)" },
                                new TargetVocabulary { Word = "発車時刻の変更", Reading = "はっしゃじこくのへんこう", Meaning = "Đổi giờ tàu xuất phát (Hassha jikoku henkou) • N3 [Danh từ] • Thủ tục đổi vé tại quầy Midori no Madoguchi" },
                                new TargetVocabulary { Word = "遺失物取扱所", Reading = "いしつぶつとりあつかいじょ", Meaning = "Phòng tìm kiếm đồ thất lạc (Ishitsubutsu) • N3 [Danh từ] • Trung tâm quản lý đồ hành khách để quên trên tàu" },
                                new TargetVocabulary { Word = "網棚", Reading = "あみだな", Meaning = "Giá để hành lý trên cao trong toa (Amidana) • N3 [Danh từ] • Vị trí hành khách hay để quên túi xách/áo khoác nhất" },
                                new TargetVocabulary { Word = "車両番号", Reading = "しゃりょうばんごう", Meaning = "Số hiệu toa tàu và số ghế (Sharyou bangou) • N3 [Danh từ] • Dữ liệu then chốt giúp nhân viên truy tìm đồ đạc" }
                            },
                            TargetGrammars = new List<TargetGrammar>
                            {
                                new TargetGrammar { Pattern = "～の時間を変更していただくことは可能でしょうか", Meaning = "Liệu có thể đổi giờ... giúp tôi được không ạ? [N + の時間を変更していただくことは可能でしょうか] (Yêu cầu lịch sự trang trọng với nhân viên đường sắt)", ExampleSentence = "予約していた新幹線の指定席の発車時刻を変更していただくことは可能でしょうか。（よやくしていたしんかんせんのしていせきのはっしゃじこくをへんこうしていただくことはかのうでしょうか - Tôi có thể xin đổi giờ xuất phát của vé Shinkansen đã đặt trước được không ạ?）" },
                                new TargetGrammar { Pattern = "～に～を忘れてしまったようなのですが", Meaning = "Dường như tôi đã lỡ bỏ quên... ở trên... rồi ạ [Địa điểm + に + Vật + を忘れてしまったようなのですが] (Khai báo sự cố bằng thể てしまう + ようだ tế nhị)", ExampleSentence = "さきほどの山手線の網棚の上に、黒いリュックを忘れてしまったようなのですが。（さきほどのやまのてせんのあみだなのうえに、くろいリュックをわすれてしまったようなのですが - Dường như tôi đã lỡ bỏ quên chiếc ba lô đen trên giá hành lý toa tàu vừa rồi ạ.）" },
                                new TargetGrammar { Pattern = "お忙しいところ迅速にご対応いただき、心より感謝申し上げます", Meaning = "Tôi xin chân thành cảm ơn sự hỗ trợ nhanh chóng của quý ga [Lời cảm ơn Keigo cao cấp] (Lời cảm ơn chuẩn mực trong văn hóa Nhật)", ExampleSentence = "お忙しい中でお探しいただき、本当にありがとうございました。（おいそがしいなかでおさがしいただき、ほんとうにありがとうございました - Cảm ơn các anh đã nhanh chóng tìm lại giúp đồ trong lúc bận rộn ạ.）" }
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
                                new TargetVocabulary { Word = "お弁当", Reading = "おべんとう", Meaning = "Cơm hộp bento chế biến sẵn (Obentou) • N5 [Danh từ] • Mặt hàng ẩm thực tiện lợi phổ biến nhất Konbini" },
                                new TargetVocabulary { Word = "温める", Reading = "あたためる", Meaning = "Hâm nóng bằng lò vi sóng (Atatameru) • N5 [Động từ nhóm 2] • Câu hỏi cửa miệng của thu ngân: 温めますか" },
                                new TargetVocabulary { Word = "レジ袋", Reading = "れじぶくろ", Meaning = "Túi ni lông mua sắm (Rejibukuro) • N5 [Danh từ] • Tính phí 3-5 yên tại các cửa hàng Nhật" },
                                new TargetVocabulary { Word = "お会計", Reading = "おかいけい", Meaning = "Tính tiền / Thanh toán hóa đơn (Okaikei) • N5 [Danh từ] • お会計をお願いします" },
                                new TargetVocabulary { Word = "お釣り", Reading = "おつり", Meaning = "Tiền thừa trả lại (Otsuri) • N5 [Danh từ] • Tiền thối lại khi trả bằng tiền mặt" }
                            },
                            TargetGrammars = new List<TargetGrammar>
                            {
                                new TargetGrammar { Pattern = "～を温めてください", Meaning = "Xin vui lòng hâm nóng... giúp tôi [N + を温めてください] (Yêu cầu nhân viên hâm nóng đồ ăn)", ExampleSentence = "このお弁当を温めてください。（このおべんとうをあたためてください - Làm ơn hâm nóng giúp tôi hộp cơm này với ạ.）" },
                                new TargetGrammar { Pattern = "～は結構です / 大丈夫です", Meaning = "...thì tôi không cần đâu ạ [N + は結構です / 大丈夫です] (Từ chối lịch sự, tránh dùng từ thô ráp)", ExampleSentence = "マイバッグを持っていますので、レジ袋は結構です。（まいばっぐをもっていますので、れじぶくろはけっこうです - Tôi có mang túi riêng rồi nên không cần túi ni lông đâu ạ.）" },
                                new TargetGrammar { Pattern = "全部でいくらになりますか", Meaning = "Tổng cộng hết bao nhiêu tiền vậy ạ? [全部でいくらになりますか] (Hỏi tổng số tiền cần thanh toán)", ExampleSentence = "すみません、全部でおいくらですか。（すみません、ぜんぶでおいくらですか - Xin lỗi, tổng cộng của tôi hết bao nhiêu tiền ạ?）" }
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
                                new TargetVocabulary { Word = "電子マネー", Reading = "でんしまねー", Meaning = "Tiền điện tử không tiền mặt (Denshi manee) • N4 [Danh từ] • Bao gồm PayPay, Suica, nanaco" },
                                new TargetVocabulary { Word = "バーコード決済", Reading = "ばーこーどけっさい", Meaning = "Quét mã vạch / Mã QR thanh toán (Baakoodo kessai) • N4 [Danh từ] • Đưa màn hình điện thoại cho nhân viên quét" },
                                new TargetVocabulary { Word = "ポイントカード", Reading = "ぽいんとかーど", Meaning = "Thẻ tích lũy điểm thưởng (Point card) • N4 [Danh từ] • Tích điểm Nanaco, Ponta, V-Point" },
                                new TargetVocabulary { Word = "割り箸", Reading = "わりばし", Meaning = "Đũa gỗ dùng một lần (Waribashi) • N4 [Danh từ] • Thu ngân thường hỏi: お箸はお付けしますか" },
                                new TargetVocabulary { Word = "レシート", Reading = "れしーと", Meaning = "Hóa đơn mua hàng in giấy (Reshiito) • N4 [Danh từ] • Biên nhận giao dịch" }
                            },
                            TargetGrammars = new List<TargetGrammar>
                            {
                                new TargetGrammar { Pattern = "～で支払うことはできますか", Meaning = "Tôi có thể thanh toán bằng... được không ạ? [N + で支払うことはできますか] (Xác nhận ví điện tử / QR code)", ExampleSentence = "PayPayのバーコード決済で支払うことはできますか。（ペイペイのばーこーどけっさいでしはらうことはできますか - Tôi thanh toán bằng quét mã PayPay được không ạ?）" },
                                new TargetGrammar { Pattern = "ポイントカードは持っていません", Meaning = "Tôi không mang theo thẻ tích điểm [N + は持っていません] (Trả lời câu hỏi tích điểm của thu ngân)", ExampleSentence = "ポイントカードは持っていませんので大丈夫です。（ぽいんとかーどはもっていませんのでだいじょうぶです - Em không có thẻ tích điểm nên không cần tích đâu ạ.）" },
                                new TargetGrammar { Pattern = "～をもう一つ付けていただけますか", Meaning = "Bạn có thể cho tôi kèm thêm một chiếc... được không ạ? [N + をもう一つ付けていただけますか] (Xin thêm dụng cụ ăn uống lịch sự)", ExampleSentence = "デザート用のスプーンをもう一つ付けていただけますか。（でざーとようのすぷーんをもうひとつづけていただけますか - Bạn có thể cho tôi xin thêm một chiếc muỗng ăn đồ tráng miệng được không ạ?）" }
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
                                new TargetVocabulary { Word = "宅配便", Reading = "たくはいびん", Meaning = "Chuyển phát bưu kiện tận nhà Yamato (Takuhaibin) • N3 [Danh từ] • Dịch vụ ký gửi hành lý tiện ích tại Konbini" },
                                new TargetVocabulary { Word = "送り状", Reading = "おくりじょう", Meaning = "Phiếu gửi hàng / Vận đơn (Okurijou) • N3 [Danh từ] • Gồm 2 loại: 元払い (người gửi trả) và 着払い (người nhận trả)" },
                                new TargetVocabulary { Word = "配達希望日時", Reading = "はいたつきぼうにちじ", Meaning = "Ngày giờ mong muốn nhận bưu kiện (Haitatsu kibou nichiji) • N3 [Danh từ] • Chọn khung giờ: 午前中, 14-16h, 18-20h" },
                                new TargetVocabulary { Word = "マルチコピー機", Reading = "まるちこぴーき", Meaning = "Máy in photocopy đa năng tiện ích (Maruchi kopiiki) • N3 [Danh từ] • Thiết bị xuất vé xem hòa nhạc, in ấn tài liệu" },
                                new TargetVocabulary { Word = "発券番号", Reading = "はっけんばんごう", Meaning = "Mã số xuất vé đặt trước (Hakken bangou) • N3 [Danh từ] • Mã số nhập vào màn hình để in vé giấy" }
                            },
                            TargetGrammars = new List<TargetGrammar>
                            {
                                new TargetGrammar { Pattern = "～の手続きをお願いしたいのですが", Meaning = "Tôi muốn nhờ làm thủ tục... có được không ạ? [N + の手続きをお願いしたいのですが] (Mở đầu giao dịch dịch vụ phức tạp lịch sự)", ExampleSentence = "スーツケースを空港へ送りたいのですが、宅配便の手続きをお願いできますか。（すーつけーすをくうこうへおくりたいのですが、たくはいびんのてつづきをおねがいできますか - Tôi muốn gửi vali ra sân bay, làm phiền anh làm thủ tục chuyển phát giúp tôi được không ạ?）" },
                                new TargetGrammar { Pattern = "～に届けていただくことは可能でしょうか", Meaning = "Liệu có thể chuyển đến... vào lúc... được không ạ? [Thời gian + に届けていただくことは可能でしょうか] (Thỏa thuận thời gian giao hàng trang trọng)", ExampleSentence = "明日の午前中までにホテルのフロントへ届けていただくことは可能でしょうか。（あすのごぜんちゅうまでにほてるのふろんとへとどけていただくことはかのうでしょうか - Liệu có thể giao hàng đến quầy lễ tân khách sạn trước trưa mai được không ạ?）" },
                                new TargetGrammar { Pattern = "～の使い方を教えていただけないでしょうか", Meaning = "Anh/chị có thể vui lòng chỉ giúp tôi cách dùng... được không ạ? [N + の使い方を教えていただけないでしょうか] (Nhờ hỗ trợ thao tác máy tự động)", ExampleSentence = "チケットを発券したいのですが、マルチコピー機の操作を教えていただけないでしょうか。（ちけっとをはっけんしたいのですが、まるちこぴーきのそうさをおしえていただけないでしょうか - Tôi muốn in vé, anh/chị có thể hướng dẫn tôi thao tác trên máy in đa năng được không ạ?）" }
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
                                new TargetVocabulary { Word = "新入社員", Reading = "しんにゅうしゃいん", Meaning = "Nhân viên mới vào công ty (Shinnyuu shain) • N5 [Danh từ] • Danh xưng trong giai đoạn thử việc đầu tiên" },
                                new TargetVocabulary { Word = "配属", Reading = "はいぞく", Meaning = "Được phân công vào bộ phận (Haizoku) • N5 [Danh từ/Động từ nhóm 3] • 開発部に配属されました" },
                                new TargetVocabulary { Word = "先輩社員", Reading = "せんぱいしゃいん", Meaning = "Tiền bối / Đồng nghiệp đi trước (Senpai shain) • N5 [Danh từ] • Đại từ tôn trọng trong văn hóa tổ chức Nhật" },
                                new TargetVocabulary { Word = "本日より", Reading = "ほんじつより", Meaning = "Kể từ ngày hôm nay (Honjitsu yori) • N5 [Phó từ] • Cách nói trang trọng công sở của \"今日から\"" },
                                new TargetVocabulary { Word = "ご指導", Reading = "ごしどう", Meaning = "Sự chỉ giáo / Hướng dẫn bảo ban (Goshidou) • N5 [Danh từ kính ngữ] • Luôn đi kèm: ご指導よろしくお願いします" }
                            },
                            TargetGrammars = new List<TargetGrammar>
                            {
                                new TargetGrammar { Pattern = "～から参りました、～と申します", Meaning = "Tôi đến từ... và tên tôi là... [Địa điểm + から参りました、Tên + と申します] (Khiêm nhường ngữ tự giới thiệu ngày đầu nhận việc)", ExampleSentence = "ベトナムの開発チームから参りました、グエン・ヴァン・ナムと申します。（ベトナムのかいはつちーむからまいりました、グエン・ヴァン・ナムともうします - Tôi đến từ đội ngũ phát triển tại Việt Nam, tên tôi là Nguyen Van Nam ạ.）" },
                                new TargetGrammar { Pattern = "～に配属となりました", Meaning = "Tôi được phân công công tác tại... [Phòng ban + に配属となりました] (Báo cáo bộ phận công tác chuẩn văn phong doanh nghiệp)", ExampleSentence = "本日よりシステム開発部に配属となりました。（ほんじつよりしすてむかいはつぶにはいぞくとなりました - Kể từ hôm nay tôi được phân công vào bộ phận phát triển hệ thống ạ.）" },
                                new TargetGrammar { Pattern = "ご指導ご鞭撻のほど、よろしくお願いいたします", Meaning = "Rất mong nhận được sự chỉ bảo và dẫn dắt của các anh/chị [Thành ngữ Keigo công sở] (Câu kết bài giới thiệu gây ấn tượng văn hóa tuyệt đối)", ExampleSentence = "まだまだ不慣れな点が多いですが、どうぞよろしくお願いいたします。（まだまだふなれなてんがおおいですが、どうぞよろしくおねがいいたします - Em còn nhiều bỡ ngỡ, kính mong các tiền bối chỉ bảo và giúp đỡ em ạ.）" }
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
                                new TargetVocabulary { Word = "業務進捗", Reading = "ぎょうむしんちょく", Meaning = "Tiến độ thực hiện công việc (Gyoumu shinchoku) • N4 [Danh từ] • Trọng tâm cốt lõi của quy tắc Horenso" },
                                new TargetVocabulary { Word = "報連相", Reading = "ほうれんそう", Meaning = "Báo cáo - Liên lạc - Thảo luận (Horenso) • N4 [Danh từ] • Nguyên tắc giao tiếp nền tảng của doanh nghiệp Nhật" },
                                new TargetVocabulary { Word = "完了", Reading = "かんりょう", Meaning = "Đã hoàn tất / Xong xuôi (Kanryou) • N4 [Danh từ/Động từ nhóm 3] • Báo cáo các hạng mục đã hoàn thành" },
                                new TargetVocabulary { Word = "予定通り", Reading = "よていどおり", Meaning = "Đúng như kế hoạch đề ra (Yotei doori) • N4 [Phó từ] • 予定通り進行しております" },
                                new TargetVocabulary { Word = "ご確認", Reading = "ごかくにん", Meaning = "Sự kiểm tra / Xem xét duyệt tài liệu (Gokakunin) • N4 [Danh từ kính ngữ] • Nhờ cấp trên duyệt tài liệu" }
                            },
                            TargetGrammars = new List<TargetGrammar>
                            {
                                new TargetGrammar { Pattern = "今お時間よろしいでしょうか、～についてご報告いたします", Meaning = "Bây giờ anh có tiện vài phút không ạ, em xin phép báo cáo về... [今お時間よろしいでしょうか、N + についてご報告いたします] (Mở đầu Horenso chuẩn mực)", ExampleSentence = "リーダー、今お時間よろしいでしょうか。本日の開発進捗についてご報告いたします。（リーダー、いまおじかんよろしいでしょうか。ほんじつのかいはつしんちょくについてごほうこくいたします - Trưởng nhóm ơi, bây giờ anh có tiện vài phút không ạ? Em xin phép báo cáo tiến độ hôm nay ạ.）" },
                                new TargetGrammar { Pattern = "～は完了しており、現在は～を進めております", Meaning = "Hạng mục... đã xong, hiện tại em đang tiến hành... [N1 + は完了しており、現在は + N2 + を進めております] (Cấu trúc liên kết báo cáo tiến độ mượt mà)", ExampleSentence = "設計書の作成は完了しており、現在は単体テストを進めております。（せっけいしょのさくせいはかんりょうしており、げんざいはたんたいてすとをすすめております - Phần soạn tài liệu thiết kế đã xong, hiện tại em đang tiến hành chạy unit test ạ.）" },
                                new TargetGrammar { Pattern = "～をご確認いただけますでしょうか", Meaning = "Xin anh/chị xem qua và cho em xin góp ý được không ạ? [N + をご確認いただけますでしょうか] (Nhờ cấp trên review tài liệu lịch sự)", ExampleSentence = "作成した資料をご確認いただき、フィードバックをいただけますでしょうか。（さくせいしたしりょうをごかくにんいただき、ふぃーどばっくをいただけますでしょうか - Nhờ anh xem qua bản tài liệu em vừa soạn và cho em xin ý kiến góp ý với ạ.）" }
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
                                new TargetVocabulary { Word = "名刺交換", Reading = "めいしこうかん", Meaning = "Nghi thức trao đổi danh thiếp kinh doanh (Meishi koukan) • N3 [Danh từ] • Hai tay ngang ngực, đọc to rõ họ tên" },
                                new TargetVocabulary { Word = "応接室", Reading = "おうせつしつ", Meaning = "Phòng tiếp khách đối tác trang trọng (Ousetsushitsu) • N3 [Danh từ] • Phòng họp đón tiếp đối tác" },
                                new TargetVocabulary { Word = "平素", Reading = "へいそ", Meaning = "Thường ngày / Thời gian qua (Heiso) • N3 [Danh từ] • Bình thường trong giao thiệp: 平素よりお世話になっております" },
                                new TargetVocabulary { Word = "頂戴いたします", Reading = "ちょうだいいたします", Meaning = "Tôi xin phép được nhận lấy (Choudai itashimasu) • N3 [Động từ khiêm nhường] • Nói khi hai tay đón nhận danh thiếp từ khách" },
                                new TargetVocabulary { Word = "ご案内", Reading = "ごあんない", Meaning = "Sự dẫn đường / Hướng dẫn lối đi (Goannai) • N3 [Danh từ kính ngữ] • こちらへご案内いたします" }
                            },
                            TargetGrammars = new List<TargetGrammar>
                            {
                                new TargetGrammar { Pattern = "いつもお世話になっております、～社の～と申します", Meaning = "Xin chào quý đối tác, tôi là... đến từ công ty... [平素は大変お世話になっております、Công ty + の + Tên + と申します] (Lời chào danh thiếp thương mại trang trọng)", ExampleSentence = "平素は大変お世話になっております。JCAP株式会社のグエンと申します。（へいそはたいへんおせわになっております。JCAPかぶしきがいしゃのグエンともうします - Dạ em xin chào đối tác lâu năm của công ty, em là Nguyen đến từ công ty cổ phần JCAP ạ.）" },
                                new TargetGrammar { Pattern = "頂戴いたします、お目にかかれて光栄に存じます", Meaning = "Tôi xin trân trọng nhận danh thiếp, thật vinh hạnh được diện kiến quý anh/chị [名刺を頂戴いたします、お目にかかれて光栄に存じます] (Kính ngữ Meishi-koukan đỉnh cao)", ExampleSentence = "恐れ入ります、名刺を頂戴いたします。本日お目にかかれて光栄に存じます。（おそれいります、めいしをちょうだいいたします。ほんじつおめにかかれてこうえいにぞんじます - Dạ em xin phép nhận danh thiếp của anh, hôm nay được gặp anh trực tiếp là niềm vinh hạnh lớn của em ạ.）" },
                                new TargetGrammar { Pattern = "奥の応接室へご案内いたします、どうぞこちらへ", Meaning = "Tôi xin phép hướng dẫn anh/chị vào phòng tiếp khách phía trong, xin mời lối này [Địa điểm + へご案内いたします、どうぞこちらへ] (Dẫn khách và mời ngồi)", ExampleSentence = "準備が整っておりますので、3階の応接室へご案内いたします。どうぞこちらへお進みください。（じゅんびがととのっておりますので、さんかいのおうせつしつへごあんないいたします。どうぞこちらへおすすみください - Mọi khâu đã chuẩn bị sẵn sàng, em xin mời quý đoàn vào phòng tiếp khách tầng 3 ạ, xin mời đi lối này.）" }
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
                                new TargetVocabulary { Word = "アイスカフェラテ", Reading = "あいすかふぇらて", Meaning = "Cà phê Latte đá sữa tươi (Iced Cafe Latte) • N5 [Danh từ] • Thức uống phổ biến nhất tại quán cafe Nhật" },
                                new TargetVocabulary { Word = "サイズ", Reading = "さいず", Meaning = "Kích cỡ ly đồ uống (Size) • N5 [Danh từ] • Gồm S (Short), M (Tall), L (Grande)" },
                                new TargetVocabulary { Word = "店内利用", Reading = "てんないりよう", Meaning = "Dùng thức uống tại quán (Tennai riyou) • N5 [Danh từ] • Mức thuế 10% tại Nhật" },
                                new TargetVocabulary { Word = "持ち帰り", Reading = "もちかえり", Meaning = "Mang về / Mua mang đi (Mochikaeri / Take-out) • N5 [Danh từ] • Mức thuế ưu đãi 8% tại Nhật" },
                                new TargetVocabulary { Word = "呼び出しベル", Reading = "よびだしべる", Meaning = "Thẻ rung báo lấy đồ uống (Yobidashi bell) • N5 [Danh từ] • Thiết bị rung khi nước pha xong" }
                            },
                            TargetGrammars = new List<TargetGrammar>
                            {
                                new TargetGrammar { Pattern = "～の～サイズを一つください", Meaning = "Cho tôi một ly... size... [Tên món + の + Size + を + Số lượng + ください] (Mẫu gọi đồ uống kèm size cốc)", ExampleSentence = "アイスカフェラテのMサイズを一つください。（あいすかふぇらてのMさいずをひとつください - Cho tôi một ly Latte đá size M ạ.）" },
                                new TargetGrammar { Pattern = "～でお願いします", Meaning = "Cho tôi xin dùng tại quán / mang về [店内 / 持ち帰り + でお願いします] (Chọn hình thức thưởng thức)", ExampleSentence = "店内利用でお願いします。（てんないりようでおねがいします - Cho tôi dùng tại quán ạ.）" },
                                new TargetGrammar { Pattern = "ありがとうございます、楽しみに待っています", Meaning = "Cảm ơn bạn, tôi sẽ háo hức chờ đồ uống [Lời cảm ơn + 楽しみに待っています] (Đối đáp thân thiện lịch sự)", ExampleSentence = "ありがとうございます。ベルが鳴ったら取りに行きますね。（ありがとうございます。べるがなったらとりにいきますね - Cảm ơn bạn nhé, khi nào chuông rung tôi sẽ ra quầy nhận nước.）" }
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
                                new TargetVocabulary { Word = "豆乳", Reading = "とうにゅう", Meaning = "Sữa đậu nành thực vật (Tounyuu) • N4 [Danh từ] • Tùy chọn thay thế sữa bò cho người thuần chay hoặc kiêng lactose" },
                                new TargetVocabulary { Word = "甘さ控えめ", Reading = "あまさひかえめ", Meaning = "Giảm đường / Ít ngọt thanh nhẹ (Amasa hikaeme) • N4 [Cụm từ/Tính từ な] • Nét văn hóa ẩm thực chú trọng sức khỏe tại Nhật" },
                                new TargetVocabulary { Word = "抹茶クレープ", Reading = "まっちゃくれーぷ", Meaning = "Bánh Crepe trà xanh đặc sản Harajuku (Matcha crepe) • N4 [Danh từ] • Món bánh cuộn nổi tiếng đường Takeshita Harajuku" },
                                new TargetVocabulary { Word = "おすすめスイーツ", Reading = "おすすめすいーつ", Meaning = "Món tráng miệng được quán gợi ý (Osusume sweets) • N4 [Danh từ] • Món bánh đặc trưng theo mùa" },
                                new TargetVocabulary { Word = "セット割引", Reading = "せっとわりびき", Meaning = "Giảm giá theo combo đồ uống + bánh ngọt (Set waribiki) • N4 [Danh từ] • Thường giảm 50-100 yên khi gọi kèm" }
                            },
                            TargetGrammars = new List<TargetGrammar>
                            {
                                new TargetGrammar { Pattern = "牛乳を～に変更できますか", Meaning = "Có thể đổi sữa bò sang... được không ạ? [牛乳を + Sữa thực vật + に変更できますか] (Yêu cầu thay thế nguyên liệu pha chế)", ExampleSentence = "牛乳を豆乳に変更していただくことはできますか。（ぎゅうにゅうをとうにゅうにへんこうしていただくことはできますか - Có thể đổi sữa thường sang sữa đậu nành giúp em được không ạ?）" },
                                new TargetGrammar { Pattern = "甘さを控えめにすることは可能ですか", Meaning = "Có thể làm ít ngọt / giảm độ ngọt đi được không ạ? [N + を控えめにすることは可能ですか] (Tùy chỉnh khẩu vị pha chế)", ExampleSentence = "シロップを少なめにして、甘さ控えめにすることは可能ですか。（しろっぷをすくなめにして、あまさひかえめにすることはかのうですか - Có thể bớt si-rô lại để giảm độ ngọt thanh hơn được không ạ?）" },
                                new TargetGrammar { Pattern = "～に一番よく合うデザートはどれですか", Meaning = "Món bánh nào hợp nhất để thưởng thức cùng ly... này ạ? [Tên món + に一番よく合うデザートはどれですか] (Xin lời khuyên pairing đồ uống & bánh ngọt)", ExampleSentence = "このカフェラテに一番よく合うおすすめのクレープを教えてください。（このかふぇらてにいちばんよくあうおすすめのくれーぷをおしえてください - Bạn tư vấn giúp em món bánh crepe nào hợp vị nhất với ly cafe latte này nhé.）" }
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
                                new TargetVocabulary { Word = "自家焙煎豆", Reading = "じかばいせんまめ", Meaning = "Hạt cà phê mộc tự rang thủ công tại quán (Jikabaisen mame) • N3 [Danh từ] • Văn hóa Specialty Coffee độc đáo của Nhật Bản" },
                                new TargetVocabulary { Word = "酸味と苦味のバランス", Reading = "さんみとにがみのばらんす", Meaning = "Sự cân bằng giữa vị chua thanh và vị đắng đậm đà (Sanmi to nigami) • N3 [Cụm danh từ] • Thuật ngữ nếm thử hương vị cà phê (cupping notes)" },
                                new TargetVocabulary { Word = "電源席", Reading = "でんげんせき", Meaning = "Bàn có ổ cắm điện sạc laptop/điện thoại (Dengenseki) • N3 [Danh từ] • Tiện ích làm việc du mục (nomad working)" },
                                new TargetVocabulary { Word = "Wi-Fiパスワード", Reading = "わいふぁいぱすわーど", Meaning = "Mật khẩu mạng Wi-Fi (Wi-Fi password) • N3 [Danh từ] • Mật khẩu kết nối internet" },
                                new TargetVocabulary { Word = "落ち着いた雰囲気", Reading = "おちついたふんいき", Meaning = "Không gian yên tĩnh, ấm cúng và tao nhã (Ochitsuita fun'iki) • N3 [Cụm từ] • Phong cách Wabi-Sabi hoặc Vintage Retro Kissaten" }
                            },
                            TargetGrammars = new List<TargetGrammar>
                            {
                                new TargetGrammar { Pattern = "～の産地や風味の特徴を教えていただけますか", Meaning = "Bác có thể giải thích giúp cháu về nguồn gốc và đặc trưng hương vị của... được không ạ? [N + の産地や風味の特徴を教えていただけますか] (Đàm đạo chuyên sâu về cà phê thủ công)", ExampleSentence = "こちらの自家焙煎コーヒー豆の産地と風味の特徴について教えていただけますか。（こちらのじかばいせんこーひーまめのさんちとふうみのとくちょうについておしえていただけますか - Bác chủ quán có thể chia sẻ thêm về xuất xứ và hương vị đặc trưng của loại hạt tự rang này được không ạ?）" },
                                new TargetGrammar { Pattern = "パソコンを使いたいのですが、～をお借りしてもよろしいでしょうか", Meaning = "Cháu muốn dùng máy tính làm việc, cháu xin phép ngồi bàn có... được không ạ? [パソコンを使いたいのですが、N + をお借りしてもよろしいでしょうか] (Xin phép sử dụng không gian làm việc lịch sự)", ExampleSentence = "少し作業をしたいのですが、Wi-Fiのパスワードとコンセントのある席を使わせていただいてもよろしいでしょうか。（すこしさぎょうをしたいのですが、Wi-Fiのパスワードとコンセントのあるせきをつかわせていただいてもよろしいでしょうか - Cháu muốn ngồi làm việc một lát, cháu có thể xin mật khẩu Wi-Fi và ngồi bàn có ổ cắm sạc được không ạ?）" },
                                new TargetGrammar { Pattern = "素晴らしい雰囲気で大変気に入りました、またぜひ伺わせていただきます", Meaning = "Quán có không gian tuyệt vời và cháu rất thích, chắc chắn cháu sẽ còn ghé lại ạ [Lời khen ngợi không gian và hẹn gặp lại] (Giao tiếp kết nối cảm xúc thân thiện với chủ quán)", ExampleSentence = "コーヒーも香り高く、落ち着いた素晴らしい空間ですね。またぜひ立ち寄らせていただきます。（こーひーもかおりたかく、おちついたすばらしいくうかんですね。またぜひたちよらせていただきます - Cà phê đượm hương mà không gian lại tĩnh lặng an yên tuyệt vời quá ạ. Chắc chắn cháu sẽ còn ghé quán nhiều lần nữa.）" }
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
