using System;
using System.Text;

namespace JCAP.Services.Implementations
{
    public sealed class WavFormatException : Exception
    {
        public string Code { get; }
        public WavFormatException(string code, string message) : base(message) => Code = code;
    }

    /// <summary>
    /// Đọc WAV PCM 16-bit little-endian mono.
    /// - <see cref="ReadMono16k"/> (bản ghi của người học): đòi đúng 16 kHz và cố ý KHÔNG tự chuyển đổi; nếu client resample sai
    ///   thì từ chối (UNSUPPORTED_WAV_FORMAT) thay vì phân tích dữ liệu sai tốc độ.
    /// - <see cref="ReadMonoAnyRate"/> + <see cref="ResampleTo16k"/> (audio mẫu do chính backend tạo): nhận mọi tần số rồi hạ về 16 kHz.
    /// </summary>
    public static class WavPcmReader
    {
        public const int ExpectedSampleRate = 16000;

        public static float[] ReadMono16k(byte[] wav)
        {
            var samples = ReadMonoAnyRate(wav, out var sampleRate);
            if (sampleRate != ExpectedSampleRate)
            {
                throw new WavFormatException("UNSUPPORTED_WAV_FORMAT",
                    $"Cần PCM 16-bit mono {ExpectedSampleRate} Hz (nhận {sampleRate} Hz).");
            }
            return samples;
        }

        /// <summary>WAV PCM 16-bit mono ở tần số bất kỳ.</summary>
        public static float[] ReadMonoAnyRate(byte[] wav, out int sampleRate)
        {
            sampleRate = 0;
            if (wav == null || wav.Length < 44 ||
                Encoding.ASCII.GetString(wav, 0, 4) != "RIFF" || Encoding.ASCII.GetString(wav, 8, 4) != "WAVE")
            {
                throw new WavFormatException("INVALID_WAV", "Không phải tệp WAV hợp lệ.");
            }

            int pos = 12;
            int channels = 0, bits = 0, format = 0, rate = 0;
            bool haveFmt = false;
            while (pos + 8 <= wav.Length)
            {
                var id = Encoding.ASCII.GetString(wav, pos, 4);
                long size = BitConverter.ToUInt32(wav, pos + 4);
                int body = pos + 8;

                if (id == "fmt ")
                {
                    if (size < 16 || body + 16 > wav.Length)
                        throw new WavFormatException("INVALID_WAV", "Khối fmt bị hỏng.");
                    format = BitConverter.ToUInt16(wav, body);
                    channels = BitConverter.ToUInt16(wav, body + 2);
                    rate = (int)BitConverter.ToUInt32(wav, body + 4);
                    bits = BitConverter.ToUInt16(wav, body + 14);
                    haveFmt = true;
                }
                else if (id == "data")
                {
                    if (!haveFmt) throw new WavFormatException("INVALID_WAV", "Thiếu khối fmt trước khối data.");
                    if (format != 1 || bits != 16 || channels != 1 || rate < 8000 || rate > 96000)
                    {
                        throw new WavFormatException("UNSUPPORTED_WAV_FORMAT",
                            $"Cần PCM 16-bit mono (nhận format={format}, {channels} kênh, {rate} Hz, {bits} bit).");
                    }

                    // Một số bộ ghi để size = 0/0xFFFFFFFF khi streaming: lấy phần còn lại của tệp.
                    long available = wav.Length - body;
                    long length = (size == 0 || size > available) ? available : size;
                    int count = (int)(length / 2);
                    var samples = new float[count];
                    for (int i = 0; i < count; i++)
                    {
                        samples[i] = BitConverter.ToInt16(wav, body + i * 2) / 32768f;
                    }
                    sampleRate = rate;
                    return samples;
                }

                // Khối chunk được căn chẵn byte.
                pos = body + (int)Math.Min(size + (size & 1), int.MaxValue - body);
            }

            throw new WavFormatException("INVALID_WAV", "Không tìm thấy khối data.");
        }

        /// <summary>
        /// Hạ/nâng về 16 kHz bằng nội suy tuyến tính (kèm lấy trung bình khi hạ tần số để giảm răng cưa).
        /// Chỉ dùng cho phân tích năng lượng/VAD, không dùng cho phân tích phổ.
        /// </summary>
        public static float[] ResampleTo16k(float[] samples, int sampleRate)
        {
            if (sampleRate == ExpectedSampleRate) return samples;

            var outLen = (int)((long)samples.Length * ExpectedSampleRate / sampleRate);
            var result = new float[outLen];
            double ratio = (double)sampleRate / ExpectedSampleRate; // > 1 khi hạ tần số
            for (int i = 0; i < outLen; i++)
            {
                double center = i * ratio;
                double lo = Math.Max(0, center - ratio / 2);
                double hi = Math.Min(samples.Length - 1, center + ratio / 2);
                int a = (int)Math.Floor(lo), b = (int)Math.Ceiling(hi);
                double sum = 0; int n = 0;
                for (int k = a; k <= b; k++) { sum += samples[k]; n++; }
                result[i] = n == 0 ? 0 : (float)(sum / n);
            }
            return result;
        }
    }
}
