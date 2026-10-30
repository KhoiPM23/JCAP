using System.Text;

namespace JCAP.Tests.Services;

/// <summary>Tín hiệu tổng hợp cho test nhịp nói. KHÔNG phải giọng người thật.</summary>
public static class TestAudio
{
    public static float[] Sine(int ms, double amplitude = 0.3, double hz = 180, int sr = 16000)
    {
        var n = sr * ms / 1000;
        var data = new float[n];
        for (int i = 0; i < n; i++) data[i] = (float)(amplitude * Math.Sin(2 * Math.PI * hz * i / sr));
        return data;
    }

    /// <summary>
    /// Nhiễu nền có seed cố định cho MỖI lần gọi: không dùng chung một Random tĩnh vì xUnit chạy các lớp test song song,
    /// thứ tự lấy số sẽ thay đổi giữa các lần chạy và làm kết quả chập chờn.
    /// </summary>
    public static float[] Noise(int ms, double amplitude = 0.0005, int sr = 16000, int seed = 7)
    {
        var rng = new Random(seed);
        var n = sr * ms / 1000;
        var data = new float[n];
        for (int i = 0; i < n; i++) data[i] = (float)((rng.NextDouble() * 2 - 1) * amplitude);
        return data;
    }

    public static float[] Zeros(int ms, int sr = 16000) => new float[sr * ms / 1000];

    public static float[] Cat(params float[][] parts) => parts.SelectMany(p => p).ToArray();

    public static byte[] Wav(float[] samples, int sampleRate = 16000, short channels = 1, short bits = 16)
    {
        var dataLen = samples.Length * 2;
        using var ms = new MemoryStream();
        using var w = new BinaryWriter(ms, Encoding.ASCII, leaveOpen: true);
        w.Write(Encoding.ASCII.GetBytes("RIFF"));
        w.Write(36 + dataLen);
        w.Write(Encoding.ASCII.GetBytes("WAVE"));
        w.Write(Encoding.ASCII.GetBytes("fmt "));
        w.Write(16);
        w.Write((short)1);
        w.Write(channels);
        w.Write(sampleRate);
        w.Write(sampleRate * channels * bits / 8);
        w.Write((short)(channels * bits / 8));
        w.Write(bits);
        w.Write(Encoding.ASCII.GetBytes("data"));
        w.Write(dataLen);
        foreach (var s in samples) w.Write((short)Math.Clamp(s * 32767, -32768, 32767));
        w.Flush();
        return ms.ToArray();
    }

    /// <summary>
    /// Câu mẫu giả: nền 300 ms, đoạn nói 1000 ms, khoảng dừng 300 ms (như dấu 。), đoạn nói 1200 ms, nền 300 ms.
    /// <paramref name="speed"/> &gt; 1 là chậm hơn (kéo giãn đoạn nói); khoảng dừng giữ nguyên.
    /// </summary>
    public static float[] Utterance(double speed = 1.0, int pauseMs = 300, int sr = 16000)
    {
        int Ms(int baseMs) => (int)Math.Round(baseMs * speed);
        return Cat(Noise(300, sr: sr), Sine(Ms(1000), sr: sr), Noise(pauseMs, sr: sr), Sine(Ms(1200), sr: sr), Noise(300, sr: sr));
    }
}
