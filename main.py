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

from typing import Optional, Union, Any
from datetime import datetime

import httpx
from fastapi import FastAPI, HTTPException, Request, Depends, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

print("[KikoCall] Starting up...", flush=True)

app = FastAPI(title="KikoCall AI Proxy")

# ---------- Serving Dashboard ----------
from fastapi.staticfiles import StaticFiles
dashboard_path = os.path.join(os.path.dirname(__file__), "dashboard")
if os.path.exists(dashboard_path):
    app.mount("/dashboard", StaticFiles(directory=dashboard_path, html=True), name="dashboard")

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
_rate_limit_last_cleanup = 0.0
RATE_LIMIT_WINDOW = 300  # 5 minutes
RATE_LIMIT_MAX = 5  # max requests per window
RATE_LIMIT_CLEANUP_INTERVAL = 600  # cleanup stale keys every 10 minutes

def _check_rate_limit(key: str):
    """In-memory rate limiter with periodic cleanup to prevent unbounded memory growth."""
    global _rate_limit_last_cleanup
    now = time.time()

    # Periodic cleanup: remove keys with no recent activity to prevent OOM at scale
    if now - _rate_limit_last_cleanup > RATE_LIMIT_CLEANUP_INTERVAL:
        stale_keys = [k for k, timestamps in _rate_limits.items() if not timestamps or now - timestamps[-1] > RATE_LIMIT_WINDOW]
        for k in stale_keys:
            del _rate_limits[k]
        _rate_limit_last_cleanup = now

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
GEMINI_BASE = "https://generativelanguage.googleapis.com/v1/models"
STT_URL = "https://speech.googleapis.com/v1/speech:recognize"

# Models
# Models (configurable via env vars)
TRANSCRIBE_MODEL = os.getenv("TRANSCRIBE_MODEL", "gemini-1.5-flash")
CLASSIFY_MODEL = os.getenv("CLASSIFY_MODEL", "gemini-1.5-flash")
EXTRACT_MODEL = os.getenv("EXTRACT_MODEL", "gemini-1.5-flash")

# Gupshup SMS config
GUPSHUP_USERID = os.getenv("GUPSHUP_USERID", "2000202768")
GUPSHUP_PASSWORD = os.getenv("GUPSHUP_PASSWORD", "Kikotv@614")
GUPSHUP_URL = os.getenv("GUPSHUP_URL", "https://enterprise.smsgupshup.com/GatewayAPI/rest")
GUPSHUP_HASH_CODE = os.getenv("GUPSHUP_HASH_CODE", "WkvzfHFQrep")

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
        # Startup health check — verify DB is reachable
        try:
            _health = _supabase_client.table("stores").select("phone", count="exact").limit(1).execute()
            print(f"[KikoCall] ✓ Supabase health check passed — stores count: {_health.count}", flush=True)
        except Exception as _he:
            print(f"[KikoCall] ⚠ Supabase health check FAILED: {_he}", flush=True)
            print("[KikoCall] ⚠ DB writes may silently fail! Check SUPABASE_URL/SUPABASE_KEY.", flush=True)
    except ImportError:
        print("[KikoCall] ✗ supabase package not installed, sync disabled", flush=True)
    except Exception as e:
        print(f"[KikoCall] ✗ Supabase init failed: {e}", flush=True)
else:
    print("[KikoCall] ✗ Supabase NOT configured (SUPABASE_URL/SUPABASE_KEY missing) — all DB operations disabled!", flush=True)

# ---------- Activity Logging to Supabase ----------

def _log_activity(
    action: str,
    store_phone: str = None,
    entity_type: str = None,
    entity_id: str = None,
    metadata: dict = None,
    request: Request = None,
):
    """Fire-and-forget log to activity_log table in Supabase.
    Non-blocking: failures are silently logged to stdout."""
    if _supabase_client is None:
        print(f"[ActivityLog] ✗ Supabase not configured — cannot log '{action}' for store_phone={store_phone}", flush=True)
        return
    try:
        row = {
            "action": action,
            "created_at": int(time.time() * 1000),
        }
        if store_phone:
            row["store_phone"] = store_phone
            row["user_phone"] = store_phone
        if entity_type:
            row["entity_type"] = entity_type
        if entity_id:
            row["entity_id"] = entity_id
        if metadata:
            row["metadata"] = metadata
        if request:
            row["ip_address"] = request.client.host if request.client else None
            row["user_agent"] = request.headers.get("user-agent", "")[:500]
        _supabase_client.table("activity_log").insert(row).execute()
    except Exception as e:
        print(f"[ActivityLog] ⚠ Failed to log '{action}': {e}", flush=True)


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


async def _call_gemini(model: str, payload: dict, timeout_seconds: int = 90) -> dict:
    """Call Gemini API. Tries API key first, falls back to OAuth Bearer.
    Default timeout is 90s (was 120s) to prevent app-side timeout races."""
    url = f"{GEMINI_BASE}/{model}:generateContent"
    errors = []

    # Method 1: API key
    if GOOGLE_API_KEY:
        try:
            print(f"[Gemini] Trying {model} with API key...", flush=True)
            async with httpx.AsyncClient(timeout=timeout_seconds) as client:
                resp = await client.post(f"{url}?key={GOOGLE_API_KEY}", json=payload)
            if resp.status_code == 200:
                print(f"[Gemini] ✓ API key auth succeeded", flush=True)
                return resp.json()
            body = resp.text[:1000]
            err = f"API key: {resp.status_code} {body}"
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
            async with httpx.AsyncClient(timeout=timeout_seconds) as client:
                resp = await client.post(
                    url, json=payload,
                    headers={"Authorization": f"Bearer {token}"},
                )
            if resp.status_code == 200:
                print(f"[Gemini] ✓ OAuth auth succeeded", flush=True)
                return resp.json()
            body = resp.text[:1000]
            err = f"OAuth: {resp.status_code} {body}"
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

