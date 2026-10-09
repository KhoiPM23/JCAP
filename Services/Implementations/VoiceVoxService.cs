using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using JCAP.DTOs.Tts;
using JCAP.Services.Interfaces;

namespace JCAP.Services.Implementations
{
    public class VoiceVoxService : IVoiceVoxService
    {
        private readonly HttpClient _httpClient;
        private readonly ILogger<VoiceVoxService> _logger;
        private readonly string _baseUrl;
        private readonly string _cacheRootPath;

        // In-Memory Audio Cache: Lưu trữ wav bytes đã tổng hợp để tái sử dụng ngay lập tức (0ms)
        private static readonly ConcurrentDictionary<string, byte[]> _audioCache = new(StringComparer.Ordinal);

        private static readonly Dictionary<string, (string Romaji, string Gender, string Region, string Description)> CharacterMetadata = new(StringComparer.OrdinalIgnoreCase)
        {
            ["四国めたん"] = ("Shikoku Metan", "Female", "Vùng Shikoku (Tứ Quốc)", "Nữ sinh thanh lịch, nhân vật đại diện 4 tỉnh vùng Shikoku (Dự án Tohoku Zunko)"),
            ["ずんだもん"] = ("Zundamon", "Mascot", "Vùng Tohoku (Tỉnh Miyagi / Sendai)", "Linh vật đậu nành Zunda nổi tiếng của vùng Đông Bắc (Tohoku/Sendai)"),
            ["春日部つむぎ"] = ("Kasukabe Tsumugi", "Female", "Tỉnh Saitama (Vùng Kanto)", "Nữ VTuber chính thức đại diện quảng bá du lịch và văn hóa tỉnh Saitama"),
            ["雨晴はう"] = ("Amehare Hau", "Female", "Tỉnh Toyama (Vùng Chubu / Hokuriku)", "Nữ y tá vùng duyên hải Ameharashi (Toyama), quảng bá y tế và du lịch địa phương"),
            ["波音リツ"] = ("Namine Ritsu", "Female", "Toàn quốc (Tokyo / UTAU)", "Ca sĩ ảo UTAU nổi tiếng toàn Nhật Bản, giọng trưởng thành, thanh thoát"),
            ["玄野武宏"] = ("Kurono Takehiro", "Male", "Toàn quốc (Tokyo)", "Giọng nam thanh niên trẻ, chuẩn mực, phát âm tiếng Nhật phổ thông chuẩn"),
            ["白上虎太郎"] = ("Shirakami Kotaro", "Male", "Vùng Tohoku (Dãy núi Shirakami / Aomori)", "Thiếu niên đại diện vùng di sản thiên nhiên Shirakami (Aomori/Akita)"),
            ["青山龍星"] = ("Aoyama Ryusei", "Male", "Tokyo (Kanto)", "Giọng nam trầm ấm, đĩnh đạc, chuẩn phong cách phát thanh viên tin tức đài truyền hình"),
            ["冥鳴ひまり"] = ("Meimei Himari", "Female", "Toàn quốc (VTuber độc lập)", "Nữ VTuber hoạt động trực tuyến, giọng nói ngọt ngào, đáng yêu"),
            ["九州そら"] = ("Kyushu Sora", "Female", "Vùng Kyushu (Cửu Châu)", "Người chị dịu dàng, nhân vật đại diện cho 7 tỉnh vùng Kyushu (Dự án Tohoku Zunko)"),
            ["もち子さん"] = ("Mochiko-san", "Female", "Tỉnh Saitama (Kanto)", "Nữ VTuber kiêm người mẫu ảo của Kaname Production (Saitama)"),
            ["剣崎雌雄"] = ("Kenzaki Mesuo", "Male", "Toàn quốc (Tokyo)", "Giọng nam bác sĩ điềm tĩnh, giọng nói ấm áp và đáng tin cậy"),
            ["WhiteCUL"] = ("WhiteCUL", "Female", "Toàn quốc (CUL Project)", "Nữ VTuber thuộc dự án CUL, giọng nói tươi sáng, giàu cảm xúc"),
            ["後鬼"] = ("Goki", "Mascot", "Vùng Kansai (Tỉnh Nara)", "Nhân vật quỷ thần hộ vệ núi thần thoại vùng Nara/Kansai"),
            ["No.7"] = ("No.7", "Female", "Tokyo (Kanto)", "Phát thanh viên chuyên nghiệp đài truyền hình (SEVEN Project, Tokyo)"),
            ["ちび式じい"] = ("Chibi Shiki-jii", "Male", "Vùng Kansai (Kyoto)", "Ông lão thông thái phong cách Âm Dương Sư (Onmyouji) vùng cố đô Kyoto"),
            ["櫻歌ミコ"] = ("Ouka Miko", "Female", "Toàn quốc (UTAU)", "Ca sĩ ảo UTAU bé gái hoa anh đào, phong cách nhí nhảnh, dễ thương"),
            ["小夜/SAYO"] = ("Sayo", "Female", "Toàn quốc", "Giọng nữ trầm tĩnh, nội tâm sâu lắng"),
            ["ナースロボ＿タイプＴ"] = ("Nurse Robot Type T", "Female", "Không gian / Tương lai", "Robot y tá giọng nhẹ nhàng mang âm hưởng công nghệ tương lai"),
            ["†聖騎士 紅桜†"] = ("Seikishi Benisakura", "Male", "Toàn quốc (Tokyo)", "Nam hiệp sĩ giọng kiêu hãnh, phong cách anime chuunibyou"),
            ["雀松朱司"] = ("Wakamatsu Akashi", "Male", "Tỉnh Fukushima (Vùng Tohoku / Aizu)", "Nam cảnh sát chững chạc, lấy cảm hứng từ vùng thành cổ Aizu-Wakamatsu"),
            ["麒ヶ島宗麟"] = ("Kigashima Sourin", "Male", "Tỉnh Oita (Vùng Kyushu / Bungo)", "Lãnh chúa hào sảng, lấy cảm hứng từ Đại danh Otomo Sorin xứ Bungo (Oita, Kyushu)"),
            ["春歌ナナ"] = ("Haruka Nana", "Female", "Toàn quốc (UTAU)", "Ca sĩ ảo UTAU nữ sinh tươi vui, tràn đầy năng lượng"),
            ["猫使アル"] = ("Nekotsuka Al", "Mascot", "Toàn quốc", "Mèo tai thú chị, giọng nữ dễ thương (Nhóm Hako)"),
            ["猫使ビィ"] = ("Nekotsuka Bi", "Mascot", "Toàn quốc", "Mèo tai thú em, giọng nhỏ nhẹ, rụt rè (Nhóm Hako)"),
            ["中国うさぎ"] = ("Chugoku Usagi", "Mascot", "Vùng Chugoku (Trung Quốc / Hiroshima)", "Thỏ tiên, nhân vật đại diện cho 5 tỉnh vùng Chugoku (Dự án Tohoku Zunko)"),
            ["栗田まろん"] = ("Kurita Maron", "Male", "Tỉnh Nagano (Vùng Chubu)", "Thiếu niên hiền lành, liên quan đến vùng hạt dẻ Obuse (Nagano)"),
            ["あいえるたん"] = ("IL-tan", "Female", "Tokyo & Hokkaido", "Linh vật công nghệ của công ty phần mềm Infinity Loop (Sapporo & Tokyo)"),
            ["満別花丸"] = ("Manbetsu Hanamaru", "Female", "Hokkaido (Vùng Mombetsu)", "Bé gái học sinh tiểu học đại diện cho vùng biển Mombetsu (Hokkaido)"),
            ["琴詠ニア"] = ("Kotoyomi Near", "Female", "Toàn quốc", "Thiếu nữ trí tuệ nhân tạo AI thông minh, hiện đại"),
            ["Voidoll"] = ("Voidoll", "Mascot", "Thế giới ảo (Game #COMPASS)", "Robot trí tuệ nhân tạo quản lý thế giới ảo trong game #COMPASS"),
            ["ぞん子"] = ("Zonko", "Female", "Tokyo (Kanto)", "Nữ VTuber Zombie đại diện thương hiệu ZONe Energy"),
            ["中部つるぎ"] = ("Chubu Tsurugi", "Male", "Vùng Chubu (Trung Bộ / Nagoya)", "Nam sinh nhiệt tình, nhân vật đại diện cho các tỉnh vùng Chubu"),
            ["離途"] = ("Rito", "Male", "Toàn quốc", "Giọng nam nghiêm túc, điềm đạm, cuốn hút"),
            ["黒沢冴白"] = ("Kurosawa Sahaku", "Male", "Toàn quốc", "Giọng nam lịch lãm, phong nhã"),
            ["ユーレイちゃん"] = ("Yurei-chan", "Female", "Toàn quốc", "Ma nữ ngọt ngào, giọng thì thầm nhẹ tênh"),
            ["東北ずん子"] = ("Tohoku Zunko", "Female", "Vùng Tohoku (Tỉnh Miyagi / Sendai)", "Nhân vật trung tâm Dự án Đông Bắc (Tohoku Zunko), phát âm chuẩn Tokyo/Sendai"),
            ["東北きりたん"] = ("Tohoku Kiritan", "Female", "Vùng Tohoku (Tỉnh Akita)", "Em út trong 3 chị em Tohoku, đại diện món đặc sản Kiritanpo tỉnh Akita"),
            ["東北イタコ"] = ("Tohoku Itako", "Female", "Vùng Tohoku (Tỉnh Aomori)", "Chị cả trong 3 chị em Tohoku, lấy cảm hứng từ Itako núi Osorezan (Aomori)"),
            ["あんこもん"] = ("Ankomon", "Mascot", "Vùng Tohoku (Tỉnh Miyagi / Sendai)", "Linh vật đậu đỏ Anko đối trọng với Zundamon ở vùng Tohoku"),
            ["夜語トバリ"] = ("Yogatari Tobari", "Female", "Toàn quốc", "Giọng nữ trầm lắng, huyền bí, phong cách đêm muộn"),
            ["暁記ミタマ"] = ("Akatoki Mitama", "Female", "Vùng Kansai", "Nữ thần linh trang nghiêm, thanh khiết"),
            ["里石ユカ"] = ("Satoishi Yuka", "Female", "Toàn quốc", "Giọng nữ mộc mạc, tự nhiên và thuần khiết")
        };

