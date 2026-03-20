import base64
import io
import os
import struct
import traceback
import time

import httpx
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

print("[KikoCall] Starting up...", flush=True)

app = FastAPI(title="KikoCall AI Proxy")

# ---------- Config ----------
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY", "")

# OAuth credentials (same approach as parchi for Gemini auth)
GOOGLE_OAUTH_CLIENT_ID = os.getenv("GOOGLE_OAUTH_CLIENT_ID", "")
GOOGLE_OAUTH_CLIENT_SECRET = os.getenv("GOOGLE_OAUTH_CLIENT_SECRET", "")
GOOGLE_OAUTH_REFRESH_TOKEN = os.getenv("GOOGLE_OAUTH_REFRESH_TOKEN", "")

GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models"
STT_URL = "https://speech.googleapis.com/v1/speech:recognize"

# Models
TRANSCRIBE_MODEL = "gemini-2.5-flash"
CLASSIFY_MODEL = "gemini-2.5-flash"
EXTRACT_MODEL = "gemini-2.5-flash"

print(f"[KikoCall] GOOGLE_API_KEY set: {bool(GOOGLE_API_KEY)}", flush=True)
print(f"[KikoCall] OAUTH configured: {bool(GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_REFRESH_TOKEN)}", flush=True)

# ---------- OAuth token cache ----------
_cached_token = None
_token_expiry = 0


async def _get_access_token() -> str:
    """Exchange refresh token for access token (cached until expiry)."""
    global _cached_token, _token_expiry

    if _cached_token and time.time() < _token_expiry - 60:
        return _cached_token

    if not GOOGLE_OAUTH_REFRESH_TOKEN:
        raise HTTPException(status_code=500, detail="GOOGLE_OAUTH_REFRESH_TOKEN not set")
    if not GOOGLE_OAUTH_CLIENT_ID:
        raise HTTPException(status_code=500, detail="GOOGLE_OAUTH_CLIENT_ID not set")

    print("[Auth] Exchanging refresh token for access token...", flush=True)
    payload = {
        "client_id": GOOGLE_OAUTH_CLIENT_ID,
        "client_secret": GOOGLE_OAUTH_CLIENT_SECRET,
        "refresh_token": GOOGLE_OAUTH_REFRESH_TOKEN,
        "grant_type": "refresh_token",
    }
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(GOOGLE_TOKEN_URL, data=payload)

    if resp.status_code != 200:
        print(f"[Auth] ✗ Token exchange failed {resp.status_code}: {resp.text}", flush=True)
        raise HTTPException(status_code=500, detail=f"OAuth token exchange failed: {resp.text}")

    data = resp.json()
    _cached_token = data["access_token"]
    _token_expiry = time.time() + data.get("expires_in", 3600)
    print("[Auth] ✓ Got access token", flush=True)
    return _cached_token


async def _call_gemini(model: str, payload: dict) -> dict:
    """Call Gemini API. Tries API key first, falls back to OAuth Bearer."""
    url = f"{GEMINI_BASE}/{model}:generateContent"
    errors = []

    # Method 1: API key
    if GOOGLE_API_KEY:
        try:
            print(f"[Gemini] Trying {model} with API key...", flush=True)
            async with httpx.AsyncClient(timeout=120) as client:
                resp = await client.post(f"{url}?key={GOOGLE_API_KEY}", json=payload)
            if resp.status_code == 200:
                print(f"[Gemini] ✓ API key auth succeeded", flush=True)
                return resp.json()
            err = f"API key: {resp.status_code} {resp.text[:300]}"
            print(f"[Gemini] ✗ {err}", flush=True)
            errors.append(err)
        except Exception as e:
            err = f"API key exception: {e}"
            print(f"[Gemini] ✗ {err}", flush=True)
            errors.append(err)

    # Method 2: OAuth Bearer token
    if GOOGLE_OAUTH_REFRESH_TOKEN:
        try:
            print(f"[Gemini] Trying {model} with OAuth Bearer...", flush=True)
            token = await _get_access_token()
            async with httpx.AsyncClient(timeout=120) as client:
                resp = await client.post(
                    url, json=payload,
                    headers={"Authorization": f"Bearer {token}"},
                )
            if resp.status_code == 200:
                print(f"[Gemini] ✓ OAuth auth succeeded", flush=True)
                return resp.json()
            err = f"OAuth: {resp.status_code} {resp.text[:300]}"
            print(f"[Gemini] ✗ {err}", flush=True)
            errors.append(err)
        except Exception as e:
            err = f"OAuth exception: {e}"
            print(f"[Gemini] ✗ {err}", flush=True)
            errors.append(err)

    all_errors = " | ".join(errors) if errors else "No auth methods configured"
    raise HTTPException(status_code=502, detail=f"All Gemini auth methods failed: {all_errors}")


def _extract_gemini_text(response_data: dict) -> str | None:
    candidates = response_data.get("candidates", [])
    if not candidates:
        return None
    parts = (candidates[0].get("content") or {}).get("parts", [])
    if not parts:
        return None
    return parts[0].get("text", "").strip() or None


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
        "google_api_key_set": bool(GOOGLE_API_KEY),
        "oauth_configured": bool(GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_REFRESH_TOKEN),
        "models": {
            "transcribe": TRANSCRIBE_MODEL,
            "classify": CLASSIFY_MODEL,
            "extract": EXTRACT_MODEL,
        },
    }


# ---------- Transcribe (Google Cloud STT) ----------

