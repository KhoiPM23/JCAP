import os
import math
import uuid
import shutil
import tempfile
import uvicorn
import av
from fastapi import FastAPI, File, UploadFile, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

# Compatibility patch: PyAV >= 15 dropped 'metadata_errors' which faster-whisper still passes
_orig_av_open = av.open
def _compat_av_open(*args, **kwargs):
    kwargs.pop("metadata_errors", None)
    return _orig_av_open(*args, **kwargs)
av.open = _compat_av_open

from faster_whisper import WhisperModel

app = FastAPI(title="JCAP Whisper STT Engine", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

AUDIO_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "wwwroot", "audio", "roleplay"))
os.makedirs(AUDIO_DIR, exist_ok=True)
app.mount("/audio/roleplay", StaticFiles(directory=AUDIO_DIR), name="audio")

MODEL_SIZE = os.getenv("WHISPER_MODEL", "base")
DEVICE = os.getenv("WHISPER_DEVICE", "cpu")
COMPUTE_TYPE = os.getenv("WHISPER_COMPUTE_TYPE", "int8")

print(f"[Whisper Engine] Loading model '{MODEL_SIZE}' on {DEVICE} ({COMPUTE_TYPE})...")
model = WhisperModel(MODEL_SIZE, device=DEVICE, compute_type=COMPUTE_TYPE)
print("[Whisper Engine] Model loaded successfully!")

@app.get("/health")
def health():
    return {
        "status": "ok",
        "engine": "faster-whisper",
        "model": MODEL_SIZE,
        "device": DEVICE,
        "compute_type": COMPUTE_TYPE
    }

@app.post("/save-audio")
async def save_audio(file: UploadFile = File(...)):
    suffix = os.path.splitext(file.filename or "")[1] or ".webm"
    file_id = f"stt_{uuid.uuid4().hex[:12]}{suffix}"
    dest_path = os.path.join(AUDIO_DIR, file_id)
    content = await file.read()
    with open(dest_path, "wb") as f:
        f.write(content)
    return {
        "success": True,
        "audioUrl": f"/audio/roleplay/{file_id}"
    }

@app.post("/transcribe")
async def transcribe(
    file: UploadFile = File(...),
    language: str = Query("ja", description="Target language code (ja for Japanese)")
):
    suffix = os.path.splitext(file.filename or "")[1] or ".wav"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp_path = tmp.name
        content = await file.read()
        tmp.write(content)

    # Lưu bản ghi âm bền vững vào thư mục wwwroot/audio/roleplay
    file_id = f"stt_{uuid.uuid4().hex[:12]}{suffix}"
    dest_path = os.path.join(AUDIO_DIR, file_id)
    try:
        shutil.copyfile(tmp_path, dest_path)
        persisted_url = f"/audio/roleplay/{file_id}"
    except Exception:
        persisted_url = None

    try:
        segments, info = model.transcribe(
            tmp_path,
            language=language if language != "auto" else None,
            beam_size=5,
            vad_filter=True,
            vad_parameters=dict(min_silence_duration_ms=400)
        )

        segment_list = []
        full_text_parts = []
        confidences = []

        for seg in segments:
            text = seg.text.strip()
            if not text:
                continue
            full_text_parts.append(text)
            conf = min(1.0, max(0.0, math.exp(seg.avg_logprob)))
            confidences.append(conf)
            segment_list.append({
                "start": round(seg.start, 2),
                "end": round(seg.end, 2),
                "text": text,
                "confidence": round(conf, 3)
            })

        full_text = " ".join(full_text_parts).strip()
        duration = round(float(info.duration), 2) if hasattr(info, "duration") and info.duration else 0.0
        avg_confidence = round(sum(confidences) / len(confidences), 3) if confidences else 0.85
        speech_pace = round(len(full_text) / duration, 1) if duration > 0 else 0.0

        return {
            "success": True,
            "text": full_text,
            "confidence": avg_confidence,
            "durationSeconds": duration,
            "speechPace": speech_pace,
            "audioUrl": persisted_url,
            "language": info.language if hasattr(info, "language") else language,
            "segments": segment_list
        }
    finally:
        if os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except Exception:
                pass

if __name__ == "__main__":
    port = int(os.getenv("WHISPER_PORT", 50022))
    print(f"[Whisper Engine] Starting server on http://127.0.0.1:{port}")
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="info")
