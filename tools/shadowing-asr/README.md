# JCAP Shadowing ASR service (Faster-Whisper)

Dịch vụ nhận dạng **nội dung** lời nói tiếng Nhật cho chấm Shadowing (Shadowing V2, Decision 1). Không chấm phát âm.
Chỉ backend .NET gọi; trình duyệt không gọi trực tiếp. Khác `tools/whisper_engine` của Hội thoại AI: không lưu tệp âm thanh, có token nội bộ.

## Chạy

```powershell
cd tools/shadowing-asr
python -m venv .venv; .venv\Scripts\Activate.ps1      # tùy chọn: môi trường riêng
pip install -r requirements.txt
$env:ASR_MODEL = "small"          # base | small | medium | large-v3 — chọn theo benchmark và phần cứng
$env:ASR_TOKEN = "<chuỗi bí mật>" # cùng giá trị với Shadowing:Asr:Token của backend (appsettings.Local.json)
python -m app.main                # http://127.0.0.1:50023
```

Hoặc `scripts/run-shadowing-asr.ps1`. Lần chạy đầu tải model Whisper từ Hugging Face (MIT) vào cache.

## Cấu hình (biến môi trường)

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `ASR_MODEL` | `small` | Model Faster-Whisper (hoặc đường dẫn thư mục model CTranslate2) |
| `ASR_DEVICE` / `ASR_COMPUTE_TYPE` | `cpu` / `int8` | GPU: `cuda` / `float16` |
| `ASR_BEAM_SIZE` | 5 | |
| `ASR_MAX_CONCURRENCY` | 1 | Số lượt nhận dạng đồng thời; quá 15 s chờ → 503 `ASR_BUSY` |
| `ASR_HOST` / `ASR_PORT` | `127.0.0.1` / `50023` | Không mở ra ngoài; 50022 là dịch vụ của Hội thoại AI |
| `ASR_TOKEN` | (trống) | Có giá trị thì bắt buộc header `X-Internal-Token` |
| `ASR_MODEL_DIR` | (cache mặc định) | Nơi lưu model tải về |

## API

- `GET /health` → `{ status, model, device, computeType, modelLoaded, readingAvailable, error }`
- `POST /v1/transcribe` (multipart `file`: WAV PCM 16-bit mono 16 kHz, 0.2–30 s, ≤ 2 MB) →
  `{ text, reading, language, model, modelVersion, device, computeType, durationSec, processingMs, segments[] }`.
  `segments[].avgLogprob / noSpeechProb / compressionRatio` là siêu dữ liệu thô của Whisper, **không** phải độ tin cậy phát âm.
  Lỗi: 400 `INVALID_AUDIO_FORMAT` / `UNSUPPORTED_WAV_FORMAT` / `AUDIO_TOO_SHORT`, 413 `AUDIO_TOO_LARGE` / `AUDIO_TOO_LONG`,
  401 token sai, 503 `ASR_BUSY` / `ASR_MODEL_UNAVAILABLE`.

## Benchmark

Không chọn model lớn nhất mặc định. So sánh trên **giọng người học** (thư mục bản ghi tải từ trang luyện, mục C) và giọng VOICEVOX:
`JCAP_BENCH=1 JCAP_ASR_URL=http://127.0.0.1:50023 dotnet test JCAP.Tests --filter "FullyQualifiedName~AsrBench"`
(xem `JCAP.Tests/Bench/AsrBench.cs`). Chạy lại với từng `ASR_MODEL` (base, small, medium) rồi so `asr-report-*.md`.