@app.post("/api/transcribe")
async def transcribe(req: TranscribeRequest):
    print(f"[STT] Request: lang={req.language_code}, audio_len={len(req.audio_base64)}", flush=True)
    try:
        payload = {
            "config": {
                "encoding": req.encoding,
                "sampleRateHertz": req.sample_rate_hertz,
                "languageCode": req.language_code,
                "enableAutomaticPunctuation": True,
            },
            "audio": {"content": req.audio_base64},
        }
        async with httpx.AsyncClient(timeout=120) as client:
            resp = await client.post(f"{STT_URL}?key={GOOGLE_API_KEY}", json=payload)

        if resp.status_code != 200:
            print(f"[STT] ✗ Error {resp.status_code}: {resp.text[:500]}", flush=True)
            raise HTTPException(status_code=resp.status_code, detail=resp.text)

        data = resp.json()
        results = data.get("results", [])
        transcript = " ".join(
            alt["transcript"]
            for r in results
            for alt in (r.get("alternatives") or [])
            if alt.get("transcript")
        )
        print(f"[STT] ✓ Result: {(transcript or 'None')[:100]}", flush=True)
        return {"transcript": transcript or None}

    except HTTPException:
        raise
    except Exception as e:
        print(f"[STT] ✗ Exception: {e}", flush=True)
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"STT failed: {e}")


# ---------- Transcribe via Gemini (fallback) ----------

@app.post("/api/transcribe-gemini")
async def transcribe_gemini(req: TranscribeGeminiRequest):
    """Fallback transcription: send audio to Gemini and ask for transcript."""
    print(f"[Transcribe-Gemini] Request: lang={req.language_code}, audio_len={len(req.audio_base64)}", flush=True)
    try:
        pcm_bytes = base64.b64decode(req.audio_base64)
        wav_bytes = _pcm_to_wav(pcm_bytes, req.sample_rate_hertz)
        wav_b64 = base64.b64encode(wav_bytes).decode("utf-8")
        print(f"[Transcribe-Gemini] PCM={len(pcm_bytes)}B -> WAV={len(wav_bytes)}B", flush=True)

        lang_names = {"hi-IN": "Hindi", "en-IN": "English", "mr-IN": "Marathi", "gu-IN": "Gujarati"}
        lang_name = lang_names.get(req.language_code, req.language_code)

        payload = {
            "contents": [{
                "parts": [
                    {"inline_data": {"mime_type": "audio/wav", "data": wav_b64}},
                    {"text": (
                        f"Transcribe this audio recording accurately. "
                        f"The primary language is {lang_name}. "
                        f"Return ONLY the transcription text, nothing else. "
                        f"If the audio is unclear or empty, return an empty string."
                    )},
                ]
            }]
        }

        data = await _call_gemini(TRANSCRIBE_MODEL, payload)
        text = _extract_gemini_text(data)
        print(f"[Transcribe-Gemini] ✓ Result: {(text or 'None')[:200]}", flush=True)
        return {"transcript": text or None}

    except HTTPException:
        raise
    except Exception as e:
        print(f"[Transcribe-Gemini] ✗ Exception: {e}", flush=True)
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Gemini transcription failed: {e}")


# ---------- Classify ----------

@app.post("/api/classify")
async def classify(req: ClassifyRequest):
    print(f"[Classify] Request: transcript_len={len(req.transcript)}", flush=True)
    try:
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

        data = await _call_gemini(CLASSIFY_MODEL, payload)
        text = _extract_gemini_text(data)
        print(f"[Classify] ✓ Result: {text}", flush=True)

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
        print(f"[Classify] ✗ Exception: {e}", flush=True)
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Classification failed: {e}")


# ---------- Extract Order ----------

@app.post("/api/extract-order")
async def extract_order(req: ExtractOrderRequest):
    print(f"[ExtractOrder] Request: transcript_len={len(req.transcript)}", flush=True)
    try:
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
      "quantity": "string (include unit if mentioned, e.g. '2 kg', '5 liters', '3 boxes', '1 dozen', or just '2' if no unit specified)",
      "price": number (use 0 if price not mentioned)
    }}
  ],
  "total_amount": number (use 0 if total not mentioned),
  "notes": "string or null"
}}
If any field cannot be determined, use null. Always generate an order_id. Use "{req.store_name}" as the store_name if not mentioned in the transcript."""

        payload = {
            "contents": [
                {"parts": [{"text": f"{system_prompt}\n\nTranscript:\n{req.transcript}"}]}
            ]
        }

        data = await _call_gemini(EXTRACT_MODEL, payload)
        text = _extract_gemini_text(data)
        if text is None:
            print("[ExtractOrder] ✗ No text in response", flush=True)
            return {"order_json": None}

        # Strip markdown code fences
        cleaned = text
        if cleaned.startswith("```json"):
            cleaned = cleaned.removeprefix("```json")
        if cleaned.startswith("```"):
            cleaned = cleaned.removeprefix("```")
        if cleaned.endswith("```"):
            cleaned = cleaned.removesuffix("```")

        print(f"[ExtractOrder] ✓ Extracted order ({len(cleaned)} chars)", flush=True)
        return {"order_json": cleaned.strip()}

    except HTTPException:
        raise
    except Exception as e:
        print(f"[ExtractOrder] ✗ Exception: {e}", flush=True)
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Order extraction failed: {e}")


# ---------- Gemini Live Token (OAuth) ----------

@app.get("/api/gemini-live-token")
async def gemini_live_token():
    """Exchange refresh token for a short-lived access token for Gemini Live WebSocket."""
    token = await _get_access_token()
    return {"access_token": token, "expires_in": 3600}


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


print("[KikoCall] ✓ App ready", flush=True)
