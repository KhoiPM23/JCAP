"""JCAP Shadowing ASR service (Faster-Whisper).

Nhận dạng NỘI DUNG lời nói tiếng Nhật cho chấm Shadowing (Shadowing V2, Decision 1). Không chấm phát âm.

Thiết kế:
- Chỉ backend .NET gọi (mặc định nghe 127.0.0.1; nếu đặt ASR_TOKEN thì bắt buộc header X-Internal-Token).
- Xử lý hoàn toàn trong bộ nhớ: KHÔNG lưu tệp âm thanh nào (khác dịch vụ STT của Hội thoại AI).
- Đầu vào: WAV PCM 16-bit mono 16 kHz (đúng bản WAV phân tích mà backend đã kiểm tra), tối đa 30 giây.
- Cấu hình qua biến môi trường (không hardcode model/đường dẫn): ASR_MODEL, ASR_DEVICE, ASR_COMPUTE_TYPE, ASR_BEAM_SIZE,
  ASR_MAX_CONCURRENCY, ASR_HOST, ASR_PORT, ASR_TOKEN, ASR_MODEL_DIR.
- Siêu dữ liệu của Whisper (avg_logprob, no_speech_prob, compression_ratio) được trả NGUYÊN BẢN để hiệu chỉnh sau;
  chúng KHÔNG phải xác suất phát âm đúng và dịch vụ không tự tạo "độ tin cậy".
- Cách đọc (katakana) của transcript bằng pyopenjtalk (cùng bộ G2P OpenJTalk với VOICEVOX) nếu đã cài; không có thì reading = null.
"""
from __future__ import annotations

import hmac
import io
import os
import threading
import time
import wave
from dataclasses import dataclass

import numpy as np
from fastapi import FastAPI, File, Header, HTTPException, UploadFile

SAMPLE_RATE = 16000
MAX_BYTES = 2 * 1024 * 1024
MAX_SECONDS = 30.0
MIN_SECONDS = 0.2


@dataclass(frozen=True)
class Settings:
    model: str = os.getenv("ASR_MODEL", "small")
    device: str = os.getenv("ASR_DEVICE", "cpu")
    compute_type: str = os.getenv("ASR_COMPUTE_TYPE", "int8")
    beam_size: int = int(os.getenv("ASR_BEAM_SIZE", "5"))
    max_concurrency: int = max(1, int(os.getenv("ASR_MAX_CONCURRENCY", "1")))
    token: str = os.getenv("ASR_TOKEN", "")
    model_dir: str | None = os.getenv("ASR_MODEL_DIR") or None


SETTINGS = Settings()
app = FastAPI(title="JCAP Shadowing ASR (Faster-Whisper)", version="1.0.0")

_model = None
_model_error: str | None = None
_model_lock = threading.Lock()
_slots = threading.BoundedSemaphore(SETTINGS.max_concurrency)

try:  # cách đọc của transcript (tùy chọn)
    import pyopenjtalk  # type: ignore

    def to_reading(text: str) -> str | None:
        return pyopenjtalk.g2p(text, kana=True) if text else ""
except Exception:  # pragma: no cover - phụ thuộc môi trường
    pyopenjtalk = None

    def to_reading(text: str) -> str | None:
        return None


def get_model():
    """Nạp model một lần (lười). Lỗi nạp được ghi lại để /health báo đúng."""
    global _model, _model_error
    if _model is not None:
        return _model
    with _model_lock:
        if _model is None:
            try:
                from faster_whisper import WhisperModel

                _model = WhisperModel(
                    SETTINGS.model,
                    device=SETTINGS.device,
                    compute_type=SETTINGS.compute_type,
                    download_root=SETTINGS.model_dir,
                )
                _model_error = None
            except Exception as ex:  # pragma: no cover - phụ thuộc môi trường
                _model_error = f"{type(ex).__name__}: {ex}"
                raise
    return _model


