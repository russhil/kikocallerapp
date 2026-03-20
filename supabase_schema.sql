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
    created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
    updated_at BIGINT
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
    created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
    updated_at BIGINT
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
    created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
    updated_at BIGINT
);

-- ============================================================
-- Serialized order counter per user (atomic increment via RPC)
-- ============================================================
CREATE TABLE IF NOT EXISTS order_counters (
    user_phone TEXT PRIMARY KEY,
    last_order_num BIGINT NOT NULL DEFAULT 0
);

-- ============================================================
-- Activity log for production auditing
-- ============================================================
CREATE TABLE IF NOT EXISTS activity_log (
    id BIGSERIAL PRIMARY KEY,
    user_phone TEXT,
    action TEXT NOT NULL,
    entity_type TEXT,
    entity_id TEXT,
    metadata JSONB DEFAULT '{}'::JSONB,
    created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

-- ============================================================
-- Row Level Security (RLS) — multi-user isolation
-- ============================================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE recordings ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_counters ENABLE ROW LEVEL SECURITY;

-- Service-role key (used by backend) bypasses RLS automatically.
-- These policies allow the service role full access:
CREATE POLICY IF NOT EXISTS "service_full_access_users" ON users FOR ALL USING (true);
CREATE POLICY IF NOT EXISTS "service_full_access_recordings" ON recordings FOR ALL USING (true);
CREATE POLICY IF NOT EXISTS "service_full_access_orders" ON orders FOR ALL USING (true);
CREATE POLICY IF NOT EXISTS "service_full_access_counters" ON order_counters FOR ALL USING (true);

-- ============================================================
-- Performance indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_orders_user_phone ON orders(user_phone);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_recordings_user_phone ON recordings(user_phone);
CREATE INDEX IF NOT EXISTS idx_recordings_date ON recordings(date_recorded DESC);
CREATE INDEX IF NOT EXISTS idx_users_auth_token ON users(auth_token);
CREATE INDEX IF NOT EXISTS idx_activity_log_user ON activity_log(user_phone, created_at DESC);

-- ============================================================
-- Atomic order counter increment (prevents race conditions)
-- ============================================================
CREATE OR REPLACE FUNCTION increment_order_counter(p_user_phone TEXT)
RETURNS BIGINT AS $$
DECLARE
    next_num BIGINT;
BEGIN
    INSERT INTO order_counters (user_phone, last_order_num)
    VALUES (p_user_phone, 1)
    ON CONFLICT (user_phone)
    DO UPDATE SET last_order_num = order_counters.last_order_num + 1
    RETURNING last_order_num INTO next_num;
    RETURN next_num;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Migration for existing tables (run if tables already exist)
-- ============================================================
-- ALTER TABLE orders ADD COLUMN IF NOT EXISTS updated_at BIGINT;
-- ALTER TABLE recordings ADD COLUMN IF NOT EXISTS updated_at BIGINT;
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at BIGINT;
