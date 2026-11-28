using JCAP.Data;
using JCAP.DTOs.Common;
using JCAP.DTOs.Roleplay;
using JCAP.DTOs.Scenario;
using JCAP.Models;
using JCAP.Services.Interfaces;
using JCAP.Services.Subscriptions;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using System.Collections.Concurrent;
using System.Diagnostics;
using System.Text;
using System.Text.Json;

namespace JCAP.Services.Implementations;

public partial class RoleplaySessionService : IRoleplaySessionService
{
    internal static string ResolveNpcCode(string? scenarioCode, int scenarioId, int? levelConfigId = null)
    {
        if (!string.IsNullOrWhiteSpace(scenarioCode))
        {
            return scenarioCode.Trim();
        }
        if (scenarioId > 0)
        {
            return $"SCN_{scenarioId}";
        }
        if (levelConfigId.HasValue && levelConfigId.Value > 0)
        {
            return $"NPC_{levelConfigId.Value}";
        }
        return "NPC_DEFAULT";
    }

    private static string ExtractDominantWeakness(string? inferredTraitsJson)
    {
        if (string.IsNullOrWhiteSpace(inferredTraitsJson))
        {
            return "Balanced";
        }
        try
        {
            using var doc = JsonDocument.Parse(inferredTraitsJson);
            if (doc.RootElement.TryGetProperty("dominantWeaknessCategory", out var prop))
            {
                return prop.GetString() ?? "Balanced";
            }
        }
        catch { }
        return "Balanced";
    }

    private static string BuildProfileAdaptationSummary(LearnerIntelligenceProfile profile)
    {
        var cues = new List<string>();
        if (profile.SpeakingReflexIndex < 55 || profile.AverageMoraRate < 3.4)
        {
            cues.Add("nói chậm rõ câu ngắn");
        }
        if (profile.ParticleAccuracyRate < 70)
        {
            cues.Add("giúp tái hiện tự nhiên trợ từ は/が/に/で");
        }
        if (profile.KeigoCommandScore < 65)
        {
            cues.Add("khuyến khích dùng Desu/Masu tự nhiên");
        }
        if (profile.HintDependencyRate > 35)
        {
            cues.Add("tạo khoảng mở dễ trả lời để giảm phụ thuộc gợi ý");
        }
        if (cues.Count == 0 && profile.CommunicativeProficiencyIndex >= 82)
        {
            cues.Add("có thể thử thách câu hỏi mở rộng tự nhiên");
        }
        return cues.Count == 0 ? string.Empty : string.Join(", ", cues);
    }

    private static double ComputeJapaneseSimilarity(string actual, string sample)
    {
        static string Normalize(string text)
        {
            if (string.IsNullOrWhiteSpace(text)) return string.Empty;
            var sb = new StringBuilder(text.Length);
            foreach (var ch in text.Trim())
            {
                if (!char.IsWhiteSpace(ch) && ch != '。' && ch != '、' && ch != '！' && ch != '？' && ch != '.' && ch != ',' && ch != '!' && ch != '?')
                {
                    sb.Append(ch);
                }
            }
            return sb.ToString();
        }

        var a = Normalize(actual);
        var b = Normalize(sample);
        if (a.Length == 0 || b.Length == 0) return 0.0;
        if (string.Equals(a, b, StringComparison.Ordinal)) return 1.0;

        int n = a.Length;
        int m = b.Length;
        var prev = new int[m + 1];
        var curr = new int[m + 1];
        for (int j = 0; j <= m; j++) prev[j] = j;

        for (int i = 1; i <= n; i++)
        {
            curr[0] = i;
            for (int j = 1; j <= m; j++)
            {
                int cost = a[i - 1] == b[j - 1] ? 0 : 1;
                curr[j] = Math.Min(Math.Min(curr[j - 1] + 1, prev[j] + 1), prev[j - 1] + cost);
            }
            Array.Copy(curr, prev, m + 1);
        }

        int maxLen = Math.Max(n, m);
        return maxLen == 0 ? 1.0 : Math.Clamp(1.0 - (double)prev[m] / maxLen, 0.0, 1.0);
    }

