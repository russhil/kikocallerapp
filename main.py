import base64
import io
import os
import struct
import traceback

import httpx
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from dotenv import load_dotenv

# Load .env if present (local dev), otherwise Render provides env vars
load_dotenv()

print("[KikoCall] Starting up...", flush=True)

# ---------- Lazy google-genai import ----------
# Import at module level but handle failure gracefully so the server still starts
try:
    from google import genai
    from google.genai import types as genai_types
    print("[KikoCall] ✓ google-genai SDK loaded", flush=True)
    GENAI_AVAILABLE = True
except ImportError as e:
    print(f"[KikoCall] ✗ google-genai SDK not available: {e}", flush=True)
    GENAI_AVAILABLE = False

app = FastAPI(title="KikoCall AI Proxy")

# ---------- Config ----------
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY", "")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")

# OAuth credentials for Gemini Live WebSocket
GOOGLE_OAUTH_CLIENT_ID = os.getenv("GOOGLE_OAUTH_CLIENT_ID", "")
GOOGLE_OAUTH_CLIENT_SECRET = os.getenv("GOOGLE_OAUTH_CLIENT_SECRET", "")
GOOGLE_OAUTH_REFRESH_TOKEN = os.getenv("GOOGLE_OAUTH_REFRESH_TOKEN", "")

GEMMA_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemma-3-27b-it:generateContent"
GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent"
STT_URL = "https://speech.googleapis.com/v1/speech:recognize"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"

print(f"[KikoCall] GOOGLE_API_KEY set: {bool(GOOGLE_API_KEY)}", flush=True)
print(f"[KikoCall] GEMINI_API_KEY set: {bool(GEMINI_API_KEY)}", flush=True)
print(f"[KikoCall] GENAI_AVAILABLE: {GENAI_AVAILABLE}", flush=True)

# google-genai SDK client (same pattern as parchi project)
_genai_client = None


def _get_genai_client():
    global _genai_client
    if not GENAI_AVAILABLE:
        raise HTTPException(status_code=500, detail="google-genai SDK not installed")
    if _genai_client is None:
        api_key = GEMINI_API_KEY or GOOGLE_API_KEY
        if not api_key:
            raise HTTPException(status_code=500, detail="No API key configured (need GEMINI_API_KEY or GOOGLE_API_KEY)")
        print(f"[KikoCall] Initializing genai.Client with API key", flush=True)
        _genai_client = genai.Client(api_key=api_key)
    return _genai_client


# ---------- Request models ----------

class TranscribeRequest(BaseModel):
    audio_base64: str
    language_code: str = "hi-IN"
    encoding: str = "LINEAR16"
    sample_rate_hertz: int = 16000


class TranscribeGeminiRequest(BaseModel):
    audio_base64: str
    language_code: str = "hi-IN"
    sample_rate_hertz: int = 16000


class ClassifyRequest(BaseModel):
    transcript: str


class ExtractOrderRequest(BaseModel):
    transcript: str
    store_name: str = ""


# ---------- Health ----------

@app.get("/")
def health():
    return {
        "status": "ok",
        "genai_available": GENAI_AVAILABLE,
        "google_api_key_set": bool(GOOGLE_API_KEY),
        "gemini_api_key_set": bool(GEMINI_API_KEY),
    }


# ---------- Transcribe (Google STT) ----------

@app.post("/api/transcribe")
async def transcribe(req: TranscribeRequest):
    print(f"[Transcribe] STT request: lang={req.language_code}, audio_len={len(req.audio_base64)}", flush=True)
    payload = {
        "config": {
            "encoding": req.encoding,
            "sampleRateHertz": req.sample_rate_hertz,
            "languageCode": req.language_code,
            "enableAutomaticPunctuation": True,
        },
        "audio": {"content": req.audio_base64},
    }
    try:
        async with httpx.AsyncClient(timeout=120) as client:
            resp = await client.post(
                f"{STT_URL}?key={GOOGLE_API_KEY}",
                json=payload,
            )
        if resp.status_code != 200:
            print(f"[Transcribe] STT error {resp.status_code}: {resp.text[:500]}", flush=True)
            raise HTTPException(status_code=resp.status_code, detail=resp.text)

        data = resp.json()
        results = data.get("results", [])
        transcript = " ".join(
            alt["transcript"]
            for r in results
            for alt in (r.get("alternatives") or [])
            if alt.get("transcript")
        )
        print(f"[Transcribe] STT result: {(transcript or 'None')[:100]}", flush=True)
        return {"transcript": transcript or None}
    except HTTPException:
        raise
    except Exception as e:
        print(f"[Transcribe] STT exception: {e}", flush=True)
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"STT failed: {e}")


