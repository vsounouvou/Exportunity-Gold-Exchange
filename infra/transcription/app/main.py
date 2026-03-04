import os
import tempfile
import time
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from faster_whisper import WhisperModel


MODEL_NAME = os.getenv("WHISPER_MODEL", "small").strip() or "small"
DEVICE = os.getenv("WHISPER_DEVICE", "cpu").strip() or "cpu"
COMPUTE_TYPE = os.getenv("WHISPER_COMPUTE_TYPE", "int8").strip() or "int8"
DEFAULT_LANGUAGE = os.getenv("WHISPER_LANGUAGE", "").strip() or None
BEAM_SIZE = max(1, int(os.getenv("WHISPER_BEAM_SIZE", "1")))

app = FastAPI(title="Whisper Transcription Service", version="1.0.0")
model = WhisperModel(MODEL_NAME, device=DEVICE, compute_type=COMPUTE_TYPE)


@app.get("/health")
def health():
    return {
        "ok": True,
        "provider": "whisper-service",
        "model": MODEL_NAME,
        "device": DEVICE,
        "computeType": COMPUTE_TYPE,
    }


@app.post("/transcribe")
async def transcribe(
    file: UploadFile = File(...),
    language: Optional[str] = Form(default=None),
    prompt: Optional[str] = Form(default=None),
):
    started_at = time.time()
    payload = await file.read()
    if not payload:
        raise HTTPException(status_code=400, detail="audio_file_empty")

    suffix = Path(file.filename or "voice.webm").suffix or ".webm"
    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(payload)
            tmp.flush()
            tmp_path = tmp.name

        segments, info = model.transcribe(
            tmp_path,
            language=(language or DEFAULT_LANGUAGE or None),
            initial_prompt=(prompt or None),
            beam_size=BEAM_SIZE,
        )

        parts = [segment.text.strip() for segment in segments if segment.text and segment.text.strip()]
        text = " ".join(parts).strip()
        if not text:
            raise HTTPException(status_code=422, detail="empty_transcript")

        duration_ms = int((time.time() - started_at) * 1000)
        return {
            "text": text,
            "provider": "whisper-service",
            "model": MODEL_NAME,
            "language": getattr(info, "language", None) or language or DEFAULT_LANGUAGE,
            "durationMs": duration_ms,
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"transcription_failed: {exc}") from exc
    finally:
        if tmp_path:
            try:
                os.remove(tmp_path)
            except OSError:
                pass
