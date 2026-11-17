using System;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using JCAP.Services.Implementations;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Xunit;

namespace JCAP.Tests.Services
{
    public class VoiceVoxServiceTests : IDisposable
    {
        private readonly string _tempWebRoot;

        public VoiceVoxServiceTests()
        {
            _tempWebRoot = Path.Combine(Path.GetTempPath(), "jcap_voicevox_tests_" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(_tempWebRoot);
        }

        public void Dispose()
        {
            try
            {
                if (Directory.Exists(_tempWebRoot))
                {
                    Directory.Delete(_tempWebRoot, recursive: true);
                }
            }
            catch
            {
                // Ignore cleanup error in temp directory
            }
        }

        private sealed class FakeVoiceVoxHandler : HttpMessageHandler
        {
            private readonly Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>> _responder;
            public int AudioQueryCount;
            public int SynthesisCount;

            public FakeVoiceVoxHandler(Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>> responder)
            {
                _responder = responder;
            }

            protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
            {
                var path = request.RequestUri?.AbsolutePath ?? string.Empty;
                if (path.Equals("/audio_query", StringComparison.OrdinalIgnoreCase))
                {
                    Interlocked.Increment(ref AudioQueryCount);
                }
                else if (path.Equals("/synthesis", StringComparison.OrdinalIgnoreCase))
                {
                    Interlocked.Increment(ref SynthesisCount);
                }

                return _responder(request, cancellationToken);
            }
        }

        private VoiceVoxService CreateService(FakeVoiceVoxHandler handler)
        {
            var httpClient = new HttpClient(handler);
            var factoryMock = new Mock<IHttpClientFactory>();
            factoryMock.Setup(f => f.CreateClient(OptionsName)).Returns(httpClient);

            var config = new ConfigurationBuilder()
                .AddInMemoryCollection(new System.Collections.Generic.Dictionary<string, string?>
                {
                    ["VoiceVox:BaseUrl"] = "http://127.0.0.1:50021"
                })
                .Build();

            var envMock = new Mock<IWebHostEnvironment>();
            envMock.SetupGet(e => e.WebRootPath).Returns(_tempWebRoot);
            envMock.SetupGet(e => e.ContentRootPath).Returns(_tempWebRoot);

            return new VoiceVoxService(
                factoryMock.Object,
                config,
                envMock.Object,
                NullLogger<VoiceVoxService>.Instance);
        }

        private const string OptionsName = "";

        private const string MinimalAudioQueryJson =
            """{"accent_phrases":[{"moras":[{"text":"ア","consonant_length":0.0,"vowel":"a","vowel_length":0.12}]}],"prePhonemeLength":0.05}""";

        [Fact]
        public async Task SynthesizeAsync_ConcurrentSameKeyCalls_DeduplicatesEngineRequests()
        {
            var uniqueText = $"テスト重複排除_{Guid.NewGuid():N}";
            var wavPayload = new byte[] { 0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00 };
            var synthesisStarted = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
            var releaseSynthesis = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);

            var handler = new FakeVoiceVoxHandler(async (req, ct) =>
            {
                var path = req.RequestUri!.AbsolutePath;
                if (path.Equals("/audio_query", StringComparison.OrdinalIgnoreCase))
                {
                    return new HttpResponseMessage(HttpStatusCode.OK)
                    {
                        Content = new StringContent(MinimalAudioQueryJson, Encoding.UTF8, "application/json")
                    };
                }

                synthesisStarted.TrySetResult(true);
                await releaseSynthesis.Task.WaitAsync(ct);
                return new HttpResponseMessage(HttpStatusCode.OK)
                {
                    Content = new ByteArrayContent(wavPayload)
                };
            });

            var service1 = CreateService(handler);
            var service2 = CreateService(handler);

            var task1 = service1.SynthesizeAsync(uniqueText, 14, CancellationToken.None);
            await synthesisStarted.Task;
            var task2 = service2.SynthesizeAsync(uniqueText, 14, CancellationToken.None);

            releaseSynthesis.TrySetResult(true);

            var results = await Task.WhenAll(task1, task2);
            Assert.Equal(1, handler.AudioQueryCount);
            Assert.Equal(1, handler.SynthesisCount);
            Assert.Equal(wavPayload, results[0]);
            Assert.Equal(wavPayload, results[1]);
        }