    private static readonly System.Text.Json.JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase,
        Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping
    };

    private static LinguisticFeedbackDto? ParseFeedback(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return null;
        try
        {
            return System.Text.Json.JsonSerializer.Deserialize<LinguisticFeedbackDto>(json, JsonOptions);
        }
        catch
        {
            return null;
        }
    }

    internal static string ResolveSceneType(string? scenarioCode, string? title, string? aiPersona)
    {
        var code = (scenarioCode ?? string.Empty).ToUpperInvariant();
        if (code.Contains("TRANSIT") || code.Contains("STATION") || code.Contains("SHINJUKU")) return "train";
        if (code.Contains("KONBINI") || code.Contains("STORE") || code.Contains("RETAIL")) return "konbini";
        if (code.Contains("OFFICE") || code.Contains("INTERVIEW") || code.Contains("BUSINESS")) return "office";
        if (code.Contains("CAFE") || code.Contains("COFFEE")) return "cafe";
        if (code.Contains("RAMEN") || code.Contains("IZAKAYA") || code.Contains("RESTAURANT")) return "ramen";

        var text = $"{title} {aiPersona}".ToLowerInvariant();
        if (text.Contains("ga") || text.Contains("tàu") || text.Contains("vé tàu") || text.Contains("shinkansen")) return "train";
        if (text.Contains("tiện lợi") || text.Contains("konbini") || text.Contains("siêu thị") || text.Contains("thu ngân")) return "konbini";
        if (text.Contains("phỏng vấn") || text.Contains("công sở") || text.Contains("văn phòng") || text.Contains("công ty")) return "office";
        if (text.Contains("cafe") || text.Contains("cà phê") || text.Contains("quán trà")) return "cafe";
        if (text.Contains("chùa") || text.Contains("đền") || text.Contains("onsen") || text.Contains("ryokan")) return "zen";
        if (text.Contains("bác sĩ") || text.Contains("bệnh viện") || text.Contains("khám")) return "medical";

        return "ramen";
    }

    private static string ExtractMissionTarget(string? criteriaJson)
    {
        if (string.IsNullOrWhiteSpace(criteriaJson)) return string.Empty;
        try
        {
            using var doc = JsonDocument.Parse(criteriaJson);
            if (doc.RootElement.TryGetProperty("target", out var targetProp))
            {
                return targetProp.GetString() ?? string.Empty;
            }
        }
        catch
        {
            // Ignore parse errors
        }
        return string.Empty;
    }

    /// <summary>
    /// Kiểm tra xem người dùng có gói tháng còn đủ hạn mức quota 5 giờ và 7 ngày cho số credit cần dùng hay không.
    /// Chỉ đếm các giao dịch Deduct thuộc gói tháng (CoveredBySubscription = true hoặc Description bắt đầu bằng "[Gói tháng]").
    /// </summary>
    private async Task<(bool Available, string ErrorMessage)> CheckSubscriptionQuotaAvailableAsync(
        ApplicationUser user,
        int requiredCredits,
        CancellationToken cancellationToken = default)
    {
        var now = DateTime.UtcNow;
        var fiveHoursAgo = now.AddHours(-5);
        var sevenDaysAgo = now.AddDays(-7);

        var plan = SubscriptionPlanCatalog.FindOrDefault(user.SubscriptionPlanId);

        var subDeductQuery = _dbContext.CreditTransactions
            .AsNoTracking()
            .Where(t => t.UserId == user.Id
                && t.Type == "Deduct"
                && (t.CoveredBySubscription || (t.Description != null && t.Description.StartsWith("[Gói tháng]"))));

        var used5h = await subDeductQuery
            .Where(t => t.CreatedAt >= fiveHoursAgo)
            .SumAsync(t => -t.Amount, cancellationToken);

        if (used5h + requiredCredits > plan.FiveHourQuota)
        {
            return (false, $"Bạn đã sử dụng hết hạn ngạch 5 giờ ({used5h}/{plan.FiveHourQuota} credits) của {plan.Name}. Vui lòng chờ hạn ngạch hồi phục hoặc nạp thêm credit dự phòng.");
        }

        var usedWeek = await subDeductQuery
            .Where(t => t.CreatedAt >= sevenDaysAgo)
            .SumAsync(t => -t.Amount, cancellationToken);

        if (usedWeek + requiredCredits > plan.WeeklyQuota)
        {
            return (false, $"Bạn đã sử dụng hết hạn ngạch tuần ({usedWeek}/{plan.WeeklyQuota} credits) của {plan.Name}. Vui lòng chờ hạn ngạch hồi phục hoặc nạp thêm credit dự phòng.");
        }

        return (true, string.Empty);
    }

    private const int LowCreditWarningThreshold = 5;
    private const int LowSubscriptionQuotaWarningThreshold = 5;

    /// <summary>
    /// Tính toán hạn mức token gói tháng còn lại và thông báo cảnh báo số dư / hạn mức cho phòng hội thoại:
    /// - Nếu có gói tháng và token gói tháng chưa hết (> 5 token): KHÔNG cảnh báo gì kể cả khi CreditBalance = 0 xu.
    /// - Nếu có gói tháng và token gói tháng sắp hết (1..5 token): Cảnh báo gói tháng sắp hết token.
    /// - Nếu không có gói tháng (hoặc gói tháng đã hết token) và CreditBalance còn 1..5 xu: Cảnh báo sắp hết xu.
    /// - Nếu không có gói tháng (hoặc gói tháng đã hết token) và CreditBalance &lt;= 0: Thông báo không đủ tiền để trò chuyện.
    /// </summary>
    private async Task<(int? RemainingQuota, bool IsQuotaExhausted, string? WarningMessage)> EvaluateCreditAndQuotaStatusAsync(
        ApplicationUser? user,
        bool isAdmin,
        bool hasActiveSubscription,
        CancellationToken cancellationToken = default)
    {
        if (user == null || isAdmin)
        {
            return (null, false, null);
        }

        if (hasActiveSubscription)
        {
            var now = DateTime.UtcNow;
            var fiveHoursAgo = now.AddHours(-5);
            var sevenDaysAgo = now.AddDays(-7);
            var plan = SubscriptionPlanCatalog.FindOrDefault(user.SubscriptionPlanId);

            var subDeductQuery = _dbContext.CreditTransactions
                .AsNoTracking()
                .Where(t => t.UserId == user.Id
                    && t.Type == "Deduct"
                    && (t.CoveredBySubscription || (t.Description != null && t.Description.StartsWith("[Gói tháng]"))));

            var used5h = await subDeductQuery
                .Where(t => t.CreatedAt >= fiveHoursAgo)
                .SumAsync(t => -t.Amount, cancellationToken);

            var usedWeek = await subDeductQuery
                .Where(t => t.CreatedAt >= sevenDaysAgo)
                .SumAsync(t => -t.Amount, cancellationToken);

            int rem5h = Math.Max(0, plan.FiveHourQuota - used5h);
            int remWeek = Math.Max(0, plan.WeeklyQuota - usedWeek);
            int remainingQuota = Math.Min(rem5h, remWeek);
            bool isExhausted = remainingQuota <= 0;

            if (!isExhausted)
            {
                // Khi token gói tháng vẫn còn (> 5), tuyệt đối không thông báo gì kể cả khi CreditBalance == 0 xu
                if (remainingQuota <= LowSubscriptionQuotaWarningThreshold)
                {
                    return (remainingQuota, false,
                        $"Gói tháng ({plan.Name}) của bạn sắp hết token trong chu kỳ này (còn {remainingQuota} token).");
                }

                return (remainingQuota, false, null);
            }

            // Gói tháng đã hết sạch token trong chu kỳ -> kiểm tra xu lẻ dự phòng (CreditBalance)
            if (user.CreditBalance <= 0)
            {
                return (0, true,
                    $"Bạn đã dùng hết hạn ngạch token của {plan.Name} và số dư xu dự phòng là 0 xu. Vui lòng chờ hạn ngạch hồi phục hoặc nạp thêm Credit để trò chuyện.");
            }

            if (user.CreditBalance <= LowCreditWarningThreshold)
            {
                return (0, true,
                    $"Token gói tháng đã hết, hệ thống đang dùng xu dự phòng và bạn sắp hết xu (chỉ còn {user.CreditBalance} xu). Vui lòng nạp thêm Credit.");
            }

            return (0, true, null);
        }

        // Không có gói tháng -> chỉ dùng CreditBalance
        if (user.CreditBalance <= 0)
        {
            return (null, false,
                "Bạn chưa có đủ Credit (0 xu). Mặc dù bước khởi tạo kịch bản là miễn phí, việc trò chuyện với AI có tính phí — vui lòng nạp thêm Credit hoặc đăng ký Gói tháng để bắt đầu hội thoại.");
        }

        if (user.CreditBalance <= LowCreditWarningThreshold)
        {
            return (null, false,
                $"Số dư Credit của bạn sắp hết (chỉ còn {user.CreditBalance} xu). Vui lòng nạp thêm Credit hoặc đăng ký Gói tháng để cuộc trò chuyện không bị gián đoạn.");
        }

        return (null, false, null);
    }

    internal static int ComputeMoraCount(string? japaneseText, string? furiganaHtml = null)
    {
        var source = !string.IsNullOrWhiteSpace(furiganaHtml)
            ? furiganaHtml
            : RoleplaySocialRegister.GenerateFuriganaHtml(japaneseText ?? string.Empty);

        if (string.IsNullOrWhiteSpace(source)) return 0;

        var kanaOnly = System.Text.RegularExpressions.Regex.Replace(
            source,
            @"<ruby[^>]*>.*?<rt[^>]*>(.*?)(?:</rt>|(?=</ruby>)).*?</ruby>",
            "$1",
            System.Text.RegularExpressions.RegexOptions.IgnoreCase | System.Text.RegularExpressions.RegexOptions.Singleline);
        kanaOnly = RoleplaySocialRegister.StripRubyTags(kanaOnly);

        return JapaneseMora.FromKana(kanaOnly).Count;
    }

    private static double? TryAnalyzeWavMoraRate(string? audioUrl, int moraCount)
    {
        if (moraCount <= 0 || string.IsNullOrWhiteSpace(audioUrl)) return null;
        var cleanUrl = audioUrl.Split('?', '#')[0].Trim();
        if (!cleanUrl.StartsWith("/audio/", StringComparison.OrdinalIgnoreCase)
            || !cleanUrl.EndsWith(".wav", StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }

        try
        {
            var webRoot = Path.GetFullPath(Path.Combine(Directory.GetCurrentDirectory(), "wwwroot"));
            var relativePath = cleanUrl.TrimStart('/').Replace('/', Path.DirectorySeparatorChar);
            var fullPath = Path.GetFullPath(Path.Combine(webRoot, relativePath));
            if (!fullPath.StartsWith(webRoot + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)
                || !File.Exists(fullPath))
            {
                return null;
            }

            var wavBytes = File.ReadAllBytes(fullPath);
            var metrics = new FluencyAnalyzer().AnalyzeAnyRate(wavBytes, moraCount);
            if (string.Equals(metrics.Status, "available", StringComparison.OrdinalIgnoreCase)
                && metrics.SpeakingRateMoraPerSec is > 0)
            {
                return Math.Round(metrics.SpeakingRateMoraPerSec.Value, 1);
            }
        }
        catch
        {
            // Non-fatal: fall back to deterministic mora / duration calculation
        }

        return null;
    }

    private async Task<PhonemeRecognitionResult?> AnalyzeAudioPhonemesAsync(
        string audioUrl,
        CancellationToken cancellationToken)
    {
        if (_phonemeRecognizer == null || !_phonemeRecognizer.IsAvailable || string.IsNullOrWhiteSpace(audioUrl))
        {
            return null;
        }

        var cleanUrl = audioUrl.Split('?', '#')[0].Trim();
        if (!cleanUrl.StartsWith("/audio/roleplay/", StringComparison.OrdinalIgnoreCase)
            || cleanUrl.Contains("..", StringComparison.Ordinal))
        {
            return null;
        }

        try
        {
            var webRoot = Path.GetFullPath(
                _webHostEnvironment?.WebRootPath
                ?? Path.Combine(_webHostEnvironment?.ContentRootPath ?? Directory.GetCurrentDirectory(), "wwwroot"));
            var relativePath = cleanUrl.TrimStart('/').Replace('/', Path.DirectorySeparatorChar);
            var fullPath = Path.GetFullPath(Path.Combine(webRoot, relativePath));
            if (!fullPath.StartsWith(webRoot + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)
                || !File.Exists(fullPath))
            {
                return null;
            }

            float[] samples16k;
            if (cleanUrl.EndsWith(".wav", StringComparison.OrdinalIgnoreCase))
            {
                var wavBytes = await File.ReadAllBytesAsync(fullPath, cancellationToken);
                samples16k = WavPcmReader.ReadMono16k(wavBytes);
            }
            else
            {
                var wavBytes = await ConvertAudioToWav16kViaFfmpegAsync(fullPath, cancellationToken);
                if (wavBytes == null || wavBytes.Length < 44) return null;
                samples16k = WavPcmReader.ReadMono16k(wavBytes);
            }

            if (samples16k.Length < 1600) return null; // < 0.1s
            return _phonemeRecognizer.Recognize(samples16k);
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "Không thể chạy nhận dạng âm vị ONNX cho file {AudioUrl}", cleanUrl);
            return null;
        }
    }

    private static async Task<byte[]?> ConvertAudioToWav16kViaFfmpegAsync(
        string inputPath,
        CancellationToken cancellationToken)
    {
        try
        {
            using var cts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            cts.CancelAfter(TimeSpan.FromMilliseconds(1800));

            var psi = new ProcessStartInfo
            {
                FileName = "ffmpeg",
                Arguments = $"-nostdin -loglevel error -y -i \"{inputPath}\" -ar 16000 -ac 1 -f wav pipe:1",
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true
            };

            using var process = Process.Start(psi);
            if (process == null) return null;

            using var ms = new MemoryStream();
            var copyTask = process.StandardOutput.BaseStream.CopyToAsync(ms, cts.Token);
            await process.WaitForExitAsync(cts.Token);
            await copyTask;

            return process.ExitCode == 0 ? ms.ToArray() : null;
        }
        catch
        {
            return null;
        }
    }

    internal static List<string>? AlignPronunciationIssues(
        string? furiganaHtml,
        string userMessageText,
        PhonemeRecognitionResult phonemeResult)
    {
        if (phonemeResult.LogProbabilities.Length == 0 || phonemeResult.Labels.Count == 0)
        {
            return null;
        }

        var source = !string.IsNullOrWhiteSpace(furiganaHtml) && furiganaHtml.Contains("<rt", StringComparison.OrdinalIgnoreCase)
            ? furiganaHtml
            : RoleplaySocialRegister.GenerateFuriganaHtml(userMessageText);

        var kana = System.Text.RegularExpressions.Regex.Replace(
            source,
            @"<ruby[^>]*>.*?<rt[^>]*>(.*?)(?:</rt>|(?=</ruby>)).*?</ruby>",
            "$1",
            System.Text.RegularExpressions.RegexOptions.IgnoreCase | System.Text.RegularExpressions.RegexOptions.Singleline);
        kana = RoleplaySocialRegister.StripRubyTags(kana);

        var moras = JapaneseMora.FromKana(kana, preserveLongVowelSpelling: false);
        if (moras.Count < 2) return null;

        var aligned = PronunciationAligner.Align(moras, phonemeResult.LogProbabilities, phonemeResult.Labels);
        if (aligned == null || aligned.IsMismatch) return null;

        var issues = new List<string>();
        foreach (var m in aligned.Moras)
        {
            if (string.Equals(m.Kind, "ok", StringComparison.OrdinalIgnoreCase)) continue;

            var desc = m.Kind switch
            {
                "missing" => $"Có thể bạn đã đọc lướt hoặc thiếu âm '{m.Target}'",
                "short" => $"Cần kéo dài trường âm ở '{m.Target}'",
                "sokuon" => "Cần ngắt hơi rõ hơn ở âm ngắt (っ)",
                "extra_long" => $"Không cần kéo dài thêm trường âm sau '{m.Target}'",
                _ when !string.IsNullOrWhiteSpace(m.Heard) && !string.Equals(m.Target, m.Heard, StringComparison.Ordinal)
                    => $"Âm '{m.Target}' nghe hơi giống '{m.Heard}'",
                _ => null
            };

            if (!string.IsNullOrWhiteSpace(desc) && !issues.Contains(desc))
            {
                issues.Add(desc);
                if (issues.Count >= 2) break;
            }
        }

        return issues.Count > 0 ? issues : null;
    }

    /// <summary>
    /// Ước lượng số credit cần trừ dựa trên độ dài câu nói người học, câu thoại AI và độ sâu ngữ cảnh (1..4 credits/lượt).
    /// </summary>
    internal static int EstimateCreditCost(string? userMessage, string? aiReply, int userTurnCount)
    {
        int userLen = string.IsNullOrWhiteSpace(userMessage) ? 0 : userMessage.Trim().Length;
        int aiLen = string.IsNullOrWhiteSpace(aiReply) ? 0 : aiReply.Trim().Length;
        int volumeCost = (int)Math.Ceiling((userLen + aiLen) / 50.0);
        int contextDepth = userTurnCount <= 5 ? 0 : (userTurnCount <= 12 ? 1 : 2);
        return Math.Clamp(1 + volumeCost + contextDepth, 1, 4);
    }
}