        public VoiceVoxService(
            IHttpClientFactory httpClientFactory,
            IConfiguration configuration,
            IWebHostEnvironment environment,
            ILogger<VoiceVoxService> logger)
        {
            _logger = logger;
            _baseUrl = configuration["VoiceVox:BaseUrl"] ?? "http://127.0.0.1:50021";
            _httpClient = httpClientFactory.CreateClient();
            _httpClient.BaseAddress = new Uri(_baseUrl);
            _httpClient.Timeout = TimeSpan.FromSeconds(20);

            var webRoot = !string.IsNullOrEmpty(environment.WebRootPath)
                ? environment.WebRootPath
                : Path.Combine(environment.ContentRootPath, "wwwroot");

            _cacheRootPath = Path.Combine(webRoot, "audio-cache", "voicevox");
            try
            {
                if (!Directory.Exists(_cacheRootPath))
                {
                    Directory.CreateDirectory(_cacheRootPath);
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Không thể khởi tạo thư mục Persistent Audio Cache tại: {Path}", _cacheRootPath);
            }
        }

        public async Task<List<FlattenedVoiceDto>> GetAvailableVoicesAsync(CancellationToken cancellationToken = default)
        {
            try
            {
                var response = await _httpClient.GetAsync("/speakers", cancellationToken);
                response.EnsureSuccessStatusCode();

                var json = await response.Content.ReadAsStringAsync(cancellationToken);
                var rawSpeakers = JsonSerializer.Deserialize<List<VoiceSpeakerDto>>(json, new JsonSerializerOptions
                {
                    PropertyNameCaseInsensitive = true
                }) ?? new List<VoiceSpeakerDto>();

                var flattened = new List<FlattenedVoiceDto>();
                foreach (var speaker in rawSpeakers)
                {
                    var hasMeta = CharacterMetadata.TryGetValue(speaker.Name, out var meta);
                    var romaji = hasMeta ? meta.Romaji : speaker.Name;
                    var gender = hasMeta ? meta.Gender : "Female";
                    var region = hasMeta ? meta.Region : "Toàn quốc";
                    var description = hasMeta ? meta.Description : string.Empty;

                    foreach (var style in speaker.Styles)
                    {
                        var viStyle = TranslateStyle(style.Name);
                        flattened.Add(new FlattenedVoiceDto
                        {
                            Id = style.Id,
                            SpeakerName = speaker.Name,
                            RomajiName = romaji,
                            Gender = gender,
                            Region = region,
                            Description = description,
                            StyleName = style.Name,
                            StyleVietnamese = viStyle,
                            SpeakerUuid = speaker.SpeakerUuid
                        });
                    }
                }

                return flattened;
            }
            catch (HttpRequestException ex)
            {
                _logger.LogWarning("Không thể kết nối đến VOICEVOX Engine tại {BaseUrl}: {Message}", _baseUrl, ex.Message);
                throw new InvalidOperationException("VOICEVOX Engine is not running. Vui lòng đảm bảo VOICEVOX đang chạy ở port 50021.", ex);
            }
        }

        private static string ComputeTextHash(string text)
        {
            var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(text));
            return Convert.ToHexString(bytes).ToLowerInvariant();
        }

