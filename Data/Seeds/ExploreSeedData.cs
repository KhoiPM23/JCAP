using JCAP.DTOs.Explore;
using JCAP.Models;
using JCAP.Services.Implementations;

namespace JCAP.Data.Seeds
{
    /// <summary>
    /// Nội dung thử của bản đồ Khám phá: 3 chương, 14 mốc (trạng thái Đang dùng), "Một từ ở tỉnh" cho các tỉnh đang mở.
    /// TODO: nội dung mẫu, admin cần kiểm duyệt lại câu tiếng Nhật, cách đọc, bản dịch và cấp độ trước khi dùng thật.
    /// </summary>
    public static class ExploreSeedData
    {
        public const int Chiba = 12;
        public const int Tokyo = 13;
        public const int Kyoto = 26;
        public const int Nara = 29;

        /// <summary>Các tỉnh mở cho người học khi ra mắt; các tỉnh khác đóng ("Sẽ cập nhật trong tương lai").</summary>
        public static readonly int[] OpenPrefectures = { Chiba, Tokyo, Kyoto, Nara };

        public record ChapterSeed(int OrderIndex, string Title, string Description, string MinLevel, string MaxLevel, int[] PrefectureIds);

        public static readonly ChapterSeed[] Chapters =
        {
            new(0, "Chương 0 · Đến Nhật", "Hạ cánh ở sân bay Narita: trả lời nhập cảnh, giới thiệu bản thân, hỏi đường trong sân bay.", "N5", "N5", new[] { Chiba }),
            new(1, "Chương 1 · Tokyo", "Mua sắm, tìm đồ, xin phép, hỏi giờ và gọi món ở thủ đô.", "N5", "N5", new[] { Tokyo }),
            new(2, "Chương 2 · Kyoto – Nara", "Cố đô: mua quà, nhận xét, hỏi đường, nhờ giúp đỡ và kể lại chuyến đi.", "N5", "N4", new[] { Kyoto, Nara }),
        };

        public record LessonSeed(string Level, string Situation, string RealUse, FuriganaSegmentDto[] Sentence, string Meaning, string GrammarNote, int Minutes);

        public record SpotSeed(int PrefectureId, string IconId, string NameVi, string NameJp, string? NameKana, double Lat, double Lon, string Status, LessonSeed Lesson);

        private static FuriganaSegmentDto T(string text) => new() { Text = text };
        private static FuriganaSegmentDto R(string text, string reading) => new() { Text = text, Reading = reading };