def check_token(token: str | None) -> None:
    if SETTINGS.token and not hmac.compare_digest(token or "", SETTINGS.token):
        raise HTTPException(status_code=401, detail="invalid internal token")


def read_wav(data: bytes) -> np.ndarray:
    """WAV PCM 16-bit mono 16 kHz → float32 [-1, 1]. Sai định dạng → 400 (không đoán, không tự resample)."""
    if len(data) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="AUDIO_TOO_LARGE")
    if len(data) < 12 or data[:4] != b"RIFF" or data[8:12] != b"WAVE":
        raise HTTPException(status_code=400, detail="INVALID_AUDIO_FORMAT")
    try:
        with wave.open(io.BytesIO(data), "rb") as w:
            if w.getnchannels() != 1 or w.getsampwidth() != 2 or w.getframerate() != SAMPLE_RATE:
                raise HTTPException(status_code=400, detail="UNSUPPORTED_WAV_FORMAT")
            frames = w.readframes(w.getnframes())
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=400, detail="INVALID_AUDIO_FORMAT")
    audio = np.frombuffer(frames, dtype="<i2").astype(np.float32) / 32768.0
    seconds = len(audio) / SAMPLE_RATE
    if seconds < MIN_SECONDS:
        raise HTTPException(status_code=400, detail="AUDIO_TOO_SHORT")
    if seconds > MAX_SECONDS:
        raise HTTPException(status_code=413, detail="AUDIO_TOO_LONG")
    return audio


@app.get("/health")
def health():
    loaded = _model is not None
    return {
        "status": "ok" if _model_error is None else "error",
        "engine": "faster-whisper",
        "model": SETTINGS.model,
        "device": SETTINGS.device,
        "computeType": SETTINGS.compute_type,
        "modelLoaded": loaded,
        "readingAvailable": pyopenjtalk is not None,
        "error": _model_error,
    }


@app.post("/v1/transcribe")
def transcribe(file: UploadFile = File(...), x_internal_token: str | None = Header(default=None)):
    check_token(x_internal_token)
    audio = read_wav(file.file.read(MAX_BYTES + 1))

    if not _slots.acquire(timeout=15):
        raise HTTPException(status_code=503, detail="ASR_BUSY")
    try:
        started = time.perf_counter()
        try:
            model = get_model()
        except Exception:
            raise HTTPException(status_code=503, detail="ASR_MODEL_UNAVAILABLE")
        segments, info = model.transcribe(
            audio,
            language="ja",           # luôn tiếng Nhật, không tự nhận diện ngôn ngữ
            task="transcribe",       # không dùng chế độ dịch
            beam_size=SETTINGS.beam_size,
            temperature=0.0,
            condition_on_previous_text=False,
            vad_filter=False,        # câu ngắn; khoảng lặng đã được backend kiểm tra
            initial_prompt=None,
        )
        items = []
        for s in segments:
            text = s.text.strip()
            items.append({
                "start": round(s.start, 2),
                "end": round(s.end, 2),
                "text": text,
                "avgLogprob": round(s.avg_logprob, 4),
                "noSpeechProb": round(s.no_speech_prob, 4),
                "compressionRatio": round(s.compression_ratio, 3),
            })
        elapsed_ms = int((time.perf_counter() - started) * 1000)
    finally:
        _slots.release()

    text = "".join(i["text"] for i in items).strip()
    from faster_whisper import __version__ as fw_version

    return {
        "text": text,
        "reading": to_reading(text),
        "language": getattr(info, "language", "ja"),
        "model": SETTINGS.model,
        "modelVersion": f"faster-whisper {fw_version}",
        "device": SETTINGS.device,
        "computeType": SETTINGS.compute_type,
        "durationSec": round(len(audio) / SAMPLE_RATE, 2),
        "processingMs": elapsed_ms,
        "segments": items,
    }


if __name__ == "__main__":  # pragma: no cover
    import uvicorn

    uvicorn.run(app, host=os.getenv("ASR_HOST", "127.0.0.1"), port=int(os.getenv("ASR_PORT", "50023")), log_level="info")