# Max ~30MB of base64 (≈22MB raw audio), prevents OOM from massive payloads
AUDIO_BASE64_MAX_LENGTH = 30_000_000

class TranscribeRequest(BaseModel):
    audio_base64: str
    language_code: str = "hi-IN"
    encoding: str = "LINEAR16"
    sample_rate_hertz: int = 16000


class TranscribeRawRequest(BaseModel):
    audio_base64: str
    mime_type: str = "audio/mp3"
    language_code: str = "hi-IN"


class TranscribeGeminiRequest(BaseModel):
    audio_base64: str
    language_code: str = "hi-IN"
    sample_rate_hertz: int = 16000
    mime_type: Optional[str] = None



class ClassifyRequest(BaseModel):
    transcript: str


class ExtractOrderRequest(BaseModel):
    transcript: str
    store_name: str = ""


class SyncOrderRequest(BaseModel):
    order_id: str
    recording_id: Optional[int] = None
    recording_filename: Optional[str] = None
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    customer_address: Optional[str] = None
    store_name: str = ""
    store_number: Optional[str] = None
    products: list[dict] = []
    total_amount: float = 0.0
    notes: Optional[str] = None
    address: Optional[str] = None
    whatsapp_sent: bool = False
    is_read: bool = False
    is_cancelled: bool = False
    cancelled_at: Optional[Union[int, str]] = None
    cancel_reason: Optional[str] = None
    order_source: str = "call"
    call_direction: str = "INCOMING"
    payment_status: str = "pending"
    payment_method: Optional[str] = None
    delivery_status: str = "pending"
    delivered_at: Optional[Union[int, str]] = None
    confidence_score: Optional[float] = None
    processing_time_ms: Optional[int] = None
    device_model: Optional[str] = None
    device_os_version: Optional[str] = None
    app_version: Optional[str] = None
    session_id: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    created_at: Optional[Union[int, str]] = None


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
    call_type: Optional[str] = None
    sim_slot: Optional[int] = None
    network_type: Optional[str] = None
    language_detected: Optional[str] = None
    sentiment: Optional[str] = None
    audio_quality_score: Optional[float] = None
    word_count: Optional[int] = None
    speaker_count: Optional[int] = None
    processing_time_ms: Optional[int] = None
    ai_model_used: Optional[str] = None
    transcript_confidence: Optional[float] = None
    created_at: Optional[Union[int, str]] = None


class UpdateOrderRequest(BaseModel):
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    customer_address: Optional[str] = None
    store_name: Optional[str] = None
    store_number: Optional[str] = None
    products: Optional[list[dict]] = None
    total_amount: Optional[float] = None
    notes: Optional[str] = None
    address: Optional[str] = None
    whatsapp_sent: Optional[bool] = None
    is_read: Optional[bool] = None
    is_cancelled: Optional[bool] = None
    cancelled_at: Optional[Union[int, str]] = None
    cancel_reason: Optional[str] = None
    payment_status: Optional[str] = None
    payment_method: Optional[str] = None
    delivery_status: Optional[str] = None
    delivered_at: Optional[Union[int, str]] = None


# ---------- Auth request models ----------

class SendOtpRequest(BaseModel):
    phone: str


class VerifyOtpRequest(BaseModel):
    phone: str
    otp: str


class SignupRequest(BaseModel):
    shop_name: str
    shopkeeper_name: str
    store_category: Optional[str] = None
    store_address: Optional[str] = None
    store_city: Optional[str] = None
    store_state: Optional[str] = None
    store_pincode: Optional[str] = None


# ============================================================
# AUTH ENDPOINTS
# ============================================================

@app.post("/api/auth/send-otp")
async def send_otp(req: SendOtpRequest, request: Request = None):
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
        # Step 1: Ensure a store row exists for this phone (FK requirement)
        # Check if store already exists
        store_check = sb.table("stores").select("phone").eq("phone", phone).execute()
        if not store_check.data:
            # Insert new store row
            print(f"[Auth] Creating store row for {phone}", flush=True)
            sb.table("stores").insert({"phone": phone, "store_name": "", "owner_name": ""}).execute()
            print(f"[Auth] ✓ Store row created for {phone}", flush=True)
        else:
            print(f"[Auth] Store row already exists for {phone}", flush=True)

        # Step 2: Upsert user row with OTP (creates if not exists)
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
    msg_text = f"<#> Use {otp} as your OTP for Kiko Live login {GUPSHUP_HASH_CODE}"

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
            _log_activity("auth.otp_sent", store_phone=phone, entity_type="user", entity_id=phone, request=request)
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
async def verify_otp(req: VerifyOtpRequest, request: Request = None):
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

        # Clear OTP and set token, increment login count
        sb.table("users").update({
            "otp_code": None,
            "otp_expires_at": 0,
            "auth_token": auth_token,
            "last_login_at": now_ms,
            "login_count": (user.get("login_count") or 0) + 1,
        }).eq("phone", phone).execute()

        # Update store last_active_at
        try:
            sb.table("stores").update({"last_active_at": now_ms}).eq("phone", phone).execute()
        except Exception:
            pass  # Non-critical

        # Check if user is new (no shop_name set)
        is_new_user = not user.get("shop_name")

        _log_activity("auth.login", store_phone=phone, entity_type="user", entity_id=phone,
                      metadata={"is_new_user": is_new_user}, request=request)
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
async def signup(req: SignupRequest, request: Request = None, user: dict = Depends(get_current_user)):
    """Complete signup for a new user — sets shop_name and shopkeeper_name.
    Uses the auth token from verify-otp (Bearer header) instead of re-checking OTP."""
    phone = user["phone"]

    sb = _require_supabase()
    try:
        # Create/update the store record (phone is PK)
        store_row = {
            "phone": phone,
            "store_name": req.shop_name,
            "owner_name": req.shopkeeper_name,
            "onboarding_completed": True,
        }
        if req.store_category:
            store_row["store_category"] = req.store_category
        if req.store_address:
            store_row["store_address"] = req.store_address
        if req.store_city:
            store_row["store_city"] = req.store_city
        if req.store_state:
            store_row["store_state"] = req.store_state
        if req.store_pincode:
            store_row["store_pincode"] = req.store_pincode

        sb.table("stores").upsert(store_row, on_conflict="phone").execute()

        # Update user profile with shop details
        sb.table("users").update({
            "shop_name": req.shop_name,
            "shopkeeper_name": req.shopkeeper_name,
        }).eq("phone", phone).execute()

        # Initialize order counter for this store
        sb.table("order_counters").upsert(
            {"user_phone": phone, "last_order_num": 0},
            on_conflict="user_phone"
        ).execute()

        _log_activity("auth.signup", store_phone=phone, entity_type="store", entity_id=phone,
                      metadata={"shop_name": req.shop_name, "category": req.store_category, "city": req.store_city}, request=request)
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
async def transcribe(req: TranscribeRequest, request: Request = None, user: dict = Depends(get_current_user)):
    if len(req.audio_base64) > AUDIO_BASE64_MAX_LENGTH:
        raise HTTPException(status_code=413, detail="Audio payload too large (max 20MB)")
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
        _log_activity("api.transcribe", store_phone=user.get("phone"), entity_type="recording",
                      metadata={"lang": req.language_code, "audio_len": len(req.audio_base64), "has_result": bool(transcript)}, request=request)
        return {"transcript": transcript or None}

    except HTTPException:
        raise
    except Exception as e:
        print(f"[STT] ✗ Exception: {e}", flush=True)
        traceback.print_exc()
        _log_activity("api.transcribe.error", store_phone=user.get("phone"), entity_type="recording",
                      metadata={"error": str(e)[:200]}, request=request)
        raise HTTPException(status_code=500, detail=f"STT failed: {e}")


