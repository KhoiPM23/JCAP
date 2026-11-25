using System;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Configuration;

namespace JCAP.Services.Implementations
{
    /// <summary>
    /// Giới hạn số lượt nhận dạng âm vị chạy ĐỒNG THỜI (mô hình chạy CPU, mỗi lượt ~0.1–0.5 s), để nhiều người chấm cùng lúc
    /// không làm nghẽn máy chủ. Chờ quá hạn thì lượt đó trả SERVER_BUSY (chưa chấm được), không xếp hàng vô hạn.
    /// Singleton. Cấu hình: `Shadowing:Recognition:MaxConcurrent` (mặc định = số lõi / 2, tối thiểu 1),
    /// `Shadowing:Recognition:QueueTimeoutMs` (mặc định 10000).
    /// </summary>
    public sealed class ShadowingRecognitionThrottle : IDisposable
    {
        private readonly SemaphoreSlim _slots;
        private readonly TimeSpan _queueTimeout;

        public ShadowingRecognitionThrottle(IConfiguration configuration)
            : this(
                configuration.GetValue<int?>("Shadowing:Recognition:MaxConcurrent") ?? Math.Max(1, Environment.ProcessorCount / 2),
                TimeSpan.FromMilliseconds(configuration.GetValue<int?>("Shadowing:Recognition:QueueTimeoutMs") ?? 10_000))
        {
        }

        public ShadowingRecognitionThrottle(int maxConcurrent, TimeSpan queueTimeout)
        {
            _slots = new SemaphoreSlim(Math.Max(1, maxConcurrent));
            _queueTimeout = queueTimeout;
        }

        /// <summary>Một chỗ chạy (giải phóng khi Dispose), hoặc null nếu chờ quá hạn.</summary>
        public async Task<IDisposable?> TryEnterAsync(CancellationToken cancellationToken)
        {
            return await _slots.WaitAsync(_queueTimeout, cancellationToken) ? new Slot(_slots) : null;
        }

        public void Dispose() => _slots.Dispose();

        private sealed class Slot : IDisposable
        {
            private SemaphoreSlim? _slots;
            public Slot(SemaphoreSlim slots) => _slots = slots;
            public void Dispose() => Interlocked.Exchange(ref _slots, null)?.Release();
        }
    }
}