        [Fact]
        public async Task SynthesizeAsync_FirstCallerCancelsEarly_DoesNotCancelSecondCaller()
        {
            var uniqueText = $"テストキャンセル分離_{Guid.NewGuid():N}";
            var wavPayload = new byte[] { 0x52, 0x49, 0x46, 0x46, 0x10, 0x00, 0x00, 0x00 };
            var synthesisStarted = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
            var releaseSynthesis = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);

            var handler = new FakeVoiceVoxHandler(async (req, ct) =>
            {
                var path = req.RequestUri!.AbsolutePath;
                if (path.Equals("/audio_query", StringComparison.OrdinalIgnoreCase))
                {
                    return new HttpResponseMessage(HttpStatusCode.OK)
                    {
                        Content = new StringContent(MinimalAudioQueryJson, Encoding.UTF8, "application/json")
                    };
                }

                synthesisStarted.TrySetResult(true);
                await releaseSynthesis.Task.WaitAsync(ct);
                return new HttpResponseMessage(HttpStatusCode.OK)
                {
                    Content = new ByteArrayContent(wavPayload)
                };
            });

            var service = CreateService(handler);
            using var shortCts = new CancellationTokenSource();

            var firstCallerTask = service.SynthesizeAsync(uniqueText, 14, shortCts.Token);
            await synthesisStarted.Task;

            var secondCallerTask = service.SynthesizeAsync(uniqueText, 14, CancellationToken.None);

            // Simulate Shadowing 3s caller aborting mid-flight while Scenario/Placement caller is still waiting
            shortCts.Cancel();
            await Assert.ThrowsAnyAsync<OperationCanceledException>(() => firstCallerTask);

            releaseSynthesis.TrySetResult(true);
            var secondResult = await secondCallerTask;
            Assert.Equal(wavPayload, secondResult);
            Assert.Equal(1, handler.SynthesisCount);
        }

        [Fact]
        public async Task SynthesizeAsync_TransientFailure_DoesNotPoisonInFlightCache()
        {
            var uniqueText = $"テストリトライ_{Guid.NewGuid():N}";
            var wavPayload = new byte[] { 0x52, 0x49, 0x46, 0x46, 0x99, 0x00, 0x00, 0x00 };
            int attempt = 0;

            var handler = new FakeVoiceVoxHandler((req, _) =>
            {
                var path = req.RequestUri!.AbsolutePath;
                if (path.Equals("/audio_query", StringComparison.OrdinalIgnoreCase))
                {
                    if (Interlocked.Increment(ref attempt) == 1)
                    {
                        return Task.FromResult(new HttpResponseMessage(HttpStatusCode.ServiceUnavailable)
                        {
                            Content = new StringContent("Temporary busy")
                        });
                    }

                    return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)
                    {
                        Content = new StringContent(MinimalAudioQueryJson, Encoding.UTF8, "application/json")
                    });
                }

                return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)
                {
                    Content = new ByteArrayContent(wavPayload)
                });
            });

            var service = CreateService(handler);

            await Assert.ThrowsAsync<InvalidOperationException>(() =>
                service.SynthesizeAsync(uniqueText, 14, CancellationToken.None));

            var retryResult = await service.SynthesizeAsync(uniqueText, 14, CancellationToken.None);
            Assert.Equal(wavPayload, retryResult);
            Assert.Equal(2, handler.AudioQueryCount);
            Assert.Equal(1, handler.SynthesisCount);
        }
    }
}