# ---------- Transcribe via Gemini ----------

@app.post("/api/transcribe-gemini")
async def transcribe_gemini(req: TranscribeGeminiRequest, request: Request = None, user: dict = Depends(get_current_user)):
    if len(req.audio_base64) > AUDIO_BASE64_MAX_LENGTH:
        raise HTTPException(status_code=413, detail="Audio payload too large (max 20MB)")
    """Transcription via Gemini with auto-detection of audio format.
    Auto-detects if audio is PCM (needs WAV wrapping) or a container format (MP4/M4A/AMR)."""
    print(f"[Transcribe-Gemini] Request: lang={req.language_code}, audio_len={len(req.audio_base64)}", flush=True)
    try:
        raw_bytes = base64.b64decode(req.audio_base64)

        # Auto-detect audio format by checking magic bytes
        mime_type = "audio/wav"
        audio_b64 = None

        if raw_bytes[:4] in (b'\x00\x00\x00\x18', b'\x00\x00\x00\x1c', b'\x00\x00\x00\x20', b'\x00\x00\x00\x24', b'\x00\x00\x00\x28'):
            # MP4/M4A container (ftyp box)
            mime_type = "audio/mp4"
            audio_b64 = req.audio_base64
            print(f"[Transcribe-Gemini] Detected MP4/M4A format ({len(raw_bytes)}B)", flush=True)
        elif raw_bytes[:3] == b'ID3' or raw_bytes[:2] == b'\xff\xfb' or raw_bytes[:2] == b'\xff\xf3':
            # MP3
            mime_type = "audio/mp3"
            audio_b64 = req.audio_base64
            print(f"[Transcribe-Gemini] Detected MP3 format ({len(raw_bytes)}B)", flush=True)
        elif raw_bytes[:4] == b'RIFF':
            # Already WAV
            mime_type = "audio/wav"
            audio_b64 = req.audio_base64
            print(f"[Transcribe-Gemini] Detected WAV format ({len(raw_bytes)}B)", flush=True)
        elif raw_bytes[:1] == b'#' and b'AMR' in raw_bytes[:10]:
            # AMR
            mime_type = "audio/amr"
            audio_b64 = req.audio_base64
            print(f"[Transcribe-Gemini] Detected AMR format ({len(raw_bytes)}B)", flush=True)
        elif raw_bytes[:4] == b'OggS':
            # OGG/Opus
            mime_type = "audio/ogg"
            audio_b64 = req.audio_base64
            print(f"[Transcribe-Gemini] Detected OGG format ({len(raw_bytes)}B)", flush=True)
        elif len(raw_bytes) > 8 and raw_bytes[4:8] == b'ftyp':
            # MP4/M4A with different box size
            mime_type = "audio/mp4"
            audio_b64 = req.audio_base64
            print(f"[Transcribe-Gemini] Detected MP4/M4A format via ftyp ({len(raw_bytes)}B)", flush=True)
        else:
            # Assume raw PCM, wrap in WAV
            wav_bytes = _pcm_to_wav(raw_bytes, req.sample_rate_hertz)
            audio_b64 = base64.b64encode(wav_bytes).decode("utf-8")
            print(f"[Transcribe-Gemini] Assuming PCM, wrapped as WAV: {len(raw_bytes)}B -> {len(wav_bytes)}B", flush=True)

        lang_names = {"hi-IN": "Hindi", "en-IN": "English", "mr-IN": "Marathi", "gu-IN": "Gujarati", "auto": "Hindi or English"}
        lang_name = lang_names.get(req.language_code, req.language_code)

        payload = {
            "contents": [{
                "parts": [
                    {"inline_data": {"mime_type": mime_type, "data": audio_b64}},
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
        _log_activity("api.transcribe_gemini", store_phone=user.get("phone"), entity_type="recording",
                      metadata={"lang": req.language_code, "audio_len": len(req.audio_base64), "mime": mime_type, "has_result": bool(text)}, request=request)
        return {"transcript": text or None, "text": text or ""}

    except HTTPException:
        raise
    except Exception as e:
        print(f"[Transcribe-Gemini] ✗ Exception: {e}", flush=True)
        traceback.print_exc()
        _log_activity("api.transcribe_gemini.error", store_phone=user.get("phone"), entity_type="recording",
                      metadata={"error": str(e)[:200]}, request=request)
        raise HTTPException(status_code=500, detail=f"Gemini transcription failed: {e}")


# ---------- Transcribe Raw Audio ----------

@app.post("/api/transcribe-raw-audio")
async def transcribe_raw(req: TranscribeRawRequest, request: Request = None, user: dict = Depends(get_current_user)):
    if len(req.audio_base64) > AUDIO_BASE64_MAX_LENGTH:
        raise HTTPException(status_code=413, detail="Audio payload too large")
    
    print(f"[Transcribe-Raw] Request: lang={req.language_code}, mime={req.mime_type}, audio_len={len(req.audio_base64)}", flush=True)
    try:
        lang_names = {"hi-IN": "Hindi", "en-IN": "English", "mr-IN": "Marathi", "gu-IN": "Gujarati", "auto": "Hindi or English"}
        lang_name = lang_names.get(req.language_code, req.language_code)

        payload = {
            "contents": [{
                "parts": [
                    {"inline_data": {"mime_type": req.mime_type, "data": req.audio_base64}},
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
        print(f"[Transcribe-Raw] ✓ Result: {(text or 'None')[:200]}", flush=True)
        _log_activity("api.transcribe_raw", store_phone=user.get("phone"), entity_type="recording",
                      metadata={"lang": req.language_code, "audio_len": len(req.audio_base64), "has_result": bool(text)}, request=request)
        return {"transcript": text or None}

    except HTTPException:
        raise
    except Exception as e:
        print(f"[Transcribe-Raw] ✗ Exception: {e}", flush=True)
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Gemini transcription failed: {e}")


# ---------- Transcribe Multipart (File Upload) ----------

@app.post("/api/transcribe-gemini-multipart")
async def transcribe_gemini_multipart(
    audio_file: UploadFile = File(...),
    language_code: str = Form("hi-IN"),
    request: Request = None,
    user: dict = Depends(get_current_user),
):
    """Accept multipart file upload and transcribe via Gemini.
    This avoids base64 encoding overhead on the client."""
    file_bytes = await audio_file.read()
    if len(file_bytes) > 15_000_000:  # 15MB raw limit
        raise HTTPException(status_code=413, detail="Audio file too large (max 15MB)")

    content_type = audio_file.content_type or "audio/mp4"
    filename = audio_file.filename or "audio.m4a"
    print(f"[Transcribe-Multipart] file={filename}, size={len(file_bytes)}B, type={content_type}, lang={language_code}", flush=True)

    # Determine mime type for Gemini
    mime_map = {
        "audio/mp4": "audio/mp4",
        "audio/m4a": "audio/mp4",
        "audio/x-m4a": "audio/mp4",
        "audio/aac": "audio/aac",
        "audio/mpeg": "audio/mp3",
        "audio/mp3": "audio/mp3",
        "audio/amr": "audio/amr",
        "audio/wav": "audio/wav",
        "audio/x-wav": "audio/wav",
        "audio/ogg": "audio/ogg",
        "audio/webm": "audio/webm",
    }
    mime_type = mime_map.get(content_type, "audio/mp4")

    # Extension-based fallback
    if mime_type == "audio/mp4":
        ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
        ext_map = {"mp3": "audio/mp3", "amr": "audio/amr", "wav": "audio/wav", "ogg": "audio/ogg", "webm": "audio/webm", "aac": "audio/aac"}
        if ext in ext_map:
            mime_type = ext_map[ext]

    audio_b64 = base64.b64encode(file_bytes).decode("utf-8")

    lang_names = {"hi-IN": "Hindi", "en-IN": "English", "mr-IN": "Marathi", "gu-IN": "Gujarati", "auto": "Hindi or English"}
    lang_name = lang_names.get(language_code, language_code)

    try:
        payload = {
            "contents": [{
                "parts": [
                    {"inline_data": {"mime_type": mime_type, "data": audio_b64}},
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
        print(f"[Transcribe-Multipart] ✓ Result: {(text or 'None')[:200]}", flush=True)
        _log_activity("api.transcribe_multipart", store_phone=user.get("phone"), entity_type="recording",
                      metadata={"lang": language_code, "file_size": len(file_bytes), "mime": mime_type, "has_result": bool(text)}, request=request)
        return {"transcript": text or None, "text": text or ""}

    except HTTPException:
        raise
    except Exception as e:
        print(f"[Transcribe-Multipart] ✗ Exception: {e}", flush=True)
        traceback.print_exc()
        _log_activity("api.transcribe_multipart.error", store_phone=user.get("phone"), entity_type="recording",
                      metadata={"error": str(e)[:200]}, request=request)
        raise HTTPException(status_code=500, detail=f"Multipart transcription failed: {e}")


# ---------- Classify ----------

@app.post("/api/classify")
async def classify(req: ClassifyRequest, request: Request = None, user: dict = Depends(get_current_user)):
    print(f"[Classify] Request: transcript_len={len(req.transcript)}", flush=True)
    try:
        system_prompt = (
            "You are a call classifier for small Indian retail shopkeepers (kirana stores, general stores, etc.). "
            "Classify this call transcript as ORDER_CALL or PERSONAL_CALL, and provide a confidence score.\n\n"
            "CRITICAL RULES FOR INDIAN SHOPKEEPERS:\n"
            "- Customers call casually! They chat about family, health, and then informally ask for items.\n"
            "- If ANYWHERE in the call someone mentions needing, wanting, ordering, or requesting ANY product "
            "(even just '1 Maggi', 'half kg sugar', or 'doodh rakh dena'), it is an ORDER_CALL.\n"
            "- Product mentions (item names, quantities, brand names) ALWAYS mean ORDER_CALL regardless of the rest of the conversation.\n"
            "- Only classify as PERSONAL_CALL if the ENTIRE call is purely personal with absolutely ZERO mention of products or item requests.\n"
            "- When in doubt, ALWAYS classify as ORDER_CALL.\n\n"
            "Respond ONLY with valid JSON in this exact format:\n"
            '{\"classification\": \"ORDER_CALL\", \"confidence\": 0.85}\n\n'
            "Where confidence is a float from 0.0 to 1.0 indicating how confident you are in your classification."
        )
        payload = {
            "contents": [
                {"parts": [{"text": f"{system_prompt}\n\nTranscript:\n{req.transcript}"}]}
            ]
        }

        data = await _call_gemini(CLASSIFY_MODEL, payload)
        text = _extract_gemini_text(data)
        print(f"[Classify] ✓ Raw result: {text}", flush=True)

        if text is None:
            return {"classification": None, "confidence": 0.0}

        # Try to parse JSON response with confidence
        import json as _json
        try:
            # Strip markdown code fences if present
            clean = text.strip()
            if clean.startswith("```"):
                clean = clean.split("\n", 1)[-1]  # remove first line
                if clean.endswith("```"):
                    clean = clean[:-3]
                clean = clean.strip()
            parsed = _json.loads(clean)
            classification = parsed.get("classification", "").upper().strip()
            confidence = float(parsed.get("confidence", 0.5))
            confidence = max(0.0, min(1.0, confidence))  # clamp to [0, 1]

            if "ORDER" in classification:
                classification = "ORDER_CALL"
            elif "PERSONAL" in classification:
                classification = "PERSONAL_CALL"
            else:
                classification = "ORDER_CALL"  # default to order when in doubt

            print(f"[Classify] ✓ Parsed: classification={classification}, confidence={confidence}", flush=True)
            _log_activity("api.classify", store_phone=user.get("phone"), entity_type="recording",
                          metadata={"classification": classification, "confidence": confidence, "transcript_len": len(req.transcript)}, request=request)
            return {"classification": classification, "confidence": confidence}
        except (_json.JSONDecodeError, ValueError, TypeError) as parse_err:
            print(f"[Classify] ⚠ JSON parse failed ({parse_err}), falling back to text matching: {text}", flush=True)
            # Fallback: extract from raw text
            if "ORDER_CALL" in text.upper():
                return {"classification": "ORDER_CALL", "confidence": 0.5}
            elif "PERSONAL_CALL" in text.upper():
                return {"classification": "PERSONAL_CALL", "confidence": 0.5}
            return {"classification": "ORDER_CALL", "confidence": 0.3}  # default to order

    except HTTPException:
        raise
    except Exception as e:
        print(f"[Classify] ✗ Exception: {e}", flush=True)
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Classification failed: {e}")


# ---------- Extract Order ----------

def _validate_extracted_order(order_json: str) -> str | None:
    """Validate that extracted order JSON has real products.
    Returns the JSON if valid, None if bogus (no real products)."""
    import json
    try:
        data = json.loads(order_json)
        products = data.get("products", [])
        if not products:
            print("[ExtractOrder] ⚠ Rejected: 0 products", flush=True)
            return None

        # Filter out fake/placeholder products
        invalid_names = {"n/a", "na", "none", "unknown", "null", "", "-",
                         "no product", "no item", "no items", "not mentioned",
                         "not specified", "not available"}
        valid_products = [
            p for p in products
            if p.get("name", "").strip().lower() not in invalid_names
               and p.get("name", "").strip() != ""
        ]

        if not valid_products:
            print(f"[ExtractOrder] ⚠ Rejected: {len(products)} products but all invalid names", flush=True)
            return None

        # Replace products with only valid ones
        data["products"] = valid_products
        return json.dumps(data)
    except (json.JSONDecodeError, Exception) as e:
        print(f"[ExtractOrder] ⚠ Validation parse error: {e}", flush=True)
        return order_json  # Return as-is if we can't parse (let app handle it)


@app.post("/api/extract-order")
async def extract_order(req: ExtractOrderRequest, request: Request = None, user: dict = Depends(get_current_user)):
    print(f"[ExtractOrder] Request: transcript_len={len(req.transcript)}", flush=True)
    try:
        system_prompt = f"""You are an order extraction assistant for an Indian retail shop. Extract all order information from this call transcript and return ONLY a valid JSON object in this exact schema:
{{
  "customer_name": "string or null",
  "customer_phone": "string or null",
  "store_name": "string",
  "store_number": "string or null",
  "order_id": "string (generate unique ID)",
  "products": [
    {{
      "name": "string (actual product name)",
      "quantity": "string (include unit, e.g. '2 kg')",
      "price": number
    }}
  ],
  "total_amount": number,
  "notes": "string or null",
  "address": "string or null (delivery address if mentioned)"
}}

CRITICAL RULES:
1. ONLY return products actually ordered.
2. If NO products are mentioned, return empty [].
3. ALL output text must be in English script (transliterate if needed).
4. IMPORTANT: Extract the full delivery address if mentioned by the customer and map it to the 'address' field.
5. Use "{req.store_name}" as the store_name if not mentioned."""

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
        cleaned = cleaned.strip()

        # Server-side validation: reject bogus orders with no real products
        validated = _validate_extracted_order(cleaned)
        if validated is None:
            print("[ExtractOrder] ⚠ Order rejected by validation (no valid products)", flush=True)
            return {"order_json": None}

        print(f"[ExtractOrder] ✓ Extracted order ({len(validated)} chars)", flush=True)
        _log_activity("api.extract_order", store_phone=user.get("phone"), entity_type="order",
                      metadata={"transcript_len": len(req.transcript), "order_json_len": len(validated), "store_name": req.store_name}, request=request)
        return {"order_json": validated}

    except HTTPException:
        raise
    except Exception as e:
        print(f"[ExtractOrder] ✗ Exception: {e}", flush=True)
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Order extraction failed: {e}")


# ---------- Sync Recording to Supabase ----------

@app.post("/api/sync-recording")
async def sync_recording(req: SyncRecordingRequest, request: Request = None, user: dict = Depends(get_current_user)):
    print(f"[SyncRecording] Request: filename={req.filename}", flush=True)
    sb = _require_supabase()
    try:
        store_phone = user["phone"]
        row = {
            "device_id": req.device_id,
            "filename": req.filename,
            "path": req.path,
            "duration_ms": req.duration_ms,
            "date_recorded": parse_epoch_ms(req.date_recorded) or 0,
            "transcript": req.transcript,
            "classification": req.classification,
            "is_processed": req.is_processed,
            "source_phone": req.source_phone,
            "contact_name": req.contact_name,
            "call_direction": req.call_direction,
            "call_type": req.call_type,
            "sim_slot": req.sim_slot,
            "network_type": req.network_type,
            "language_detected": req.language_detected,
            "sentiment": req.sentiment,
            "audio_quality_score": req.audio_quality_score,
            "word_count": req.word_count,
            "speaker_count": req.speaker_count,
            "processing_time_ms": req.processing_time_ms,
            "ai_model_used": req.ai_model_used,
            "transcript_confidence": req.transcript_confidence,
        }
        if store_phone:
            row["store_phone"] = store_phone
            row["user_phone"] = store_phone  # backward compat
        if req.created_at is not None:
            row["created_at"] = parse_epoch_ms(req.created_at)
        result = sb.table("recordings").upsert(
            row, on_conflict="device_id,path"
        ).execute()
        rec_id = result.data[0]["id"] if result.data else None
        _log_activity("recording.synced", store_phone=user.get("phone"), entity_type="recording",
                      entity_id=str(rec_id), metadata={"filename": req.filename, "classification": req.classification,
                      "source_phone": req.source_phone, "contact_name": req.contact_name}, request=request)
        print(f"[SyncRecording] ✓ Upserted recording id={rec_id}", flush=True)
        return {"status": "ok", "id": rec_id}
    except Exception as e:
        print(f"[SyncRecording] ✗ Exception: {e}", flush=True)
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Sync recording failed: {e}")


# ---------- Sync Order to Supabase ----------

@app.post("/api/sync-order")
@app.post("/api/sync/order")
async def sync_order(req: SyncOrderRequest, request: Request = None, user: dict = Depends(get_current_user)):
    print(f"[SyncOrder] Request: order_id={req.order_id}", flush=True)
    sb = _require_supabase()
    try:
        store_phone = user["phone"]
        row = {
            "order_id": req.order_id,
            "customer_name": req.customer_name,
            "customer_phone": req.customer_phone,
            "customer_address": req.customer_address,
            "store_name": req.store_name,
            "store_number": req.store_number,
            "products": req.products,
            "total_amount": req.total_amount,
            "item_count": len(req.products),
            "notes": req.notes,
            "address": req.address,
            "whatsapp_sent": req.whatsapp_sent,
            "is_read": req.is_read,
            "is_cancelled": req.is_cancelled,
            "cancelled_at": parse_epoch_ms(req.cancelled_at),
            "cancel_reason": req.cancel_reason,
            "order_source": req.order_source,
            "call_direction": req.call_direction,
            "payment_status": req.payment_status,
            "payment_method": req.payment_method,
            "delivery_status": req.delivery_status,
            "delivered_at": parse_epoch_ms(req.delivered_at),
            "confidence_score": req.confidence_score,
            "processing_time_ms": req.processing_time_ms,
            "device_model": req.device_model,
            "device_os_version": req.device_os_version,
            "app_version": req.app_version,
            "session_id": req.session_id,
            "latitude": req.latitude,
            "longitude": req.longitude,
        }
        if store_phone:
            row["store_phone"] = store_phone
            row["user_phone"] = store_phone  # backward compat

        # Resolve recording_id: look up Supabase recording by filename
        # (the client sends local Room DB recording_id which doesn't match Supabase IDs)
        if req.recording_filename:
            try:
                rec_result = sb.table("recordings").select("id").eq("filename", req.recording_filename)
                if store_phone:
                    rec_result = rec_result.eq("store_phone", store_phone)
                rec_result = rec_result.limit(1).execute()
                if rec_result.data:
                    row["recording_id"] = rec_result.data[0]["id"]
                    print(f"[SyncOrder] Resolved recording: {req.recording_filename} -> id={row['recording_id']}", flush=True)
            except Exception as e:
                print(f"[SyncOrder] Could not resolve recording: {e}", flush=True)
        # Don't include recording_id if we couldn't resolve it (avoid FK violation)

        if req.created_at is not None:
            row["created_at"] = parse_epoch_ms(req.created_at)
        sb.table("orders").upsert(row, on_conflict="order_id").execute()

        # Normalize products into order_items table
        if store_phone and req.products:
            try:
                # Delete existing items for this order (in case of re-sync)
                sb.table("order_items").delete().eq("order_id", req.order_id).execute()

                items = []
                for p in req.products:
                    qty_str = str(p.get("quantity", "1"))
                    price = float(p.get("price", 0))
                    # Parse quantity into numeric + unit (e.g. "2.5 kg" -> 2.5, "kg")
                    qty_numeric = None
                    qty_unit = None
                    try:
                        parts = qty_str.strip().split()
                        if parts:
                            qty_numeric = float(parts[0])
                            qty_unit = parts[1] if len(parts) > 1 else "pieces"
                    except (ValueError, IndexError):
                        pass

                    items.append({
                        "order_id": req.order_id,
                        "store_phone": store_phone,
                        "product_name": p.get("name", "Unknown"),
                        "quantity": qty_str,
                        "quantity_numeric": qty_numeric,
                        "quantity_unit": qty_unit,
                        "unit_price": price,
                        "total_price": price,  # price is already total for that line item
                    })

                if items:
                    sb.table("order_items").insert(items).execute()
                    print(f"[SyncOrder] ✓ Inserted {len(items)} order_items", flush=True)
            except Exception as e:
                print(f"[SyncOrder] ⚠ order_items insert failed (non-critical): {e}", flush=True)

        # Update store aggregate stats (non-critical)
        if store_phone and not req.is_cancelled:
            try:
                sb.table("stores").update({
                    "total_orders": sb.table("orders").select("id", count="exact").eq("store_phone", store_phone).eq("is_cancelled", False).execute().count or 0,
                    "last_active_at": int(time.time() * 1000),
                }).eq("phone", store_phone).execute()
            except Exception:
                pass  # Non-critical

        _log_activity("order.synced", store_phone=user.get("phone"), entity_type="order",
                      entity_id=req.order_id, metadata={"customer_name": req.customer_name,
                      "customer_phone": req.customer_phone, "total_amount": req.total_amount,
                      "product_count": len(req.products)}, request=request)
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
    user: dict = Depends(get_current_user),
):
    sb = _require_supabase()
    try:
        phone = user["phone"]
        query = sb.table("orders").select("*").order("created_at", desc=True)
        # Query both store_phone (v2) and user_phone (v1 backward compat)
        query = query.or_(f"store_phone.eq.{phone},user_phone.eq.{phone}")
        if store_name:
            query = query.eq("store_name", store_name)
        result = query.range(offset, offset + limit - 1).execute()
        return {"orders": result.data}
    except Exception as e:
        print(f"[ListOrders] ✗ Exception: {e}", flush=True)
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to list orders: {e}")


@app.get("/api/orders/{order_id}")
async def get_order(order_id: str, user: dict = Depends(get_current_user)):
    sb = _require_supabase()
    try:
        phone = user["phone"]
        result = sb.table("orders").select("*").eq("order_id", order_id).or_(f"store_phone.eq.{phone},user_phone.eq.{phone}").execute()
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
async def update_order(order_id: str, req: UpdateOrderRequest, user: dict = Depends(get_current_user)):
    sb = _require_supabase()
    try:
        updates = {k: v for k, v in req.model_dump().items() if v is not None}
        if "cancelled_at" in updates: updates["cancelled_at"] = parse_epoch_ms(updates["cancelled_at"])
        if "delivered_at" in updates: updates["delivered_at"] = parse_epoch_ms(updates["delivered_at"])
        if not updates:
            raise HTTPException(status_code=400, detail="No fields to update")
        phone = user["phone"]
        result = sb.table("orders").update(updates).eq("order_id", order_id).or_(f"store_phone.eq.{phone},user_phone.eq.{phone}").execute()
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
async def delete_order(order_id: str, request: Request = None, user: dict = Depends(get_current_user)):
    sb = _require_supabase()
    try:
        phone = user["phone"]
        sb.table("orders").delete().eq("order_id", order_id).or_(f"store_phone.eq.{phone},user_phone.eq.{phone}").execute()
        _log_activity("order.deleted", store_phone=user.get("phone"), entity_type="order", entity_id=order_id, request=request)
        print(f"[DeleteOrder] ✓ Deleted order {order_id}", flush=True)
        return {"status": "ok", "order_id": order_id}
    except Exception as e:
        print(f"[DeleteOrder] ✗ Exception: {e}", flush=True)
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to delete order: {e}")


# ---------- Get Recordings ----------

@app.get("/api/recordings")
async def list_recordings(device_id: str = "", limit: int = 100, offset: int = 0, user: dict = Depends(get_current_user)):
    sb = _require_supabase()
    try:
        query = sb.table("recordings").select("*").order("date_recorded", desc=True)
        query = query.eq("store_phone", user["phone"])
        if device_id:
            query = query.eq("device_id", device_id)
        result = query.range(offset, offset + limit - 1).execute()
        return {"recordings": result.data}
    except Exception as e:
        print(f"[ListRecordings] ✗ Exception: {e}", flush=True)
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to list recordings: {e}")


@app.get("/api/recordings/{recording_id}")
async def get_recording(recording_id: int, user: dict = Depends(get_current_user)):
    sb = _require_supabase()
    try:
        result = sb.table("recordings").select("*").eq("id", recording_id).eq("store_phone", user["phone"]).execute()
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
async def delete_recording(recording_id: int, request: Request = None, user: dict = Depends(get_current_user)):
    sb = _require_supabase()
    try:
        sb.table("recordings").delete().eq("id", recording_id).eq("store_phone", user["phone"]).execute()
        _log_activity("recording.deleted", store_phone=user.get("phone"), entity_type="recording", entity_id=str(recording_id), request=request)
        print(f"[DeleteRecording] ✓ Deleted recording {recording_id}", flush=True)
        return {"status": "ok", "id": recording_id}
    except Exception as e:
        print(f"[DeleteRecording] ✗ Exception: {e}", flush=True)
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to delete recording: {e}")


# ============================================================
# ADMIN ENDPOINTS — Cross-store data access for analytics
# ============================================================

ADMIN_API_KEY = os.getenv("ADMIN_API_KEY", "")


def _require_admin(request: Request):
    """Check admin API key from X-Admin-Key header."""
    key = request.headers.get("X-Admin-Key", "")
    if not ADMIN_API_KEY:
        # Deny access when no admin key is configured (prevents open access at scale)
        raise HTTPException(status_code=403, detail="Admin access not configured")
    if key != ADMIN_API_KEY:
        raise HTTPException(status_code=403, detail="Invalid admin API key")
    return True


@app.get("/api/admin/stores")
async def admin_list_stores(
    request: Request,
    city: str = "",
    category: str = "",
    active_only: bool = True,
    limit: int = 100,
    offset: int = 0,
):
    """List all stores with their aggregate stats."""
    _require_admin(request)
    sb = _require_supabase()
    try:
        query = sb.table("stores").select("*").order("created_at", desc=True)
        if city:
            query = query.eq("store_city", city)
        if category:
            query = query.eq("store_category", category)
        if active_only:
            query = query.eq("is_active", True)
        result = query.range(offset, offset + limit - 1).execute()
        return {"stores": result.data, "count": len(result.data)}
    except Exception as e:
        print(f"[Admin] ✗ list_stores failed: {e}", flush=True)
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/admin/stores/{phone}")
async def admin_get_store(phone: str, request: Request):
    """Get a single store's full details."""
    _require_admin(request)
    sb = _require_supabase()
    try:
        store_result = sb.table("stores").select("*").eq("phone", phone).execute()
        if not store_result.data:
            raise HTTPException(status_code=404, detail="Store not found")

        order_count = sb.table("orders").select("id", count="exact").eq("store_phone", phone).execute()
        recording_count = sb.table("recordings").select("id", count="exact").eq("store_phone", phone).execute()

        store = store_result.data[0]
        store["_order_count"] = order_count.count or 0
        store["_recording_count"] = recording_count.count or 0

        return {"store": store}
    except HTTPException:
        raise
    except Exception as e:
        print(f"[Admin] ✗ get_store failed: {e}", flush=True)
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/admin/stores/{phone}/orders")
async def admin_store_orders(
    phone: str,
    request: Request,
    limit: int = 100,
    offset: int = 0,
    include_items: bool = False,
):
    """List all orders for a specific store."""
    _require_admin(request)
    sb = _require_supabase()
    try:
        result = sb.table("orders").select("*").eq("store_phone", phone)\
            .order("created_at", desc=True)\
            .range(offset, offset + limit - 1).execute()

        orders = result.data
        if include_items and orders:
            order_ids = [o["order_id"] for o in orders]
            items_result = sb.table("order_items").select("*")\
                .in_("order_id", order_ids).execute()
            items_by_order = {}
            for item in (items_result.data or []):
                items_by_order.setdefault(item["order_id"], []).append(item)
            for order in orders:
                order["_items"] = items_by_order.get(order["order_id"], [])

        return {"orders": orders, "count": len(orders)}
    except Exception as e:
        print(f"[Admin] ✗ store_orders failed: {e}", flush=True)
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/admin/analytics/top-products")
async def admin_top_products(
    request: Request,
    limit: int = 50,
    store_phone: str = "",
):
    """Get top products across all stores (or a specific store)."""
    _require_admin(request)
    sb = _require_supabase()
    try:
        # We query order_items and aggregate in Python since Supabase REST
        # doesn't support GROUP BY. For large datasets, use the SQL view instead.
        query = sb.table("order_items").select("product_name,quantity_numeric,quantity_unit,unit_price,total_price,store_phone")
        if store_phone:
            query = query.eq("store_phone", store_phone)
        result = query.limit(1000).execute()

        # Aggregate
        product_stats: dict[str, dict] = {}
        for item in (result.data or []):
            name = item.get("product_name", "Unknown")
            if name not in product_stats:
                product_stats[name] = {
                    "product_name": name,
                    "times_ordered": 0,
                    "total_revenue": 0.0,
                    "stores": set(),
                }
            product_stats[name]["times_ordered"] += 1
            product_stats[name]["total_revenue"] += item.get("total_price", 0) or 0
            product_stats[name]["stores"].add(item.get("store_phone", ""))

        # Sort and serialize
        top = sorted(product_stats.values(), key=lambda x: x["times_ordered"], reverse=True)[:limit]
        for p in top:
            p["store_count"] = len(p.pop("stores"))

        return {"top_products": top}
    except Exception as e:
        print(f"[Admin] ✗ top_products failed: {e}", flush=True)
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/admin/export")
async def admin_export(
    request: Request,
    table: str = "orders",
    store_phone: str = "",
    limit: int = 10000,
    offset: int = 0,
):
    """Export data as JSON for data brokering. Tables: stores, orders, order_items, recordings."""
    _require_admin(request)
    sb = _require_supabase()
    allowed_tables = {"stores", "orders", "order_items", "recordings", "activity_log"}
    if table not in allowed_tables:
        raise HTTPException(status_code=400, detail=f"Table must be one of: {allowed_tables}")
    try:
        query = sb.table(table).select("*")
        if store_phone and table != "stores":
            query = query.eq("store_phone", store_phone)
        elif store_phone and table == "stores":
            query = query.eq("phone", store_phone)
        result = query.range(offset, offset + limit - 1).execute()
        return {
            "table": table,
            "count": len(result.data),
            "offset": offset,
            "data": result.data,
        }
    except Exception as e:
        print(f"[Admin] ✗ export failed: {e}", flush=True)
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


# ---------- Gemini Live Token (OAuth) ----------

@app.get("/api/gemini-live-token")
async def gemini_live_token(user: dict = Depends(get_current_user)):
    """Exchange refresh token for a short-lived access token for Gemini Live WebSocket."""
    token = await _get_access_token()
    return {"access_token": token, "expires_in": 3600}


# ---------- Helpers ----------

def parse_epoch_ms(val: Any) -> Optional[int]:
    """Parse various timestamp formats into epoch milliseconds."""
    if val is None: return None
    if isinstance(val, int): return val
    if isinstance(val, float): return int(val)
    if isinstance(val, str):
        try:
            return int(val)
        except ValueError:
            pass
        try:
            val_clean = val.replace("Z", "+00:00")
            dt = datetime.fromisoformat(val_clean)
            return int(dt.timestamp() * 1000)
        except Exception:
            pass
    return None


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