        public static readonly SpotSeed[] Spots =
        {
            // ---- Chương 0 · Sân bay Narita (Chiba) ----
            new(Chiba, "X_airport", "Sân bay Narita · Quầy nhập cảnh", "成田空港 入国審査", "なりたくうこう にゅうこくしんさ", 35.7653, 140.3856, ExploreSpotStatus.Published,
                new("N5", "Bạn vừa xuống máy bay. Nhân viên ở quầy nhập cảnh hỏi mục đích chuyến đi của bạn.",
                    "Trả lời câu hỏi 「入国の目的は？」 khi làm thủ tục nhập cảnh.",
                    new[] { R("観光", "かんこう"), T("です。") },
                    "Tôi đi du lịch.", "N です: nói ngắn gọn \"là N\". Đi làm thì nói 「仕事です」, du học thì 「留学です」.", 3)),
            new(Chiba, "X_airport", "Sân bay Narita · Khu nhận hành lý", "成田空港 手荷物受取所", "なりたくうこう てにもつうけとりしょ", 35.7688, 140.3882, ExploreSpotStatus.Published,
                new("N5", "Đang chờ hành lý, bạn cần tìm nhà vệ sinh và hỏi một nhân viên sân bay.",
                    "Hỏi vị trí của bất cứ thứ gì: nhà vệ sinh, quầy đổi tiền, lối ra tàu.",
                    new[] { T("すみません、トイレはどこですか。") },
                    "Xin lỗi, nhà vệ sinh ở đâu ạ?", "N は どこですか: hỏi N ở đâu. Mở đầu bằng 「すみません」 cho lịch sự.", 3)),
            new(Chiba, "X_airport", "Sân bay Narita · Sảnh đến", "成田空港 到着ロビー", "なりたくうこう とうちゃくロビー", 35.7725, 140.3929, ExploreSpotStatus.Published,
                new("N5", "Ở sảnh đến, người đón bạn hỏi bạn từ đâu tới.",
                    "Giới thiệu bản thân với người mới gặp: đồng nghiệp, chủ nhà, bạn học.",
                    new[] { T("ベトナムから"), R("来", "き"), T("ました。") },
                    "Tôi đến từ Việt Nam.", "N から 来ました: đến từ N (quê, nước).", 3)),

            // ---- Chương 1 · Tokyo ----
            new(Tokyo, "P_asakusa", "Asakusa", "浅草", "あさくさ", 35.71472, 139.79675, ExploreSpotStatus.Published,
                new("N5", "Trên phố Nakamise trước chùa Senso-ji, bạn muốn mua một món quà lưu niệm.",
                    "Hỏi giá khi mua hàng ở chợ, cửa hàng lưu niệm.",
                    new[] { T("これはいくらですか。") },
                    "Cái này bao nhiêu tiền?", "これ は いくらですか: hỏi giá món đồ ở gần mình.", 5)),
            new(Tokyo, "P_akihabara", "Akihabara", "秋葉原", "あきはばら", 35.69833, 139.77306, ExploreSpotStatus.Published,
                new("N5", "Điện thoại sắp hết pin, bạn vào một cửa hàng điện tử ở Akihabara.",
                    "Hỏi cửa hàng có bán món mình cần hay không.",
                    new[] { R("充電器", "じゅうでんき"), T("はありますか。") },
                    "Ở đây có bộ sạc không?", "N は ありますか: hỏi có N (đồ vật) không.", 5)),
            new(Tokyo, "P_meiji-jingu", "Đền Minh Trị (Meiji Jingu)", "明治神宮", "めいじじんぐう", 35.67611, 139.69917, ExploreSpotStatus.Published,
                new("N5", "Ở đền Minh Trị, bạn muốn chụp ảnh nhưng không chắc có được phép không.",
                    "Xin phép trước khi làm gì đó ở nơi công cộng, đền chùa, bảo tàng.",
                    new[] { R("写真", "しゃしん"), T("を"), R("撮", "と"), T("ってもいいですか。") },
                    "Tôi chụp ảnh có được không?", "V て も いいですか: xin phép làm V.", 5)),
            new(Tokyo, "P_tokyo-skytree", "Tháp Tokyo Skytree", "東京スカイツリー", "とうきょうスカイツリー", 35.71014, 139.81083, ExploreSpotStatus.Published,
                new("N5", "Bạn muốn lên đài quan sát của Skytree vào buổi tối và hỏi nhân viên giờ đóng cửa.",
                    "Hỏi giờ mở cửa của cửa hàng, bảo tàng, điểm tham quan.",
                    new[] { R("何時", "なんじ"), T("までですか。") },
                    "Mở cửa đến mấy giờ ạ?", "何時 まで ですか: đến mấy giờ. Hỏi giờ bắt đầu thì dùng 「何時から」.", 5)),
            new(Tokyo, "P_toyosu-market", "Chợ Toyosu", "豊洲市場", "とよすしじょう", 35.64567, 139.78564, ExploreSpotStatus.Published,
                new("N5", "Bạn vào một quán sushi trong chợ Toyosu và chưa biết nên gọi món gì.",
                    "Hỏi món gợi ý khi gọi món ở nhà hàng.",
                    new[] { T("おすすめは"), R("何", "なん"), T("ですか。") },
                    "Món nào được gợi ý ạ?", "N は 何ですか: N là gì.", 5)),

            // ---- Chương 2 · Kyoto – Nara ----
            new(Nara, "P_nara-park", "Công viên Nara", "奈良公園", "ならこうえん", 34.68556, 135.84333, ExploreSpotStatus.Published,
                new("N5", "Đàn nai vây quanh bạn ở công viên Nara. Bạn mua một gói bánh cho nai ở quầy bên đường.",
                    "Mua hàng hoặc gọi món, nói rõ số lượng.",
                    new[] { R("鹿", "しか"), T("せんべいを"), R("一", "ひと"), T("つください。") },
                    "Cho tôi một gói bánh cho nai.", "N を 〜つ ください: xin/mua N với số lượng (一つ, 二つ...).", 5)),
            new(Nara, "P_todaiji", "Tượng Đại Phật chùa Todai-ji", "東大寺大仏", "とうだいじだいぶつ", 34.68897, 135.83983, ExploreSpotStatus.Published,
                new("N5", "Đứng trước tượng Đại Phật trong chùa Todai-ji, bạn nói với bạn đồng hành.",
                    "Bày tỏ cảm nhận và tìm sự đồng tình của người cùng đi.",
                    new[] { T("この"), R("大仏", "だいぶつ"), T("はとても"), R("大", "おお"), T("きいですね。") },
                    "Tượng Phật này to thật nhỉ.", "とても + tính từ + ですね: nhận xét và mong người nghe đồng tình.", 5)),
            new(Nara, "P_horyuji", "Chùa Horyu-ji", "法隆寺", "ほうりゅうじ", 34.61474, 135.73417, ExploreSpotStatus.Published,
                new("N4", "Hướng dẫn viên giới thiệu chùa Horyu-ji, công trình gỗ lâu đời bậc nhất thế giới.",
                    "Giới thiệu điều đặc biệt nhất của một nơi, một món đồ.",
                    new[] { R("法隆寺", "ほうりゅうじ"), T("は"), R("世界", "せかい"), T("でいちばん"), R("古", "ふる"), T("い"), R("木", "き"), T("の"), R("建物", "たてもの"), T("です。") },
                    "Horyu-ji là công trình bằng gỗ cổ nhất thế giới.", "N で いちばん + tính từ: nhất trong phạm vi N.", 7)),
            new(Kyoto, "P_fushimi-inari", "Đền Fushimi Inari", "伏見稲荷大社", "ふしみいなりたいしゃ", 34.96694, 135.77306, ExploreSpotStatus.Published,
                new("N4", "Trước con đường hàng nghìn cổng torii, bạn hỏi người địa phương đường lên đỉnh núi mất bao lâu.",
                    "Hỏi thời gian di chuyển trước khi đi bộ, đi tàu, leo núi.",
                    new[] { R("頂上", "ちょうじょう"), T("までどのくらいかかりますか。") },
                    "Lên tới đỉnh mất khoảng bao lâu?", "N まで どのくらい かかりますか: tới N mất bao lâu.", 7)),
            new(Kyoto, "P_kiyomizu", "Chùa Kiyomizu", "清水寺", "きよみずでら", 34.99483, 135.785, ExploreSpotStatus.Published,
                new("N4", "Trên sân gỗ của chùa Kiyomizu, bạn muốn có một tấm ảnh và nhờ người bên cạnh chụp giúp.",
                    "Nhờ người khác làm giúp một việc một cách lịch sự.",
                    new[] { T("すみません、"), R("写真", "しゃしん"), T("を"), R("撮", "と"), T("ってくれませんか。") },
                    "Xin lỗi, bạn chụp ảnh giúp tôi được không?", "V て くれませんか: nhờ ai đó làm V giúp mình.", 7)),
            new(Kyoto, "P_rokuonji", "Chùa Vàng (Kinkaku-ji)", "鹿苑寺（金閣寺）", "ろくおんじ（きんかくじ）", 35.0394, 135.72936, ExploreSpotStatus.Published,
                new("N5", "Tham quan chùa Vàng xong, bạn nhắn tin kể cho bạn bè.",
                    "Kể lại cảm nhận về một nơi đã đến.",
                    new[] { R("金閣寺", "きんかくじ"), T("はとてもきれいでした。") },
                    "Chùa Vàng đẹp lắm.", "Tính từ đuôi な + でした: quá khứ của tính từ đuôi な (きれい → きれいでした).", 5)),

            // Mốc nháp (admin hoàn thiện sau): giữ câu mẫu đã có, chưa hiện với người học
            new(Nara, "N_kiisanchi", "Thánh địa và đường hành hương dãy núi Kii", "紀伊山地の霊場と参詣道", "きいさんちのれいじょうとさんけいみち", 34.3564, 135.8706, ExploreSpotStatus.Draft,
                new("N5", "Bạn đi bộ trên đường hành hương qua núi Yoshino và kể lại cho bạn bè.",
                    "Kể lại việc mình đã làm.",
                    new[] { R("山道", "やまみち"), T("を"), R("歩", "ある"), T("きました。") },
                    "Tôi đã đi bộ trên đường núi.", "N を 歩きました: đã đi bộ (trên/dọc) N.", 5)),
        };