        public async Task<byte[]> SynthesizeAsync(string text, int speakerId, CancellationToken cancellationToken = default)
        {
            if (string.IsNullOrWhiteSpace(text))
            {
                throw new ArgumentException("Nội dung text không được để trống.", nameof(text));
            }

            var trimmedText = text.Trim();
            var cacheKey = $"{speakerId}:{trimmedText}";

            // 1. Kiểm tra RAM Cache (0ms latency)
            if (_audioCache.TryGetValue(cacheKey, out var cachedBytes))
            {
                _logger.LogInformation("Phát audio VOICEVOX từ RAM Cache (0ms): speaker={SpeakerId}, text={Text}", speakerId, trimmedText);
                return cachedBytes;
            }

            // 2. Kiểm tra Persistent Disk Cache trên thư mục wwwroot (1-3ms latency, tồn tại vĩnh viễn qua mọi lần restart)
            var textHash = ComputeTextHash(trimmedText);
            var speakerDir = Path.Combine(_cacheRootPath, speakerId.ToString());
            var diskFilePath = Path.Combine(speakerDir, $"{textHash}.wav");

            if (File.Exists(diskFilePath))
            {
                try
                {
                    var diskBytes = await File.ReadAllBytesAsync(diskFilePath, cancellationToken);
                    _audioCache[cacheKey] = diskBytes;
                    _logger.LogInformation("Phát audio VOICEVOX từ Persistent Disk Cache (wwwroot): speaker={SpeakerId}, file={File}", speakerId, diskFilePath);
                    return diskBytes;
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Lỗi đọc file disk cache {FilePath}, sẽ chuyển sang tổng hợp lại từ VOICEVOX", diskFilePath);
                }
            }

            // 3. Nếu chưa có trên RAM và Ổ đĩa -> Gọi VOICEVOX Engine tổng hợp 1 lần duy nhất
            try
            {
                // Bước 1: Gọi audio_query
                var escapedText = Uri.EscapeDataString(trimmedText);
                var queryUrl = $"/audio_query?text={escapedText}&speaker={speakerId}";
                var queryResponse = await _httpClient.PostAsync(queryUrl, null, cancellationToken);
                if (!queryResponse.IsSuccessStatusCode)
                {
                    var errorDetail = await queryResponse.Content.ReadAsStringAsync(cancellationToken);
                    _logger.LogError("VOICEVOX audio_query failed ({StatusCode}): {Detail}", queryResponse.StatusCode, errorDetail);
                    throw new InvalidOperationException($"VOICEVOX audio_query thất bại ({queryResponse.StatusCode}): {errorDetail}");
                }

                var queryJson = await queryResponse.Content.ReadAsStringAsync(cancellationToken);

                // Bước 2: Gọi synthesis tạo âm thanh WAV
                var synthesisUrl = $"/synthesis?speaker={speakerId}";
                using var content = new StringContent(queryJson, Encoding.UTF8, "application/json");
                var synthesisResponse = await _httpClient.PostAsync(synthesisUrl, content, cancellationToken);
                if (!synthesisResponse.IsSuccessStatusCode)
                {
                    var errorDetail = await synthesisResponse.Content.ReadAsStringAsync(cancellationToken);
                    _logger.LogError("VOICEVOX synthesis failed ({StatusCode}): {Detail}", synthesisResponse.StatusCode, errorDetail);
                    throw new InvalidOperationException($"VOICEVOX synthesis thất bại ({synthesisResponse.StatusCode}): {errorDetail}");
                }

                var wavBytes = await synthesisResponse.Content.ReadAsByteArrayAsync(cancellationToken);

                // 4. Lưu đồng thời vào RAM Cache và Persistent Disk Cache
                _audioCache[cacheKey] = wavBytes;

                try
                {
                    if (!Directory.Exists(speakerDir))
                    {
                        Directory.CreateDirectory(speakerDir);
                    }
                    await File.WriteAllBytesAsync(diskFilePath, wavBytes, cancellationToken);
                    _logger.LogInformation("Đã lưu audio VOICEVOX vào Persistent Disk Cache: {FilePath}", diskFilePath);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Không thể lưu audio vào disk cache: {FilePath}", diskFilePath);
                }

                return wavBytes;
            }
            catch (HttpRequestException ex)
            {
                _logger.LogWarning("Mất kết nối tới VOICEVOX Engine tại {BaseUrl}: {Message}", _baseUrl, ex.Message);
                throw new InvalidOperationException("VOICEVOX Engine is not running. Vui lòng đảm bảo VOICEVOX đang chạy ở port 50021.", ex);
            }
        }

