using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Text.Json;
using JCAP.Services.Interfaces;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.ML.OnnxRuntime;
using Microsoft.ML.OnnxRuntime.Tensors;

namespace JCAP.Services.Implementations
{
    /// <summary>
    /// Nhận dạng âm vị bằng mô hình HuBERT phoneme-CTC tiếng Nhật (ONNX, chạy CPU trong backend).
    /// Nạp mô hình MỘT lần (singleton, nạp lười ở lần dùng đầu); InferenceSession.Run an toàn khi gọi song song.
    /// Thiếu tệp mô hình hoặc tắt bằng cấu hình thì IsAvailable = false và hệ thống chấm như trước, không lỗi.
    ///
    /// Cấu hình: `Shadowing:Phoneme:Enabled` (mặc định true), `Shadowing:Phoneme:ModelPath`, `Shadowing:Phoneme:VocabPath`
    /// (mặc định models/phoneme/… tính từ thư mục gốc dự án; tải bằng scripts/download-speech-models.*).
    /// </summary>
    public sealed class OnnxPhonemeRecognizer : IPhonemeRecognizer, IDisposable
    {
        public const int SampleRate = 16000;
        /// <summary>HuBERT base: mỗi khung đầu ra ứng với 320 mẫu (20 ms).</summary>
        public const int FrameMs = 20;
        private const int MaxSeconds = 30;
        private const int BlankId = 0; // PAD làm nhãn trống của CTC

        private readonly ILogger<OnnxPhonemeRecognizer> _logger;
        private readonly Lazy<(InferenceSession Session, string[] Labels, string InputName)?> _model;

        public OnnxPhonemeRecognizer(IConfiguration configuration, IHostEnvironment environment, ILogger<OnnxPhonemeRecognizer> logger)
        {
            _logger = logger;
            var enabled = configuration.GetValue<bool?>("Shadowing:Phoneme:Enabled") ?? true;
            var modelPath = Resolve(environment.ContentRootPath, configuration["Shadowing:Phoneme:ModelPath"] ?? "models/phoneme/model_quantized.onnx");
            var vocabPath = Resolve(environment.ContentRootPath, configuration["Shadowing:Phoneme:VocabPath"] ?? "models/phoneme/vocab.json");
            _model = new Lazy<(InferenceSession, string[], string)?>(() => enabled ? Load(modelPath, vocabPath) : null);
        }

        /// <summary>Dùng trong kiểm thử: nạp thẳng từ đường dẫn.</summary>
        public OnnxPhonemeRecognizer(string modelPath, string vocabPath, ILogger<OnnxPhonemeRecognizer> logger)
        {
            _logger = logger;
            _model = new Lazy<(InferenceSession, string[], string)?>(() => Load(modelPath, vocabPath));
        }

        public bool IsAvailable => _model.Value != null;

        public PhonemeRecognitionResult? Recognize(float[] samples16k) => Recognize(samples16k, Preprocessing);

        /// <summary>Xử lý trước khi nhận dạng (mặc định; chỉnh được để so sánh trong bộ kiểm thử).</summary>
        public PhonemePreprocessing Preprocessing { get; init; } = PhonemePreprocessing.Default;

        internal PhonemeRecognitionResult? Recognize(float[] samples16k, PhonemePreprocessing preprocessing)
        {
            var model = _model.Value;
            if (model == null) return null;
            if (samples16k.Length < SampleRate / 10) return new PhonemeRecognitionResult { FrameMs = FrameMs };

            var (session, labels, inputName) = model.Value;
            var prepared = preprocessing.Apply(samples16k);
            if (prepared.Length < SampleRate / 10) return new PhonemeRecognitionResult { FrameMs = FrameMs };
            var samples = prepared.Length > SampleRate * MaxSeconds ? prepared[..(SampleRate * MaxSeconds)] : prepared;

            var watch = Stopwatch.StartNew();
            var input = new DenseTensor<float>(samples, new[] { 1, samples.Length });
            using var outputs = session.Run(new[] { NamedOnnxValue.CreateFromTensor(inputName, input) });
            var logits = outputs.First().AsTensor<float>();
            watch.Stop();

            var phonemes = Decode(logits, labels);
            return new PhonemeRecognitionResult
            {
                Phonemes = phonemes,
                Kana = PhonemeKana.ToKana(phonemes.Select(p => p.Label)),
                FrameMs = FrameMs,
                ElapsedMs = watch.Elapsed.TotalMilliseconds,
                LogProbabilities = LogSoftmax(logits),
                Labels = labels,
            };
        }

