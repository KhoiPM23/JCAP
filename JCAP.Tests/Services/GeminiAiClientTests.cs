using System;
using System.Collections.Generic;
using System.Net;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using JCAP.Services.Implementations;
using JCAP.Services.Models;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Xunit;

namespace JCAP.Tests.Services
{
    public class GeminiAiClientTests
    {
        private static IConfiguration BuildConfig(Dictionary<string, string?>? overrides = null)
        {
            var dict = new Dictionary<string, string?>
            {
                ["AI:ApiKey"] = "test-api-key",
                ["AI:Model"] = "gemini-3.5-flash-lite",
                ["AI:FallbackModels:0"] = "gemini-3.5-flash-lite",
                ["AI:FallbackModels:1"] = "gemini-3.1-flash-lite",
                ["AI:FallbackModels:2"] = "gemini-3-flash-preview"
            };
            if (overrides != null)
            {
                foreach (var kv in overrides)
                {
                    dict[kv.Key] = kv.Value;
                }
            }
            return new ConfigurationBuilder().AddInMemoryCollection(dict).Build();
        }

        private static string GeminiSuccessJson(string text)
        {
            return JsonSerializer.Serialize(new
            {
                candidates = new[]
                {
                    new
                    {
                        content = new
                        {
                            parts = new[] { new { text } }
                        }
                    }
                }
            });
        }

        private sealed class StubHttpMessageHandler : HttpMessageHandler
        {
            private readonly Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>> _responder;
            public List<string> RequestedModels { get; } = [];
            public List<string> RequestBodies { get; } = [];

            public StubHttpMessageHandler(Func<HttpRequestMessage, HttpResponseMessage> responder)
                : this((req, _) => Task.FromResult(responder(req)))
            {
            }

            public StubHttpMessageHandler(Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>> responder)
            {
                _responder = responder;
            }

            protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
            {
                var path = request.RequestUri?.AbsolutePath ?? string.Empty;
                var marker = "/models/";
                var start = path.IndexOf(marker, StringComparison.OrdinalIgnoreCase);
                if (start >= 0)
                {
                    var rest = path[(start + marker.Length)..];
                    var colon = rest.IndexOf(':');
                    RequestedModels.Add(colon >= 0 ? rest[..colon] : rest);
                }

                if (request.Content != null)
                {
                    RequestBodies.Add(await request.Content.ReadAsStringAsync(cancellationToken));
                }

                return await _responder(request, cancellationToken);
            }
        }

        private static GeminiAiClient CreateClient(
            StubHttpMessageHandler handler,
            IConfiguration? config = null,
            GeminiModelCooldownTracker? cooldownTracker = null)
        {
            var httpClient = new HttpClient(handler);
            var factoryMock = new Mock<IHttpClientFactory>();
            factoryMock.Setup(f => f.CreateClient("GeminiAiClient")).Returns(httpClient);

            return new GeminiAiClient(
                factoryMock.Object,
                config ?? BuildConfig(),
                NullLogger<GeminiAiClient>.Instance,
                cooldownTracker);
        }