        private static string TranslateStyle(string styleName)
        {
            return styleName switch
            {
                "ノーマル" => "Tiêu chuẩn (Normal)",
                "あまあま" => "Ngọt ngào (Sweet)",
                "ツンツン" => "Sắc sảo (Tsuntsun)",
                "セクシー" => "Quyến rũ (Sexy)",
                "ささやき" => "Thì thầm (Whisper)",
                "ヒソヒソ" => "Nói nhỏ (Murmur)",
                "ヘロヘロ" => "Mệt mỏi (Exhausted)",
                "なみだめ" => "Rưng rưng (Tearful)",
                "クイーン" => "Quý phái (Queen)",
                "喜び" => "Vui tươi (Joyful)",
                "ツンギレ" => "Hờn dỗi (Tsundere)",
                "悲しみ" or "かなしみ" => "U buồn (Sad)",
                "ふつう" => "Bình thường (Normal)",
                "わーい" => "Reo vui (Excited)",
                "びくびく" => "Rụt rè (Timid)",
                "おこ" or "怒り" => "Bực tức (Angry)",
                "びえーん" or "泣き" => "Khóc mếu (Crying)",
                "熱血" => "Nhiệt huyết (Passionate)",
                "不機嫌" => "Khó chịu (Displeased)",
                "しっとり" => "Trầm lắng (Calm)",
                "囁き" => "Thì thầm (Whisper)",
                "セクシー／あん子" => "Trầm ấm (Sexy)",
                "のんびり" => "Thư thái (Relaxed)",
                "アナウンス" => "Phát thanh (Announcer)",
                "読み聞かせ" => "Kể chuyện (Storytelling)",
                "人間ver." => "Người thật (Human)",
                "ぬいぐるみver." => "Gấu bông (Plushie)",
                "第二形態" => "Biến hình 2 (Form 2)",
                "ロリ" => "Trẻ con (Loli)",
                "楽々" => "Thoải mái (Comfortable)",
                "恐怖" => "Lo sợ (Fearful)",
                "内緒話" => "Tâm sự kín (Secret)",
                "おちつき" => "Điềm đạm (Calm)",
                "うきうき" => "Phấn khởi (Cheerful)",
                "つよつよ" => "Mạnh mẽ (Strong)",
                "へろへろ" or "よわよわ" => "Yếu ớt (Weak)",
                "人見知り" => "E dè (Shy)",
                "おどろき" => "Ngạc nhiên (Surprised)",
                "こわがり" => "Nhút nhát (Frightened)",
                "元気" => "Khỏe khoắn (Energetic)",
                "ぶりっ子" => "Nũng nịu (Coquettish)",
                "ボーイ" => "Bé trai (Boy)",
                "低血圧" => "Uể oải (Low Energy)",
                "覚醒" => "Thức tỉnh (Awakened)",
                "実況風" => "Bình luận (Caster)",
                "おどおど" => "Lúng túng (Nervous)",
                "絶望と敗北" => "Tuyệt vọng (Despair)",
                "シリアス" => "Nghiêm túc (Serious)",
                "甘々" => "Ngọt ngào (Sweet)",
                "哀しみ" => "Bi thương (Sorrowful)",
                "ツクモちゃん" => "Tsukumo-chan (Cute)",
                "けだるげ" => "Uể oải (Languid)",
                "明るい" => "Tươi sáng (Bright)",
                "呆れ" => "Ngán ngẩm (Apathetic)",
                "つぼみ" => "Chớm nở (Bud)",
                _ => styleName
            };
        }
    }
}