        internal static float[][] LogSoftmax(Tensor<float> logits)
        {
            int frames = logits.Dimensions[1], classes = logits.Dimensions[2];
            var result = new float[frames][];
            for (int f = 0; f < frames; f++)
            {
                float max = float.NegativeInfinity;
                for (int c = 0; c < classes; c++) max = Math.Max(max, logits[0, f, c]);
                double sum = 0;
                for (int c = 0; c < classes; c++) sum += Math.Exp(logits[0, f, c] - max);
                var logSum = max + Math.Log(sum);
                var row = new float[classes];
                for (int c = 0; c < classes; c++) row[c] = (float)(logits[0, f, c] - logSum);
                result[f] = row;
            }
            return result;
        }

        /// <summary>
        /// Giải mã CTC tham lam: nhãn mạnh nhất từng khung, gộp các khung liền nhau cùng nhãn, bỏ nhãn trống.
        /// Độ tự tin = xác suất softmax trung bình của nhãn đó trên các khung của nó.
        /// </summary>
        internal static List<RecognizedPhoneme> Decode(Tensor<float> logits, string[] labels)
        {
            int frames = logits.Dimensions[1], classes = logits.Dimensions[2];
            var result = new List<RecognizedPhoneme>();

            int runId = -1, runStart = 0;
            double runProbSum = 0;
            void Flush(int endFrame)
            {
                if (runId > BlankId && runId < labels.Length && !string.IsNullOrEmpty(labels[runId]))
                {
                    var count = endFrame - runStart;
                    result.Add(new RecognizedPhoneme(labels[runId], runStart * FrameMs, endFrame * FrameMs, Math.Round(runProbSum / count, 3)));
                }
            }

            for (int f = 0; f < frames; f++)
            {
                int best = 0;
                float bestLogit = float.NegativeInfinity, max = float.NegativeInfinity;
                for (int c = 0; c < classes; c++)
                {
                    var v = logits[0, f, c];
                    if (v > bestLogit) { bestLogit = v; best = c; }
                    if (v > max) max = v;
                }
                double sum = 0;
                for (int c = 0; c < classes; c++) sum += Math.Exp(logits[0, f, c] - max);
                var prob = Math.Exp(bestLogit - max) / sum;

                if (best != runId)
                {
                    Flush(f);
                    runId = best;
                    runStart = f;
                    runProbSum = 0;
                }
                runProbSum += prob;
            }
            Flush(frames);
            return result;
        }

        private (InferenceSession, string[], string)? Load(string modelPath, string vocabPath)
        {
            if (!File.Exists(modelPath) || !File.Exists(vocabPath))
            {
                _logger.LogWarning(
                    "Không tìm thấy mô hình nhận dạng âm vị ({Model}); phần nhận dạng âm vị bị tắt. Chạy scripts/download-speech-models để tải.",
                    modelPath);
                return null;
            }

            try
            {
                var vocab = JsonSerializer.Deserialize<Dictionary<string, int>>(File.ReadAllText(vocabPath)) ?? new();
                var labels = new string[vocab.Count == 0 ? 0 : vocab.Values.Max() + 1];
                foreach (var (label, id) in vocab) labels[id] = label;

                var options = new Microsoft.ML.OnnxRuntime.SessionOptions { GraphOptimizationLevel = GraphOptimizationLevel.ORT_ENABLE_ALL };
                var session = new InferenceSession(modelPath, options);
                var inputName = session.InputMetadata.Keys.First();
                _logger.LogInformation("Đã nạp mô hình nhận dạng âm vị ({Labels} nhãn).", labels.Length);
                return (session, labels, inputName);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Không nạp được mô hình nhận dạng âm vị; phần này bị tắt.");
                return null;
            }
        }

        private static string Resolve(string root, string path) => Path.IsPathRooted(path) ? path : Path.Combine(root, path);

        public void Dispose()
        {
            if (_model.IsValueCreated && _model.Value is { } m) m.Session.Dispose();
        }
    }
}