# ---------- Transcribe via Gemini (fallback) ----------

@app.post("/api/transcribe-gemini")
async def transcribe_gemini(req: TranscribeGeminiRequest):
    """Fallback transcription using google-genai SDK (same pattern as parchi project)."""
    print(f"[Transcribe-Gemini] Request: lang={req.language_code}, audio_len={len(req.audio_base64)}", flush=True)
    try:
        # Convert raw PCM to WAV so Gemini can parse the audio
        pcm_bytes = base64.b64decode(req.audio_base64)
        wav_bytes = _pcm_to_wav(pcm_bytes, req.sample_rate_hertz, channels=1, bits_per_sample=16)
        print(f"[Transcribe-Gemini] PCM={len(pcm_bytes)} bytes -> WAV={len(wav_bytes)} bytes", flush=True)

        lang_names = {
            "hi-IN": "Hindi",
            "en-IN": "English",
            "mr-IN": "Marathi",
            "gu-IN": "Gujarati",
        }
        lang_name = lang_names.get(req.language_code, req.language_code)

        client = _get_genai_client()

        print(f"[Transcribe-Gemini] Calling gemini-2.0-flash with {len(wav_bytes)} bytes audio (lang={lang_name})...", flush=True)

        response = await client.aio.models.generate_content(
            model="gemini-2.0-flash",
            contents=genai_types.Content(
                parts=[
                    genai_types.Part(inline_data=genai_types.Blob(
                        data=wav_bytes,
                        mime_type="audio/wav",
                    )),
                    genai_types.Part(text=(
                        f"Transcribe this audio recording accurately. "
                        f"The primary language is {lang_name}. "
                        f"Return ONLY the transcription text, nothing else. "
                        f"If the audio is unclear or empty, return an empty string."
                    )),
                ]
            ),
        )

        text = response.text.strip() if response.text else None
        print(f"[Transcribe-Gemini] ✓ Result: {(text or 'None')[:200]}", flush=True)
        return {"transcript": text or None}

    except Exception as e:
        print(f"[Transcribe-Gemini] ✗ Failed: {e}", flush=True)
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Gemini transcription failed: {e}")


# ---------- Classify (Gemma) ----------

@app.post("/api/classify")
async def classify(req: ClassifyRequest):
    print(f"[Classify] Request: transcript_len={len(req.transcript)}", flush=True)
    system_prompt = (
        "You are a call classifier for an Indian retail shop. "
        "Classify this call transcript strictly as one of two categories: ORDER_CALL or PERSONAL_CALL. "
        "An ORDER_CALL contains any mention of products, quantities, prices, delivery, or purchase intent. "
        "Respond ONLY with the single word: ORDER_CALL or PERSONAL_CALL"
    )
    payload = {
        "contents": [
            {"parts": [{"text": f"{system_prompt}\n\nTranscript:\n{req.transcript}"}]}
        ]
    }
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                f"{GEMMA_URL}?key={GOOGLE_API_KEY}",
                json=payload,
            )
        if resp.status_code != 200:
            print(f"[Classify] Error {resp.status_code}: {resp.text[:500]}", flush=True)
            raise HTTPException(status_code=resp.status_code, detail=resp.text)

        data = resp.json()
        text = _extract_text(data)
        print(f"[Classify] Result: {text}", flush=True)
        if text is None:
            return {"classification": None}

        if "ORDER_CALL" in text:
            return {"classification": "ORDER_CALL"}
        elif "PERSONAL_CALL" in text:
            return {"classification": "PERSONAL_CALL"}
        return {"classification": None}
    except HTTPException:
        raise
    except Exception as e:
        print(f"[Classify] Exception: {e}", flush=True)
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Classification failed: {e}")


# ---------- Extract Order (Gemini) ----------

