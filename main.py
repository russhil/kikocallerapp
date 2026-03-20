import asyncio
import base64
import collections
import io
import os
import random
import secrets
import struct
import traceback
import time
import urllib.parse

from typing import Optional

import httpx
from fastapi import FastAPI, HTTPException, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

print("[KikoCall] Starting up...", flush=True)

app = FastAPI(title="KikoCall AI Proxy")

# ---------- CORS (production) ----------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------- Request Logging Middleware ----------
@app.middleware("http")
async def log_requests(request: Request, call_next):
    start = time.time()
    response = await call_next(request)
    duration = time.time() - start
    print(f"[HTTP] {request.method} {request.url.path} -> {response.status_code} ({duration:.2f}s)", flush=True)
    return response

# ---------- Rate Limiter ----------
_rate_limits: dict[str, list[float]] = collections.defaultdict(list)
RATE_LIMIT_WINDOW = 300  # 5 minutes
RATE_LIMIT_MAX = 5  # max requests per window

def _check_rate_limit(key: str):
    """Simple in-memory rate limiter. Raises 429 if exceeded."""
    now = time.time()
    _rate_limits[key] = [t for t in _rate_limits[key] if now - t < RATE_LIMIT_WINDOW]
    if len(_rate_limits[key]) >= RATE_LIMIT_MAX:
        raise HTTPException(status_code=429, detail="Too many requests. Try again later.")
    _rate_limits[key].append(now)

# ---------- Keepalive (Render) ----------
KEEPALIVE_URL = os.getenv("KEEPALIVE_URL", "") # E.g. https://kikocall-backend.onrender.com/

async def keepalive_task():
    """Pings the keepalive URL every 7 minutes to prevent Render free tier from sleeping."""
    if not KEEPALIVE_URL:
        print("[Keepalive] ⚠ KEEPALIVE_URL not set. Background ping disabled.", flush=True)
        return
        
    print(f"[Keepalive] ✓ Background task started. Pinging {KEEPALIVE_URL} every 7 mins.", flush=True)
    async with httpx.AsyncClient(timeout=30) as client:
        while True:
            await asyncio.sleep(7 * 60) # 7 minutes
            try:
                resp = await client.get(KEEPALIVE_URL)
                print(f"[Keepalive] Pinged {KEEPALIVE_URL} - Status: {resp.status_code}", flush=True)
            except Exception as e:
                print(f"[Keepalive] ✗ Ping failed: {e}", flush=True)

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(keepalive_task())

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

# Gupshup SMS config
GUPSHUP_USERID = os.getenv("GUPSHUP_USERID", "2000202768")
GUPSHUP_PASSWORD = os.getenv("GUPSHUP_PASSWORD", "Kikotv@614")
GUPSHUP_URL = os.getenv("GUPSHUP_URL", "https://enterprise.smsgupshup.com/GatewayAPI/rest")
GUPSHUP_HASH_CODE = os.getenv("GUPSHUP_HASH_CODE", "bggVMT0/6Yc")

# Auth
AUTH_SECRET = os.getenv("AUTH_SECRET", secrets.token_hex(32))

print(f"[KikoCall] GOOGLE_API_KEY set: {bool(GOOGLE_API_KEY)}", flush=True)
print(f"[KikoCall] OAUTH configured: {bool(GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_REFRESH_TOKEN)}", flush=True)
print(f"[KikoCall] Gupshup configured: userid={GUPSHUP_USERID}", flush=True)

# ---------- Supabase ----------
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")
_supabase_client = None

if SUPABASE_URL and SUPABASE_KEY:
    try:
        from supabase import create_client
        _supabase_client = create_client(SUPABASE_URL, SUPABASE_KEY)
        print("[KikoCall] Supabase configured ✓", flush=True)
    except ImportError:
        print("[KikoCall] supabase package not installed, sync disabled", flush=True)
    except Exception as e:
        print(f"[KikoCall] Supabase init failed: {e}", flush=True)
else:
    print("[KikoCall] Supabase not configured (SUPABASE_URL/SUPABASE_KEY missing)", flush=True)

# ---------- Auth helpers ----------
security = HTTPBearer(auto_error=False)


