using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using JCAP.DTOs.Shadowing;
using JCAP.Services.Interfaces;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace JCAP.Services.Implementations
{
    public class GeminiShadowingAssessmentService : IAiShadowingAssessmentService
    {
        private readonly HttpClient _httpClient;
        private readonly IConfiguration _configuration;
        private readonly ILogger<GeminiShadowingAssessmentService> _logger;

        private static readonly JsonSerializerOptions JsonOptions = new()
        {
            PropertyNameCaseInsensitive = true,
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase
        };

        public GeminiShadowingAssessmentService(
            HttpClient httpClient,
            IConfiguration configuration,
            ILogger<GeminiShadowingAssessmentService> logger)
        {
            _httpClient = httpClient;
            _configuration = configuration;
            _logger = logger;
        }

        public async Task<ShadowingAudioEvaluationResponseDto?> EvaluateAudioAsync(
            Stream audioStream,
            string mimeType,
            string targetText,
            CancellationToken cancellationToken = default)
        {
            // 1. Kiểm tra tính hợp lệ cơ bản của dữ liệu âm thanh đầu vào
            if (audioStream == null)
            {
                return new ShadowingAudioEvaluationResponseDto
                {
                    EvaluationStatus = "unavailable",
                    ErrorCode = "EMPTY_AUDIO",
                    ErrorMessage = "Không tìm thấy luồng âm thanh đầu vào."
                };
            }

            using var memoryStream = new MemoryStream();
            await audioStream.CopyToAsync(memoryStream, cancellationToken);
            var audioBytes = memoryStream.ToArray();

            // Nếu file audio quá nhỏ (< 800 bytes, tương đương < 300ms) -> Không thể có tiếng nói hợp lệ
            if (audioBytes.Length < 800)
            {
                return new ShadowingAudioEvaluationResponseDto
                {
                    EvaluationStatus = "unavailable",
                    ErrorCode = "AUDIO_TOO_SHORT",
                    ErrorMessage = "Bản ghi âm quá ngắn hoặc chưa thu được tiếng nói."
                };
            }

            var apiKey = _configuration["Gemini:ApiKey"];
            var model = _configuration["Gemini:AudioModel"] ?? "gemini-1.5-flash";

            // Nếu chưa cấu hình API Key, trả về trạng thái partial để Client kích hoạt Local Fallback
            if (string.IsNullOrWhiteSpace(apiKey))
            {
                _logger.LogInformation("Gemini:ApiKey chưa được cấu hình. Trả về trạng thái Partial để kích hoạt Local Assessment.");
                return new ShadowingAudioEvaluationResponseDto
                {
                    EvaluationStatus = "partial",
                    Source = "client_fallback",
                    ErrorCode = "AI_KEY_NOT_CONFIGURED",
                    ErrorMessage = "Dịch vụ AI chưa cấu hình API Key, sử dụng bộ đối soát ngữ âm cục bộ."
                };
            }

            try
            {
                var base64Audio = Convert.ToBase64String(audioBytes);
                var cleanMimeType = string.IsNullOrWhiteSpace(mimeType) ? "audio/webm" : mimeType.Split(';')[0].Trim();

                var systemInstruction = @"You are a specialized Japanese pronunciation and speech assessor for an EdTech Shadowing learning platform.
Your task is to listen to the attached audio of a Japanese language learner and evaluate their spoken accuracy against the target Japanese sentence.

EVALUATION RULES:
1. SILENCE / NOISE DETECTION: If the recording contains no audible human speech, only silence, or only loud background noise, set ""noSpeech"": true.
2. VERBATIM TRANSCRIPTION: Transcribe exactly what the learner pronounced into Japanese text in ""recognizedText"".
3. SCRIPT AGNOSTIC: Do not penalize differences purely in Japanese writing script if pronunciation is identical:
   - Target '一人' and spoken 'ひとり' -> Exactly identical pronunciation, correct!
   - Target 'カウンター' and spoken 'かうんたー' -> Exactly identical pronunciation, correct!
4. DISCREPANCY IDENTIFICATION:
   - Put missing words/chunks from targetText in ""missingWords"".
   - Put mispronounced words, wrong particles (e.g. に vs へ), or substitutions in ""mismatchedWords"".
5. CONSTRUCTIVE FEEDBACK: Provide 1-2 concise, encouraging sentences in Vietnamese highlighting what was good and any particle/sound to polish.

OUTPUT FORMAT:
Return strictly valid pure JSON matching:
{
  ""noSpeech"": false,
  ""recognizedText"": ""<verbatim Japanese transcript>"",
  ""missingWords"": [""word1""],
  ""mismatchedWords"": [""word2""],
  ""feedback"": ""<constructive feedback in Vietnamese>""
}";

                var userPrompt = $"Target Japanese Sentence to Shadow:\n\"{targetText}\"\n\nPlease analyze the attached learner audio recording against this target sentence and return the JSON evaluation.";

                var endpoint = $"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={apiKey}";

                var requestBody = new
                {
                    systemInstruction = new
                    {
                        parts = new[] { new { text = systemInstruction } }
                    },
                    contents = new[]
                    {
                        new
                        {
                            role = "user",
                            parts = new object[]
                            {
                                new
                                {
                                    inlineData = new
                                    {
                                        mimeType = cleanMimeType,
                                        data = base64Audio
                                    }
                                },
                                new
                                {
                                    text = userPrompt
                                }
                            }
                        }
                    },
                    generationConfig = new
                    {
                        temperature = 0.2,
                        responseMimeType = "application/json"
                    }
                };

                var json = JsonSerializer.Serialize(requestBody, JsonOptions);
                using var content = new StringContent(json, Encoding.UTF8, "application/json");

                using var timeoutCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
                timeoutCts.CancelAfter(TimeSpan.FromSeconds(6));

                var response = await _httpClient.PostAsync(endpoint, content, timeoutCts.Token);
                var responseString = await response.Content.ReadAsStringAsync(cancellationToken);

                if (!response.IsSuccessStatusCode)
                {
                    _logger.LogWarning("Gemini Audio Assessment thất bại (status {StatusCode}): {Response}", response.StatusCode, responseString);
                    return new ShadowingAudioEvaluationResponseDto
                    {
                        EvaluationStatus = "partial",
                        Source = "client_fallback",
                        ErrorCode = $"HTTP_{response.StatusCode}",
                        ErrorMessage = "Máy chủ AI phản hồi lỗi, chuyển sang bộ đánh giá cục bộ."
                    };
                }

                using var doc = JsonDocument.Parse(responseString);
                var candidates = doc.RootElement.GetProperty("candidates");
                if (candidates.GetArrayLength() > 0)
                {
                    var parts = candidates[0].GetProperty("content").GetProperty("parts");
                    if (parts.GetArrayLength() > 0)
                    {
                        var jsonText = parts[0].GetProperty("text").GetString() ?? "";
                        if (!string.IsNullOrWhiteSpace(jsonText))
                        {
                            using var parsedDoc = JsonDocument.Parse(jsonText);
                            var root = parsedDoc.RootElement;

                            var noSpeech = root.TryGetProperty("noSpeech", out var nsProp) && nsProp.GetBoolean();
                            var recognized = root.TryGetProperty("recognizedText", out var recProp) ? recProp.GetString() ?? "" : "";

                            if (noSpeech || string.IsNullOrWhiteSpace(recognized))
                            {
                                return new ShadowingAudioEvaluationResponseDto
                                {
                                    EvaluationStatus = "unavailable",
                                    ErrorCode = "NO_SPEECH_DETECTED",
                                    ErrorMessage = "Không phát hiện thấy câu thoại rõ ràng trong bản ghi âm."
                                };
                            }

                            var missingWords = new List<string>();
                            if (root.TryGetProperty("missingWords", out var mwProp) && mwProp.ValueKind == JsonValueKind.Array)
                            {
                                missingWords = mwProp.EnumerateArray().Select(x => x.GetString() ?? "").Where(s => !string.IsNullOrEmpty(s)).ToList();
                            }

                            var mismatchedWords = new List<string>();
                            if (root.TryGetProperty("mismatchedWords", out var mmwProp) && mmwProp.ValueKind == JsonValueKind.Array)
                            {
                                mismatchedWords = mmwProp.EnumerateArray().Select(x => x.GetString() ?? "").Where(s => !string.IsNullOrEmpty(s)).ToList();
                            }

                            var feedback = root.TryGetProperty("feedback", out var fbProp) ? fbProp.GetString() ?? "" : "";

                            // Tính Content Match Score khoa học dựa trên số lỗi phát hiện
                            var totalErrors = missingWords.Count + mismatchedWords.Count;
                            var estimatedWordCount = Math.Max(1, targetText.Length / 2);
                            var calculatedMatch = Math.Max(0, Math.Min(100, (int)Math.Round((1.0 - (double)totalErrors / estimatedWordCount) * 100)));
                            if (totalErrors == 0) calculatedMatch = 100;

                            var fluencyScore = 88; // Điểm lưu loát cơ sở, client sẽ kết hợp chỉ số ngắt nghỉ vật lý
                            var overall = calculatedMatch == 0 ? 0 : (calculatedMatch < 30 ? Math.Min(calculatedMatch, (int)Math.Round(calculatedMatch * 0.60 + fluencyScore * 0.40)) : (int)Math.Round(calculatedMatch * 0.60 + fluencyScore * 0.40));
                            var tier = overall >= 80 ? "green" : overall >= 65 ? "yellow" : "red";

                            return new ShadowingAudioEvaluationResponseDto
                            {
                                EvaluationStatus = "completed",
                                RecognizedText = recognized.Trim(),
                                ContentMatchScore = calculatedMatch,
                                PronunciationScore = null, // Trung thực: Không bịa điểm cao độ khi chưa có công cụ chuyên dụng
                                FluencyScore = fluencyScore,
                                OverallScore = overall,
                                Tier = tier,
                                Feedback = feedback,
                                MissingWords = missingWords,
                                MismatchedWords = mismatchedWords,
                                Source = "gemini"
                            };
                        }
                    }
                }
            }
            catch (TaskCanceledException)
            {
                _logger.LogWarning("Gemini Audio Assessment bị timeout (quá 6s). Kích hoạt Client Fallback.");
                return new ShadowingAudioEvaluationResponseDto
                {
                    EvaluationStatus = "partial",
                    Source = "client_fallback",
                    ErrorCode = "AI_TIMEOUT",
                    ErrorMessage = "Kết nối đến máy chủ AI bị quá thời gian. Sử dụng bộ đánh giá nội bộ."
                };
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Lỗi ngoại lệ khi gọi Gemini Audio Assessment.");
                return new ShadowingAudioEvaluationResponseDto
                {
                    EvaluationStatus = "partial",
                    Source = "client_fallback",
                    ErrorCode = "AI_EXCEPTION",
                    ErrorMessage = ex.Message
                };
            }

            return new ShadowingAudioEvaluationResponseDto
            {
                EvaluationStatus = "partial",
                Source = "client_fallback",
                ErrorCode = "UNKNOWN_ERROR",
                ErrorMessage = "Không thể phân tích bằng AI, chuyển sang đánh giá cục bộ."
            };
        }
    }
}

