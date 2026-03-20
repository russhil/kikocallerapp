-- Supabase schema for KikoCall / OrderLens
-- Run this in the Supabase SQL Editor to create the tables

-- ============================================================
-- Users table (phone-based auth)
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    phone TEXT NOT NULL UNIQUE,
    shop_name TEXT NOT NULL DEFAULT '',
    shopkeeper_name TEXT NOT NULL DEFAULT '',
    otp_code TEXT,
    otp_expires_at BIGINT DEFAULT 0,
    auth_token TEXT,
    created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

-- ============================================================
-- Recordings table
-- ============================================================
CREATE TABLE IF NOT EXISTS recordings (
    id BIGSERIAL PRIMARY KEY,
    device_id TEXT NOT NULL DEFAULT '',
    filename TEXT NOT NULL,
    path TEXT NOT NULL,
    duration_ms BIGINT NOT NULL DEFAULT 0,
    date_recorded BIGINT NOT NULL DEFAULT 0,
    transcript TEXT,
    classification TEXT,
    is_processed BOOLEAN NOT NULL DEFAULT FALSE,
    source_phone TEXT,
    contact_name TEXT,
    call_direction TEXT DEFAULT 'INCOMING',
    user_phone TEXT,
    created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

-- Unique constraint: same device + path = same recording
CREATE UNIQUE INDEX IF NOT EXISTS idx_recordings_device_path ON recordings(device_id, path);

-- ============================================================
-- Orders table
-- ============================================================
CREATE TABLE IF NOT EXISTS orders (
    id BIGSERIAL PRIMARY KEY,
    order_id TEXT NOT NULL UNIQUE,
    recording_id BIGINT REFERENCES recordings(id) ON DELETE SET NULL,
    customer_name TEXT,
    customer_phone TEXT,
    store_name TEXT NOT NULL DEFAULT '',
    store_number TEXT,
    products JSONB NOT NULL DEFAULT '[]'::JSONB,
    total_amount DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    notes TEXT,
    address TEXT,
    whatsapp_sent BOOLEAN NOT NULL DEFAULT FALSE,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    user_phone TEXT,
    call_direction TEXT DEFAULT 'INCOMING',
    created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

-- ============================================================
-- Serialized order counter per user
-- ============================================================
CREATE TABLE IF NOT EXISTS order_counters (
    user_phone TEXT PRIMARY KEY,
    last_order_num BIGINT NOT NULL DEFAULT 0
);

-- ============================================================
-- Migration for existing tables (run if tables already exist)
-- ============================================================
-- ALTER TABLE orders ADD COLUMN IF NOT EXISTS user_phone TEXT;
-- ALTER TABLE orders ADD COLUMN IF NOT EXISTS call_direction TEXT DEFAULT 'INCOMING';
-- ALTER TABLE recordings ADD COLUMN IF NOT EXISTS call_direction TEXT DEFAULT 'INCOMING';
-- ALTER TABLE recordings ADD COLUMN IF NOT EXISTS user_phone TEXT;