def _require_supabase():
    if _supabase_client is None:
        raise HTTPException(status_code=503, detail="Supabase not configured")
    return _supabase_client


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    """Extract and validate auth token from Authorization header."""
    if not credentials:
        raise HTTPException(status_code=401, detail="Authorization header missing")
    token = credentials.credentials
    sb = _require_supabase()
    try:
        result = sb.table("users").select("*").eq("auth_token", token).execute()
        if not result.data:
            raise HTTPException(status_code=401, detail="Invalid or expired token")
        return result.data[0]
    except HTTPException:
        raise
    except Exception as e:
        print(f"[Auth] Token validation failed: {e}", flush=True)
        raise HTTPException(status_code=401, detail="Token validation failed")


async def get_optional_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> Optional[dict]:
    """Like get_current_user but returns None instead of 401."""
    if not credentials:
        return None
    try:
        return await get_current_user(credentials)
    except HTTPException:
        return None


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


class SyncOrderRequest(BaseModel):
    order_id: str
    recording_id: Optional[int] = None
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    store_name: str = ""
    store_number: Optional[str] = None
    products: list[dict] = []
    total_amount: float = 0.0
    notes: Optional[str] = None
    address: Optional[str] = None
    whatsapp_sent: bool = False
    is_read: bool = False
    created_at: Optional[int] = None
    call_direction: str = "INCOMING"


class SyncRecordingRequest(BaseModel):
    device_id: str = ""
    filename: str
    path: str
    duration_ms: int = 0
    date_recorded: int = 0
    transcript: Optional[str] = None
    classification: Optional[str] = None
    is_processed: bool = False
    source_phone: Optional[str] = None
    contact_name: Optional[str] = None
    call_direction: str = "INCOMING"
    created_at: Optional[int] = None


class UpdateOrderRequest(BaseModel):
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    store_name: Optional[str] = None
    store_number: Optional[str] = None
    products: Optional[list[dict]] = None
    total_amount: Optional[float] = None
    notes: Optional[str] = None
    address: Optional[str] = None
    whatsapp_sent: Optional[bool] = None
    is_read: Optional[bool] = None


# ---------- Auth request models ----------

class SendOtpRequest(BaseModel):
    phone: str


class VerifyOtpRequest(BaseModel):
    phone: str
    otp: str


class SignupRequest(BaseModel):
    shop_name: str
    shopkeeper_name: str


# ============================================================
# AUTH ENDPOINTS
# ============================================================

@app.post("/api/auth/send-otp")
async def send_otp(req: SendOtpRequest):
    """Generate OTP and send via Gupshup SMS."""
    phone = req.phone.replace("+", "").strip()
    if not phone:
        raise HTTPException(status_code=400, detail="Phone number required")

    # Rate limit per phone number
    _check_rate_limit(f"otp:{phone}")

    # Ensure 10-digit number gets 91 prefix
    if len(phone) == 10:
        phone = f"91{phone}"

    otp = str(random.randint(100000, 999999))
    expires_at = int(time.time() * 1000) + (5 * 60 * 1000)  # 5 minutes

    print(f"[Auth] Sending OTP to {phone}: {otp}", flush=True)

    # Store OTP in Supabase
    sb = _require_supabase()
    try:
        # Upsert user row with OTP (creates if not exists)
        sb.table("users").upsert(
            {
                "phone": phone,
                "otp_code": otp,
                "otp_expires_at": expires_at,
            },
            on_conflict="phone"
        ).execute()
    except Exception as e:
        print(f"[Auth] Failed to store OTP: {e}", flush=True)
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to store OTP: {e}")

    # Send SMS via Gupshup (GET request with query params)
    msg_text = f"Use {otp} as your OTP for Kiko Live login {GUPSHUP_HASH_CODE}"

    params = {
        "send_to": phone,
        "userid": GUPSHUP_USERID,
        "password": GUPSHUP_PASSWORD,
        "auth_scheme": "plain",
        "method": "SendMessage",
        "v": "1.1",
        "format": "text",
        "msg": msg_text,
        "msg_type": "TEXT",
    }

    try:
        # Build URL with encoded params (matching existing Gupshup integration pattern)
        query_string = urllib.parse.urlencode(params)
        full_url = f"{GUPSHUP_URL}?{query_string}"
        print(f"[Gupshup] Sending SMS: {full_url}", flush=True)

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(full_url)

        response_text = resp.text.strip()
        print(f"[Gupshup] Response: {response_text}", flush=True)

        if response_text.startswith("success"):
            return {"status": "ok", "message": "OTP sent successfully"}
        else:
            print(f"[Gupshup] ✗ SMS send failed: {response_text}", flush=True)
            raise HTTPException(status_code=502, detail=f"SMS send failed: {response_text}")

    except HTTPException:
        raise
    except Exception as e:
        print(f"[Gupshup] ✗ Exception: {e}", flush=True)
        traceback.print_exc()
        raise HTTPException(status_code=502, detail=f"SMS send failed: {e}")


