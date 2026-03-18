import os
import httpx
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from dotenv import load_dotenv

# Load .env if present (local dev), otherwise Render provides env vars
load_dotenv()

app = FastAPI(title="KikoCall AI Proxy")

GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY", "")      # Gemma + STT
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")       # Gemini Flash

# OAuth credentials for Gemini Live
GOOGLE_OAUTH_CLIENT_ID = os.getenv("GOOGLE_OAUTH_CLIENT_ID", "")
GOOGLE_OAUTH_CLIENT_SECRET = os.getenv("GOOGLE_OAUTH_CLIENT_SECRET", "")
GOOGLE_OAUTH_REFRESH_TOKEN = os.getenv("GOOGLE_OAUTH_REFRESH_TOKEN", "")

GEMMA_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemma-3-27b-it:generateContent"
GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent"
STT_URL = "https://speech.googleapis.com/v1/speech:recognize"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"


# ---------- Request models ----------

class TranscribeRequest(BaseModel):
    audio_base64: str
    language_code: str = "hi-IN"
    encoding: str = "LINEAR16"
    sample_rate_hertz: int = 16000


class ClassifyRequest(BaseModel):
    transcript: str


class ExtractOrderRequest(BaseModel):
    transcript: str
    store_name: str = ""


# ---------- Health ----------

@app.get("/")
def health():
    return {"status": "ok"}


# ---------- Transcribe (Google STT) ----------

@app.post("/api/transcribe")
async def transcribe(req: TranscribeRequest):
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
        resp = await client.post(
            f"{STT_URL}?key={GOOGLE_API_KEY}",
            json=payload,
        )
    if resp.status_code != 200:
        raise HTTPException(status_code=resp.status_code, detail=resp.text)

    data = resp.json()
    results = data.get("results", [])
    transcript = " ".join(
        alt["transcript"]
        for r in results
        for alt in (r.get("alternatives") or [])
        if alt.get("transcript")
    )
    return {"transcript": transcript or None}


# ---------- Classify (Gemma) ----------

@app.post("/api/classify")
async def classify(req: ClassifyRequest):
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
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            f"{GEMMA_URL}?key={GOOGLE_API_KEY}",
            json=payload,
        )
    if resp.status_code != 200:
        raise HTTPException(status_code=resp.status_code, detail=resp.text)

    data = resp.json()
    text = _extract_text(data)
    if text is None:
        return {"classification": None}

    if "ORDER_CALL" in text:
        return {"classification": "ORDER_CALL"}
    elif "PERSONAL_CALL" in text:
        return {"classification": "PERSONAL_CALL"}
    return {"classification": None}


# ---------- Extract Order (Gemini) ----------

@app.post("/api/extract-order")
async def extract_order(req: ExtractOrderRequest):
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
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            f"{GEMINI_URL}?key={GEMINI_API_KEY}",
            json=payload,
        )
    if resp.status_code != 200:
        raise HTTPException(status_code=resp.status_code, detail=resp.text)

    data = resp.json()
    text = _extract_text(data)
    if text is None:
        return {"order_json": None}

    # Strip markdown code fences
    cleaned = text
    if cleaned.startswith("```json"):
        cleaned = cleaned.removeprefix("```json")
    if cleaned.startswith("```"):
        cleaned = cleaned.removeprefix("```")
    if cleaned.endswith("```"):
        cleaned = cleaned.removesuffix("```")

    return {"order_json": cleaned.strip()}


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

def _extract_text(response_data: dict) -> str | None:
    candidates = response_data.get("candidates", [])
    if not candidates:
        return None
    parts = (candidates[0].get("content") or {}).get("parts", [])
    if not parts:
        return None
    return parts[0].get("text", "").strip() or None