        [Fact]
        public void BuildCandidateModels_RotatesFromPreferredModel_PlanB()
        {
            var client = CreateClient(new StubHttpMessageHandler(_ => new HttpResponseMessage(HttpStatusCode.OK)));

            var defaultOrder = client.BuildCandidateModels();
            Assert.Equal(new[] { "gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-3-flash-preview" }, defaultOrder);

            var rotatedFromSecond = client.BuildCandidateModels("gemini-3.1-flash-lite");
            Assert.Equal(new[] { "gemini-3.1-flash-lite", "gemini-3-flash-preview", "gemini-3.5-flash-lite" }, rotatedFromSecond);

            var rotatedFromLast = client.BuildCandidateModels("gemini-3-flash-preview");
            Assert.Equal(new[] { "gemini-3-flash-preview", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite" }, rotatedFromLast);
        }

        [Fact]
        public async Task GenerateAsync_WhenPreferredModelSet_SkipsFailedFirstModelAndReturnsModelUsed()
        {
            var handler = new StubHttpMessageHandler(req =>
            {
                if (req.RequestUri!.AbsolutePath.Contains("gemini-3.5-flash-lite"))
                {
                    return new HttpResponseMessage(HttpStatusCode.ServiceUnavailable)
                    {
                        Content = new StringContent("503 overloaded", Encoding.UTF8, "application/json")
                    };
                }

                return new HttpResponseMessage(HttpStatusCode.OK)
                {
                    Content = new StringContent(GeminiSuccessJson("{\"ok\":true}"), Encoding.UTF8, "application/json")
                };
            });

            var client = CreateClient(handler);

            // Lượt 1: Chưa có PreferredModel -> gọi 3.5 (503) rồi fallback sang 3.1 thành công
            var req1 = AiRequest.CreateJson("sys", "hi");
            req1.FallbackOnAnyError = true;
            var res1 = await client.GenerateAsync(req1);

            Assert.True(res1.IsSuccess);
            Assert.Equal("gemini-3.1-flash-lite", res1.ModelUsed);
            Assert.Equal(new[] { "gemini-3.5-flash-lite", "gemini-3.1-flash-lite" }, handler.RequestedModels);

            handler.RequestedModels.Clear();

            // Lượt 2: Ghim PreferredModel = 3.1 -> gọi thẳng 3.1 ngay ở request đầu tiên, không gọi lại 3.5
            var req2 = AiRequest.CreateJson("sys", "next turn");
            req2.PreferredModel = res1.ModelUsed;
            req2.FallbackOnAnyError = true;
            var res2 = await client.GenerateAsync(req2);

            Assert.True(res2.IsSuccess);
            Assert.Equal("gemini-3.1-flash-lite", res2.ModelUsed);
            Assert.Equal(new[] { "gemini-3.1-flash-lite" }, handler.RequestedModels);
        }

        [Fact]
        public async Task GenerateAsync_PlanB_WhenTailFails_WrapsAroundToEarlierModelsAndHandlesAnyHttpError()
        {
            var handler = new StubHttpMessageHandler(req =>
            {
                var uri = req.RequestUri!.AbsolutePath;
                if (uri.Contains("gemini-3-flash-preview"))
                {
                    // Kể cả lỗi 400 BadRequest vẫn fallback khi FallbackOnAnyError = true
                    return new HttpResponseMessage(HttpStatusCode.BadRequest)
                    {
                        Content = new StringContent("bad request on preview", Encoding.UTF8, "application/json")
                    };
                }
                if (uri.Contains("gemini-3.5-flash-lite"))
                {
                    // Phương án B: khi model cuối fail, vòng lại thử 3.5 -> lúc này 3.5 đã sống lại
                    return new HttpResponseMessage(HttpStatusCode.OK)
                    {
                        Content = new StringContent(GeminiSuccessJson("{\"ok\":\"recovered\"}"), Encoding.UTF8, "application/json")
                    };
                }

                return new HttpResponseMessage(HttpStatusCode.TooManyRequests);
            });

            var client = CreateClient(handler);
            var req = AiRequest.CreateJson("sys", "turn 4");
            req.PreferredModel = "gemini-3-flash-preview";
            req.FallbackOnAnyError = true;

            var res = await client.GenerateAsync(req);

            Assert.True(res.IsSuccess);
            Assert.Equal("gemini-3.5-flash-lite", res.ModelUsed);
            Assert.Equal(new[] { "gemini-3-flash-preview", "gemini-3.5-flash-lite" }, handler.RequestedModels);
        }

        [Fact]
        public async Task GenerateAsync_SkipsThoughtParts_AndStripsMarkdownJsonFence()
        {
            var thoughtAndJsonResponse = JsonSerializer.Serialize(new
            {
                candidates = new[]
                {
                    new
                    {
                        content = new
                        {
                            parts = new object[]
                            {
                                new { thought = true, text = "Internal chain of thought..." },
                                new { text = "```json\n{\"reply\":\"こんにちは\"}\n```" }
                            }
                        }
                    }
                }
            });

            var handler = new StubHttpMessageHandler(_ => new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(thoughtAndJsonResponse, Encoding.UTF8, "application/json")
            });

            var client = CreateClient(handler);
            var res = await client.GenerateAsync(AiRequest.CreateJson("sys", "hi"));

            Assert.True(res.IsSuccess);
            Assert.Equal("{\"reply\":\"こんにちは\"}", res.Content);
        }

        [Fact]
        public async Task GenerateAsync_WhenJsonResponseIsMalformed_FallsBackToNextModel()
        {
            var handler = new StubHttpMessageHandler(req =>
            {
                if (req.RequestUri!.AbsolutePath.Contains("gemini-3.5-flash-lite"))
                {
                    return new HttpResponseMessage(HttpStatusCode.OK)
                    {
                        Content = new StringContent(GeminiSuccessJson("{\"truncated\": "), Encoding.UTF8, "application/json")
                    };
                }

                return new HttpResponseMessage(HttpStatusCode.OK)
                {
                    Content = new StringContent(GeminiSuccessJson("{\"valid\":true}"), Encoding.UTF8, "application/json")
                };
            });

            var client = CreateClient(handler);
            var res = await client.GenerateAsync(AiRequest.CreateJson("sys", "hi"));

            Assert.True(res.IsSuccess);
            Assert.Equal("gemini-3.1-flash-lite", res.ModelUsed);
            Assert.Equal("{\"valid\":true}", res.Content);
        }

        [Fact]
        public async Task GenerateAsync_SetsAppropriateThinkingLevelPerModel()
        {
            var config = new ConfigurationBuilder()
                .AddInMemoryCollection(new Dictionary<string, string?>
                {
                    ["AI:ApiKey"] = "test-api-key",
                    ["AI:Model"] = "gemini-3.5-flash-lite",
                    ["AI:FallbackModels:0"] = "gemini-3.5-flash-lite",
                    ["AI:FallbackModels:1"] = "gemini-4-hydrogen",
                    ["AI:FallbackModels:2"] = "gemini-3.8-flash"
                })
                .Build();

            var handler = new StubHttpMessageHandler(req =>
            {
                if (req.RequestUri!.AbsolutePath.Contains("gemini-3.8-flash"))
                {
                    return new HttpResponseMessage(HttpStatusCode.OK)
                    {
                        Content = new StringContent(GeminiSuccessJson("{\"ok\":true}"), Encoding.UTF8, "application/json")
                    };
                }
                return new HttpResponseMessage(HttpStatusCode.ServiceUnavailable);
            });

            var client = CreateClient(handler, config);
            var res = await client.GenerateAsync(AiRequest.CreateJson("sys", "hi"));

            Assert.True(res.IsSuccess);
            Assert.Equal(3, handler.RequestBodies.Count);
            Assert.Contains("\"thinkingLevel\":\"MINIMAL\"", handler.RequestBodies[0]); // 3.5-flash-lite
            Assert.Contains("\"thinkingLevel\":\"LOW\"", handler.RequestBodies[1]);     // 4-hydrogen
            Assert.Contains("\"thinkingLevel\":\"LOW\"", handler.RequestBodies[2]);     // 3.8-flash
        }

        [Fact]
        public async Task GenerateAsync_WhenModelTimesOut_FallsBackImmediatelyToNextModel()
        {
            var config = BuildConfig(new Dictionary<string, string?>
            {
                ["AI:PerModelTimeoutSeconds"] = "1",
                ["AI:TransientRetryCount"] = "0"
            });

            var handler = new StubHttpMessageHandler(async (req, ct) =>
            {
                if (req.RequestUri!.AbsolutePath.Contains("gemini-3.5-flash-lite"))
                {
                    await Task.Delay(TimeSpan.FromSeconds(5), ct);
                }

                return new HttpResponseMessage(HttpStatusCode.OK)
                {
                    Content = new StringContent(GeminiSuccessJson("{\"fast\":true}"), Encoding.UTF8, "application/json")
                };
            });

            var client = CreateClient(handler, config);
            var res = await client.GenerateAsync(AiRequest.CreateJson("sys", "hi"));

            Assert.True(res.IsSuccess);
            Assert.Equal("gemini-3.1-flash-lite", res.ModelUsed);
            Assert.Equal(new[] { "gemini-3.5-flash-lite", "gemini-3.1-flash-lite" }, handler.RequestedModels);
        }

        [Fact]
        public async Task GenerateAsync_SharedCooldownTracker_DeprioritizesFailedModelAcrossRequests()
        {
            var tracker = new GeminiModelCooldownTracker();
            var handler = new StubHttpMessageHandler(req =>
            {
                if (req.RequestUri!.AbsolutePath.Contains("gemini-3.5-flash-lite"))
                {
                    return new HttpResponseMessage(HttpStatusCode.ServiceUnavailable);
                }

                return new HttpResponseMessage(HttpStatusCode.OK)
                {
                    Content = new StringContent(GeminiSuccessJson("{\"ok\":true}"), Encoding.UTF8, "application/json")
                };
            });

            var client1 = CreateClient(handler, cooldownTracker: tracker);
            var res1 = await client1.GenerateAsync(AiRequest.CreateJson("sys", "turn 1"));
            Assert.True(res1.IsSuccess);
            Assert.Equal(new[] { "gemini-3.5-flash-lite", "gemini-3.1-flash-lite" }, handler.RequestedModels);

            handler.RequestedModels.Clear();

            // Request kế tiếp (dù không truyền PreferredModel) nhảy thẳng sang model khỏe, bỏ qua 3.5 đang cooldown
            var client2 = CreateClient(handler, cooldownTracker: tracker);
            var res2 = await client2.GenerateAsync(AiRequest.CreateJson("sys", "turn 2"));
            Assert.True(res2.IsSuccess);
            Assert.Equal("gemini-3.1-flash-lite", res2.ModelUsed);
            Assert.Equal(new[] { "gemini-3.1-flash-lite" }, handler.RequestedModels);
        }

        [Fact]
        public async Task GenerateAsync_WhenAllModelsTransiently503_RetriesAndRecovers()
        {
            var attempts = 0;
            var handler = new StubHttpMessageHandler(req =>
            {
                attempts++;
                if (attempts <= 3)
                {
                    return new HttpResponseMessage(HttpStatusCode.ServiceUnavailable);
                }

                return new HttpResponseMessage(HttpStatusCode.OK)
                {
                    Content = new StringContent(GeminiSuccessJson("{\"recovered\":true}"), Encoding.UTF8, "application/json")
                };
            });

            var client = CreateClient(handler);
            var res = await client.GenerateAsync(AiRequest.CreateJson("sys", "hi"));

            Assert.True(res.IsSuccess);
            Assert.Equal("{\"recovered\":true}", res.Content);
            Assert.Equal(4, attempts);
        }
    }
}