@app.post("/api/auth/verify-otp")
async def verify_otp(req: VerifyOtpRequest):
    """Verify OTP. Returns token + user info. If user is new (no shop_name), returns is_new_user=True."""
    phone = req.phone.replace("+", "").strip()
    if len(phone) == 10:
        phone = f"91{phone}"

    sb = _require_supabase()
    try:
        result = sb.table("users").select("*").eq("phone", phone).execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="Phone not found. Send OTP first.")

        user = result.data[0]
        now_ms = int(time.time() * 1000)

        # Check OTP
        if user.get("otp_code") != req.otp:
            raise HTTPException(status_code=401, detail="Invalid OTP")
        if user.get("otp_expires_at", 0) < now_ms:
            raise HTTPException(status_code=401, detail="OTP expired")

        # Generate auth token
        auth_token = secrets.token_hex(32)

        # Clear OTP and set token
        sb.table("users").update({
            "otp_code": None,
            "otp_expires_at": 0,
            "auth_token": auth_token,
        }).eq("phone", phone).execute()

        # Check if user is new (no shop_name set)
        is_new_user = not user.get("shop_name")

        print(f"[Auth] ✓ OTP verified for {phone}, is_new={is_new_user}", flush=True)
        return {
            "status": "ok",
            "token": auth_token,
            "is_new_user": is_new_user,
            "user": {
                "phone": phone,
                "shop_name": user.get("shop_name", ""),
                "shopkeeper_name": user.get("shopkeeper_name", ""),
            }
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"[Auth] ✗ Verify OTP failed: {e}", flush=True)
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"OTP verification failed: {e}")


@app.post("/api/auth/signup")
async def signup(req: SignupRequest, user: dict = Depends(get_current_user)):
    """Complete signup for a new user — sets shop_name and shopkeeper_name.
    Uses the auth token from verify-otp (Bearer header) instead of re-checking OTP."""
    phone = user["phone"]

    sb = _require_supabase()
    try:
        # Update user profile with shop details
        sb.table("users").update({
            "shop_name": req.shop_name,
            "shopkeeper_name": req.shopkeeper_name,
        }).eq("phone", phone).execute()

        # Initialize order counter for this user
        sb.table("order_counters").upsert(
            {"user_phone": phone, "last_order_num": 0},
            on_conflict="user_phone"
        ).execute()

        print(f"[Auth] ✓ Signup complete for {phone}: {req.shop_name}", flush=True)
        return {
            "status": "ok",
            "token": user["auth_token"],
            "user": {
                "phone": phone,
                "shop_name": req.shop_name,
                "shopkeeper_name": req.shopkeeper_name,
            }
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"[Auth] ✗ Signup failed: {e}", flush=True)
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Signup failed: {e}")


@app.get("/api/auth/me")
async def get_me(user: dict = Depends(get_current_user)):
    """Return current user profile."""
    return {
        "user": {
            "phone": user["phone"],
            "shop_name": user.get("shop_name", ""),
            "shopkeeper_name": user.get("shopkeeper_name", ""),
        }
    }


# ============================================================
# SERIALIZED ORDER ID
# ============================================================