        public record WordSeed(int PrefectureId, string Word, string Kana, string Meaning, string Note);

        public static readonly WordSeed[] Words =
        {
            new(Chiba, "落花生", "らっかせい", "lạc (đậu phộng)", "Chiba là vùng trồng lạc nổi tiếng nhất Nhật Bản."),
            new(Tokyo, "電車", "でんしゃ", "tàu điện", "Tokyo có mạng lưới tàu điện dày đặc, đi tàu là cách di chuyển chính trong thành phố."),
            new(Kyoto, "抹茶", "まっちゃ", "trà xanh bột (matcha)", "Vùng Uji ở Kyoto nổi tiếng với trà xanh và matcha."),
            new(Nara, "鹿", "しか", "con nai", "Nai thả tự do trong công viên Nara."),
        };

        public static ExploreSpot ToEntity(SpotSeed s) => new()
        {
            PrefectureId = s.PrefectureId,
            IconId = s.IconId,
            NameVi = s.NameVi,
            NameJp = s.NameJp,
            NameKana = s.NameKana,
            Latitude = s.Lat,
            Longitude = s.Lon,
            Status = s.Status,
            IsActive = true,
            Lesson = new ExploreSpotLesson
            {
                JLPTLevel = s.Lesson.Level,
                Situation = s.Lesson.Situation,
                RealUse = s.Lesson.RealUse,
                SentenceJson = ExploreSentenceJson.Serialize(s.Lesson.Sentence),
                Meaning = s.Lesson.Meaning,
                GrammarNote = s.Lesson.GrammarNote,
                EstimatedMinutes = s.Lesson.Minutes,
            },
        };
    }
}