@app.post("/api/extract-order")
async def extract_order(req: ExtractOrderRequest):
    print(f"[ExtractOrder] Request: transcript_len={len(req.transcript)}", flush=True)
    system_prompt = f"""You are an order extraction assistant for an Indian retail shop. Extract all order information from this call transcript and return ONLY a valid JSON object (no markdown, no explanation) in this exact schema:
{{
  "customer_name": "string or null",
  "customer_phone": "string or null",
  "store_name": "string",
  "store_number": "string or null",
  "order_id": "string (generate a unique 8-char alphanumeric if not mentioned)",
  "products": [
    {{
      "name": "string",
      "quantity": number,
      "price": number
    }}
  ],
  "total_amount": number,
  "notes": "string or null"
}}
If any field cannot be determined, use null. Always generate an order_id. Use "{req.store_name}" as the store_name if not mentioned in the transcript."""

    payload = {
        "contents": [
            {"parts": [{"text": f"{system_prompt}\n\nTranscript:\n{req.transcript}"}]}
        ]
    }
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                f"{GEMINI_URL}?key={GEMINI_API_KEY}",
                json=payload,
            )
        if resp.status_code != 200:
            print(f"[ExtractOrder] Error {resp.status_code}: {resp.text[:500]}", flush=True)
            raise HTTPException(status_code=resp.status_code, detail=resp.text)

        data = resp.json()
        text = _extract_text(data)
        if text is None:
            print("[ExtractOrder] No text in response", flush=True)
            return {"order_json": None}

        # Strip markdown code fences
        cleaned = text
        if cleaned.startswith("```json"):
            cleaned = cleaned.removeprefix("```json")
        if cleaned.startswith("```"):
            cleaned = cleaned.removeprefix("```")
        if cleaned.endswith("```"):
            cleaned = cleaned.removesuffix("```")

        print(f"[ExtractOrder] ✓ Extracted order JSON ({len(cleaned)} chars)", flush=True)
        return {"order_json": cleaned.strip()}
    except HTTPException:
        raise
    except Exception as e:
        print(f"[ExtractOrder] Exception: {e}", flush=True)
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Order extraction failed: {e}")


# ---------- Gemini Live Token (OAuth) ----------

@app.get("/api/gemini-live-token")
async def gemini_live_token():
    """Exchange refresh token for a short-lived access token for Gemini Live WebSocket."""
    if not GOOGLE_OAUTH_REFRESH_TOKEN:
        raise HTTPException(status_code=500, detail="OAuth refresh token not configured")

    payload = {
        "client_id": GOOGLE_OAUTH_CLIENT_ID,
        "client_secret": GOOGLE_OAUTH_CLIENT_SECRET,
        "refresh_token": GOOGLE_OAUTH_REFRESH_TOKEN,
        "grant_type": "refresh_token",
    }
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(GOOGLE_TOKEN_URL, data=payload)

    if resp.status_code != 200:
        raise HTTPException(status_code=resp.status_code, detail=resp.text)

    data = resp.json()
    return {
        "access_token": data["access_token"],
        "expires_in": data.get("expires_in", 3600),
    }


# ---------- Helpers ----------

def _pcm_to_wav(
    pcm_data: bytes,
    sample_rate: int = 16000,
    channels: int = 1,
    bits_per_sample: int = 16,
) -> bytes:
    """Wrap raw PCM bytes in a WAV header."""
    byte_rate = sample_rate * channels * bits_per_sample // 8
    block_align = channels * bits_per_sample // 8
    data_size = len(pcm_data)
    buf = io.BytesIO()
    buf.write(b"RIFF")
    buf.write(struct.pack("<I", 36 + data_size))
    buf.write(b"WAVE")
    buf.write(b"fmt ")
    buf.write(struct.pack("<I", 16))
    buf.write(struct.pack("<H", 1))
    buf.write(struct.pack("<H", channels))
    buf.write(struct.pack("<I", sample_rate))
    buf.write(struct.pack("<I", byte_rate))
    buf.write(struct.pack("<H", block_align))
    buf.write(struct.pack("<H", bits_per_sample))
    buf.write(b"data")
    buf.write(struct.pack("<I", data_size))
    buf.write(pcm_data)
    return buf.getvalue()


def _extract_text(response_data: dict) -> str | None:
    candidates = response_data.get("candidates", [])
    if not candidates:
        return None
    parts = (candidates[0].get("content") or {}).get("parts", [])
    if not parts:
        return None
    return parts[0].get("text", "").strip() or None


print("[KikoCall] ✓ App ready", flush=True)