@app.get("/api/orders/next-id")
async def get_next_order_id(user: dict = Depends(get_current_user)):
    """Generate next serialized order ID for the authenticated user.
    Uses atomic Supabase RPC function to prevent race conditions."""
    sb = _require_supabase()
    phone = user["phone"]
    phone_last4 = phone[-4:]

    try:
        # Atomic increment via Supabase RPC (race-condition safe)
        try:
            result = sb.rpc("increment_order_counter", {"p_user_phone": phone}).execute()
            next_num = result.data if isinstance(result.data, int) else int(result.data)
        except Exception:
            # Fallback to manual increment if RPC not available
            result = sb.table("order_counters").select("*").eq("user_phone", phone).execute()
            if not result.data:
                sb.table("order_counters").insert({"user_phone": phone, "last_order_num": 0}).execute()
                current_num = 0
            else:
                current_num = result.data[0]["last_order_num"]
            next_num = current_num + 1
            sb.table("order_counters").update(
                {"last_order_num": next_num}
            ).eq("user_phone", phone).execute()

        order_id = f"KIKO-{phone_last4}-{next_num:04d}"
        print(f"[OrderID] ✓ Generated {order_id} for {phone}", flush=True)
        return {"order_id": order_id, "order_num": next_num}

    except HTTPException:
        raise
    except Exception as e:
        print(f"[OrderID] ✗ Exception: {e}", flush=True)
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to generate order ID: {e}")


# ---------- Health ----------

@app.get("/")
def health():
    return {
        "status": "ok",
        "google_api_key_set": bool(GOOGLE_API_KEY),
        "oauth_configured": bool(GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_REFRESH_TOKEN),
        "supabase_configured": _supabase_client is not None,
        "gupshup_configured": bool(GUPSHUP_USERID),
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
  "notes": "string or null",
  "address": "string or null (delivery address if mentioned by the customer)"
}}

IMPORTANT: ALL output text MUST be in English script (Roman/Latin alphabet) only. Even if the transcript is in Hindi, Marathi, Gujarati, or any other Indian language, transliterate all names, product names, notes, and addresses into English script. Do NOT use Devanagari, Arabic, or any non-Latin script. For example: use "Atta" not "आटा", "Chawal" not "चावल", "Rajesh" not "राजेश".

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


# ---------- Sync Recording to Supabase ----------

@app.post("/api/sync-recording")
async def sync_recording(req: SyncRecordingRequest, user: Optional[dict] = Depends(get_optional_user)):
    print(f"[SyncRecording] Request: filename={req.filename}", flush=True)
    sb = _require_supabase()
    try:
        row = {
            "device_id": req.device_id,
            "filename": req.filename,
            "path": req.path,
            "duration_ms": req.duration_ms,
            "date_recorded": req.date_recorded,
            "transcript": req.transcript,
            "classification": req.classification,
            "is_processed": req.is_processed,
            "source_phone": req.source_phone,
            "contact_name": req.contact_name,
            "call_direction": req.call_direction,
        }
        if user:
            row["user_phone"] = user["phone"]
        if req.created_at is not None:
            row["created_at"] = req.created_at
        result = sb.table("recordings").upsert(
            row, on_conflict="device_id,path"
        ).execute()
        rec_id = result.data[0]["id"] if result.data else None
        print(f"[SyncRecording] ✓ Upserted recording id={rec_id}", flush=True)
        return {"status": "ok", "id": rec_id}
    except Exception as e:
        print(f"[SyncRecording] ✗ Exception: {e}", flush=True)
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Sync recording failed: {e}")


# ---------- Sync Order to Supabase ----------

@app.post("/api/sync-order")
async def sync_order(req: SyncOrderRequest, user: Optional[dict] = Depends(get_optional_user)):
    print(f"[SyncOrder] Request: order_id={req.order_id}", flush=True)
    sb = _require_supabase()
    try:
        row = {
            "order_id": req.order_id,
            "customer_name": req.customer_name,
            "customer_phone": req.customer_phone,
            "store_name": req.store_name,
            "store_number": req.store_number,
            "products": req.products,
            "total_amount": req.total_amount,
            "notes": req.notes,
            "address": req.address,
            "whatsapp_sent": req.whatsapp_sent,
            "is_read": req.is_read,
            "call_direction": req.call_direction,
        }
        if user:
            row["user_phone"] = user["phone"]
        if req.recording_id is not None:
            row["recording_id"] = req.recording_id
        if req.created_at is not None:
            row["created_at"] = req.created_at
        sb.table("orders").upsert(row, on_conflict="order_id").execute()
        print(f"[SyncOrder] ✓ Upserted order {req.order_id}", flush=True)
        return {"status": "ok", "order_id": req.order_id}
    except Exception as e:
        print(f"[SyncOrder] ✗ Exception: {e}", flush=True)
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Sync failed: {e}")


