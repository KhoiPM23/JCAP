using System;
using System.Collections.Concurrent;
using System.Linq;
using System.Net.Http;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using JCAP.Services.Interfaces;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace JCAP.Services.Implementations
{
    /// <summary>
    /// Cách đọc đầy đủ theo NGỮ CẢNH (G2P của OpenJTalk) lấy từ engine VOICEVOX mà dự án đã dùng cho TTS
    /// (/audio_query). Xử lý được mọi chữ Hán, okurigana và cách đọc theo ngữ cảnh (何 → なん/なに, は → わ, を → お).
    /// Không dùng được (engine tắt, quá chậm) thì trả null để comparer chuyển sang nguồn offline.
    /// </summary>
    public sealed class VoiceVoxKanaReader : IKanaReader
    {
        public const string Id = "voicevox";
        public string SourceId => Id;

        private const int MaxCacheEntries = 5000;
        // Engine VOICEVOX xử lý tuần tự: /audio_query phải xếp hàng sau các yêu cầu tổng hợp giọng (TTS). Đo thực: ~40 ms khi rảnh,
        // ~19 s khi đang có 4 yêu cầu TTS. Vì vậy chờ đủ lâu; cách triệt để là dùng engine riêng (Shadowing:Reading:BaseUrl).
        private const int DefaultTimeoutMs = 10000;
        private static readonly TimeSpan BreakerOpenFor = TimeSpan.FromSeconds(60);

        // Cache theo văn bản: cách đọc của cùng một chuỗi là xác định.
        private static readonly ConcurrentDictionary<string, KanaReading> Cache = new();
        private static readonly ConcurrentDictionary<string, Lazy<Task<KanaReading?>>> InFlight = new();
        // Ngắt mạch đơn giản: engine không dùng được thì bỏ qua trong 60 giây để không làm chậm mọi lượt chấm.
        private static long _breakerOpenUntilTicks;

        private readonly HttpClient _httpClient;
        private readonly IConfiguration _configuration;
        private readonly ILogger<VoiceVoxKanaReader> _logger;

        /// <summary>Chỉ dùng cho test: xóa cache và đóng ngắt mạch (trạng thái này là static theo thiết kế).</summary>
        internal static void ResetStateForTests()
        {
            Cache.Clear();
            InFlight.Clear();
            Interlocked.Exchange(ref _breakerOpenUntilTicks, 0);
        }

        public VoiceVoxKanaReader(HttpClient httpClient, IConfiguration configuration, ILogger<VoiceVoxKanaReader> logger)
        {
            _httpClient = httpClient;
            _configuration = configuration;
            _logger = logger;
        }

        public async Task<KanaReading?> TryReadAsync(string text, CancellationToken cancellationToken = default)
        {
            if (_configuration.GetValue<bool?>("Shadowing:Reading:UseVoiceVox") == false) return null;

            var normalized = JapaneseMora.Normalize(text);
            if (normalized.Length == 0) return new KanaReading { Source = Id };
            if (Cache.TryGetValue(normalized, out var cached)) return cached;
            if (DateTime.UtcNow.Ticks < Interlocked.Read(ref _breakerOpenUntilTicks)) return null;

            // Gộp các yêu cầu cùng văn bản đang chạy (vd. nhiều người học cùng luyện một câu): chỉ gọi engine một lần,
            // các yêu cầu sau chờ chính kết quả đó.
            var lazy = InFlight.GetOrAdd(normalized, key => new Lazy<Task<KanaReading?>>(() => FetchAsync(key)));
            try
            {
                return await lazy.Value.WaitAsync(cancellationToken);
            }
            finally
            {
                if (lazy.Value.IsCompleted) InFlight.TryRemove(new KeyValuePair<string, Lazy<Task<KanaReading?>>>(normalized, lazy));
            }
        }

        /// <summary>Gọi engine một lần cho một văn bản. Chỉ chịu giới hạn thời gian, không phụ thuộc người gọi (kết quả được chia sẻ).</summary>
        private async Task<KanaReading?> FetchAsync(string normalized)
        {
            // Nên trỏ tới một engine RIÊNG cho việc lấy cách đọc để không tranh với TTS; mặc định dùng chung engine TTS.
            var baseUrl = (_configuration["Shadowing:Reading:BaseUrl"] ?? _configuration["VoiceVox:BaseUrl"] ?? "http://127.0.0.1:50021").TrimEnd('/');
            var speaker = _configuration.GetValue<int?>("Shadowing:Reading:Speaker") ?? 1;
            var timeoutMs = _configuration.GetValue<int?>("Shadowing:Reading:TimeoutMs") ?? DefaultTimeoutMs;

            using var cts = new CancellationTokenSource(timeoutMs);

            try
            {
                using var request = new HttpRequestMessage(
                    HttpMethod.Post,
                    $"{baseUrl}/audio_query?text={Uri.EscapeDataString(normalized)}&speaker={speaker}");
                using var response = await _httpClient.SendAsync(request, cts.Token);
                if (!response.IsSuccessStatusCode)
                {
                    _logger.LogWarning("VOICEVOX audio_query trả HTTP {Status}; lượt này không chấm được.", (int)response.StatusCode);
                    return null;
                }

                var body = await response.Content.ReadAsStringAsync(cts.Token);
                var reading = Parse(body);
                if (reading == null) return null;

                if (Cache.Count >= MaxCacheEntries) Cache.Clear();
                Cache[normalized] = reading;
                return reading;
            }
            catch (OperationCanceledException)
            {
                // Chậm (thường do engine đang bận tổng hợp giọng) KHÔNG có nghĩa là engine hỏng: không ngắt mạch,
                // để lượt kế tiếp vẫn được thử. Chỉ lỗi kết nối mới ngắt mạch.
                _logger.LogWarning("VOICEVOX audio_query quá {Timeout} ms (engine có thể đang bận TTS); lượt này không chấm được.", timeoutMs);
                return null;
            }
            catch (HttpRequestException ex)
            {
                OpenBreaker(ex.GetType().Name);
                return null;
            }
            catch (JsonException)
            {
                _logger.LogWarning("VOICEVOX audio_query trả dữ liệu không đọc được; lượt này không chấm được.");
                return null;
            }
        }

        private void OpenBreaker(string reason)
        {
            Interlocked.Exchange(ref _breakerOpenUntilTicks, (DateTime.UtcNow + BreakerOpenFor).Ticks);
            _logger.LogWarning("VOICEVOX không dùng được ({Reason}); bỏ qua trong {Seconds}s (các lượt chấm trả \"chưa chấm được\" ngay).", reason, (int)BreakerOpenFor.TotalSeconds);
        }

        /// <summary>accent_phrases[].moras[].text (katakana từng mora; bỏ qua pause_mora).</summary>
        internal static KanaReading? Parse(string json)
        {
            using var doc = JsonDocument.Parse(json);
            if (!doc.RootElement.TryGetProperty("accent_phrases", out var phrases) || phrases.ValueKind != JsonValueKind.Array)
                return null;

            // Mỗi accent phrase là một TỪ (từ + trợ từ gắn liền): giữ ranh giới để chấm theo từ.
            var phraseKanas = new List<string>();
            foreach (var phrase in phrases.EnumerateArray())
            {
                if (!phrase.TryGetProperty("moras", out var moras) || moras.ValueKind != JsonValueKind.Array) continue;
                var kana = new System.Text.StringBuilder();
                foreach (var mora in moras.EnumerateArray())
                {
                    if (mora.TryGetProperty("text", out var t) && t.ValueKind == JsonValueKind.String)
                        kana.Append(t.GetString());
                }
                if (kana.Length > 0) phraseKanas.Add(kana.ToString());
            }

            // G2P ghi trường âm bằng nguyên âm lặp (きれえ, がっこお): hiển thị bằng kana thông dụng; chuẩn hóa trong từng từ.
            var list = JapaneseMora.FromKanaPhrases(phraseKanas, preserveLongVowelSpelling: false, out var starts);
            if (list.Count == 0) return null;
            return new KanaReading
            {
                Moras = list,
                UnresolvedCount = list.Count(m => m.IsUnresolved),
                Source = Id,
                WordStarts = starts,
            };
        }
    }
}