# ---------- Get Orders (scoped to user) ----------

@app.get("/api/orders")
async def list_orders(
    store_name: str = "",
    limit: int = 100,
    offset: int = 0,
    user: Optional[dict] = Depends(get_optional_user),
):
    sb = _require_supabase()
    try:
        query = sb.table("orders").select("*").order("created_at", desc=True)
        if user:
            query = query.eq("user_phone", user["phone"])
        if store_name:
            query = query.eq("store_name", store_name)
        result = query.range(offset, offset + limit - 1).execute()
        return {"orders": result.data}
    except Exception as e:
        print(f"[ListOrders] ✗ Exception: {e}", flush=True)
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to list orders: {e}")


@app.get("/api/orders/{order_id}")
async def get_order(order_id: str):
    sb = _require_supabase()
    try:
        result = sb.table("orders").select("*").eq("order_id", order_id).execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="Order not found")
        return {"order": result.data[0]}
    except HTTPException:
        raise
    except Exception as e:
        print(f"[GetOrder] ✗ Exception: {e}", flush=True)
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to get order: {e}")


# ---------- Update Order ----------

@app.put("/api/orders/{order_id}")
async def update_order(order_id: str, req: UpdateOrderRequest):
    sb = _require_supabase()
    try:
        updates = {k: v for k, v in req.model_dump().items() if v is not None}
        if not updates:
            raise HTTPException(status_code=400, detail="No fields to update")
        result = sb.table("orders").update(updates).eq("order_id", order_id).execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="Order not found")
        return {"status": "ok", "order": result.data[0]}
    except HTTPException:
        raise
    except Exception as e:
        print(f"[UpdateOrder] ✗ Exception: {e}", flush=True)
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to update order: {e}")


# ---------- Delete Order ----------

@app.delete("/api/orders/{order_id}")
async def delete_order(order_id: str):
    sb = _require_supabase()
    try:
        sb.table("orders").delete().eq("order_id", order_id).execute()
        print(f"[DeleteOrder] ✓ Deleted order {order_id}", flush=True)
        return {"status": "ok", "order_id": order_id}
    except Exception as e:
        print(f"[DeleteOrder] ✗ Exception: {e}", flush=True)
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to delete order: {e}")


# ---------- Get Recordings ----------

@app.get("/api/recordings")
async def list_recordings(device_id: str = "", limit: int = 100, offset: int = 0):
    sb = _require_supabase()
    try:
        query = sb.table("recordings").select("*").order("date_recorded", desc=True)
        if device_id:
            query = query.eq("device_id", device_id)
        result = query.range(offset, offset + limit - 1).execute()
        return {"recordings": result.data}
    except Exception as e:
        print(f"[ListRecordings] ✗ Exception: {e}", flush=True)
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to list recordings: {e}")


@app.get("/api/recordings/{recording_id}")
async def get_recording(recording_id: int):
    sb = _require_supabase()
    try:
        result = sb.table("recordings").select("*").eq("id", recording_id).execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="Recording not found")
        return {"recording": result.data[0]}
    except HTTPException:
        raise
    except Exception as e:
        print(f"[GetRecording] ✗ Exception: {e}", flush=True)
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to get recording: {e}")


# ---------- Delete Recording ----------

@app.delete("/api/recordings/{recording_id}")
async def delete_recording(recording_id: int):
    sb = _require_supabase()
    try:
        sb.table("recordings").delete().eq("id", recording_id).execute()
        print(f"[DeleteRecording] ✓ Deleted recording {recording_id}", flush=True)
        return {"status": "ok", "id": recording_id}
    except Exception as e:
        print(f"[DeleteRecording] ✗ Exception: {e}", flush=True)
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to delete recording: {e}")


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
