-- ============================================================
-- KikoCall / OrderLens — Supabase Schema v2
-- Scalable multi-store design: phone-keyed stores, normalized
-- order items, comprehensive data capture for analytics.
-- ============================================================

-- ============================================================
-- 1. STORES — Phone number is the primary key
-- ============================================================
CREATE TABLE IF NOT EXISTS stores (
    phone TEXT PRIMARY KEY,                    -- Registered phone = unique store identity
    store_name TEXT NOT NULL DEFAULT '',
    owner_name TEXT NOT NULL DEFAULT '',
    store_category TEXT,                       -- "kirana", "medical", "clothing", etc.
    store_address TEXT,
    store_city TEXT,
    store_state TEXT,
    store_pincode TEXT,
    gst_number TEXT,
    avg_order_value DOUBLE PRECISION DEFAULT 0,
    total_orders BIGINT DEFAULT 0,
    total_revenue DOUBLE PRECISION DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    plan_type TEXT DEFAULT 'free',             -- free, pro, enterprise
    referral_code TEXT,
    referred_by TEXT,
    onboarding_completed BOOLEAN DEFAULT FALSE,
    last_active_at BIGINT,
    created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
    updated_at BIGINT
);

-- ============================================================
-- 2. USERS — phone-based auth, linked to store
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    phone TEXT NOT NULL UNIQUE REFERENCES stores(phone) ON DELETE CASCADE,
    shop_name TEXT NOT NULL DEFAULT '',
    shopkeeper_name TEXT NOT NULL DEFAULT '',
    otp_code TEXT,
    otp_expires_at BIGINT DEFAULT 0,
    auth_token TEXT,
    device_id TEXT,
    device_model TEXT,
    device_os TEXT,
    app_version TEXT,
    fcm_token TEXT,                            -- Push notification token
    last_login_at BIGINT,
    login_count BIGINT DEFAULT 0,
    created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
    updated_at BIGINT
);

-- ============================================================
-- 3. RECORDINGS — call recordings linked to a store
-- ============================================================
CREATE TABLE IF NOT EXISTS recordings (
    id BIGSERIAL PRIMARY KEY,
    store_phone TEXT NOT NULL REFERENCES stores(phone) ON DELETE CASCADE,
    device_id TEXT NOT NULL DEFAULT '',
    filename TEXT NOT NULL,
    path TEXT NOT NULL,
    duration_ms BIGINT NOT NULL DEFAULT 0,
    date_recorded BIGINT NOT NULL DEFAULT 0,
    transcript TEXT,
    classification TEXT,                       -- ORDER_CALL / PERSONAL_CALL
    is_processed BOOLEAN NOT NULL DEFAULT FALSE,
    source_phone TEXT,                         -- Caller's phone number
    contact_name TEXT,                         -- Contact name from phonebook
    call_direction TEXT DEFAULT 'INCOMING',    -- INCOMING / OUTGOING / MISSED
    call_type TEXT,                            -- VOICE / VIDEO
    sim_slot INTEGER,                          -- Which SIM was used (0 or 1)
    network_type TEXT,                         -- wifi / 4g / 5g / 3g
    language_detected TEXT,                    -- hi / en / mr / gu / ta etc.
    sentiment TEXT,                            -- positive / negative / neutral
    audio_quality_score REAL,                  -- 0.0 – 1.0
    word_count INTEGER,                        -- Transcript word count
    speaker_count INTEGER,                     -- Number of distinct speakers
    processing_step TEXT,                      -- Current processing step
    processing_time_ms BIGINT,                 -- Total AI processing time
    ai_model_used TEXT,                        -- Which Gemini model was used
    transcript_confidence REAL,                -- 0.0 – 1.0
    -- Backward compat (deprecated, use store_phone)
    user_phone TEXT,
    created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
    updated_at BIGINT
);

-- Unique constraint: same device + path = same recording
CREATE UNIQUE INDEX IF NOT EXISTS idx_recordings_device_path ON recordings(device_id, path);

-- ============================================================
-- 4. ORDERS — linked to a store by phone
-- ============================================================
CREATE TABLE IF NOT EXISTS orders (
    id BIGSERIAL PRIMARY KEY,
    order_id TEXT NOT NULL UNIQUE,             -- KIKO-{phone_last4}-NNNN
    store_phone TEXT NOT NULL REFERENCES stores(phone) ON DELETE CASCADE,
    recording_id BIGINT REFERENCES recordings(id) ON DELETE SET NULL,
    -- Customer info
    customer_name TEXT,
    customer_phone TEXT,
    customer_address TEXT,
    -- Store info (denormalized snapshot at order time)
    store_name TEXT NOT NULL DEFAULT '',
    store_number TEXT,
    -- Order data
    products JSONB NOT NULL DEFAULT '[]'::JSONB,
    total_amount DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    item_count INTEGER DEFAULT 0,
    notes TEXT,
    address TEXT,
    -- Status flags
    is_cancelled BOOLEAN NOT NULL DEFAULT FALSE,
    cancelled_at BIGINT,
    cancel_reason TEXT,
    whatsapp_sent BOOLEAN NOT NULL DEFAULT FALSE,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    -- Source & flow
    order_source TEXT DEFAULT 'call',          -- call / whatsapp / manual
    call_direction TEXT DEFAULT 'INCOMING',
    -- Payment & delivery
    payment_status TEXT DEFAULT 'pending',     -- pending / paid / partial / cod
    payment_method TEXT,                       -- cash / upi / card / cod
    delivery_status TEXT DEFAULT 'pending',    -- pending / dispatched / delivered / returned
    delivered_at BIGINT,
    -- AI metadata
    confidence_score REAL,                     -- AI extraction confidence 0.0 – 1.0
    processing_time_ms BIGINT,                 -- Time from call end to order creation
    -- Device & session context
    device_model TEXT,
    device_os_version TEXT,
    app_version TEXT,
    session_id TEXT,                            -- Groups actions in one app session
    -- Geolocation
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    -- Backward compat (deprecated, use store_phone)
    user_phone TEXT,
    created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
    updated_at BIGINT
);

-- ============================================================
-- 5. ORDER ITEMS — normalized line items (queryable analytics)
-- ============================================================
CREATE TABLE IF NOT EXISTS order_items (
    id BIGSERIAL PRIMARY KEY,
    order_id TEXT NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
    store_phone TEXT NOT NULL REFERENCES stores(phone) ON DELETE CASCADE,
    product_name TEXT NOT NULL,
    product_category TEXT,                     -- Auto-categorized: grains, dairy, spices
    quantity TEXT NOT NULL DEFAULT '1',
    quantity_numeric REAL,                     -- Parsed numeric value (2.5 from "2.5 kg")
    quantity_unit TEXT,                        -- Parsed unit: kg, liters, pieces, dozen
    unit_price DOUBLE PRECISION DEFAULT 0,
    total_price DOUBLE PRECISION DEFAULT 0,
    created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

-- ============================================================
-- 6. ORDER COUNTERS — serialized per-store order numbering
-- ============================================================
CREATE TABLE IF NOT EXISTS order_counters (
    user_phone TEXT PRIMARY KEY,                -- = store phone
    last_order_num BIGINT NOT NULL DEFAULT 0
);

-- ============================================================
-- 7. STORE ANALYTICS (daily aggregation)
-- ============================================================
CREATE TABLE IF NOT EXISTS store_analytics_daily (
    id BIGSERIAL PRIMARY KEY,
    store_phone TEXT NOT NULL REFERENCES stores(phone) ON DELETE CASCADE,
    date_key DATE NOT NULL,
    total_orders INTEGER DEFAULT 0,
    total_revenue DOUBLE PRECISION DEFAULT 0,
    avg_order_value DOUBLE PRECISION DEFAULT 0,
    total_calls INTEGER DEFAULT 0,
    order_calls INTEGER DEFAULT 0,
    personal_calls INTEGER DEFAULT 0,
    unique_customers INTEGER DEFAULT 0,
    top_product TEXT,
    cancellation_count INTEGER DEFAULT 0,
    UNIQUE(store_phone, date_key)
);

-- ============================================================
-- 8. ACTIVITY LOG — full audit trail
-- ============================================================
CREATE TABLE IF NOT EXISTS activity_log (
    id BIGSERIAL PRIMARY KEY,
    store_phone TEXT REFERENCES stores(phone) ON DELETE SET NULL,
    user_phone TEXT,
    action TEXT NOT NULL,                       -- order.created, order.cancelled, recording.processed, etc.
    entity_type TEXT,                           -- order, recording, store, user
    entity_id TEXT,
    metadata JSONB DEFAULT '{}'::JSONB,
    ip_address TEXT,
    user_agent TEXT,
    created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE recordings ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_analytics_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

-- Service-role key (used by backend) bypasses RLS automatically.
DROP POLICY IF EXISTS "service_full_access_stores" ON stores;
CREATE POLICY "service_full_access_stores" ON stores FOR ALL USING (true);

DROP POLICY IF EXISTS "service_full_access_users" ON users;
CREATE POLICY "service_full_access_users" ON users FOR ALL USING (true);

DROP POLICY IF EXISTS "service_full_access_recordings" ON recordings;
CREATE POLICY "service_full_access_recordings" ON recordings FOR ALL USING (true);

DROP POLICY IF EXISTS "service_full_access_orders" ON orders;
CREATE POLICY "service_full_access_orders" ON orders FOR ALL USING (true);

DROP POLICY IF EXISTS "service_full_access_order_items" ON order_items;
CREATE POLICY "service_full_access_order_items" ON order_items FOR ALL USING (true);

DROP POLICY IF EXISTS "service_full_access_counters" ON order_counters;
CREATE POLICY "service_full_access_counters" ON order_counters FOR ALL USING (true);

DROP POLICY IF EXISTS "service_full_access_analytics" ON store_analytics_daily;
CREATE POLICY "service_full_access_analytics" ON store_analytics_daily FOR ALL USING (true);

DROP POLICY IF EXISTS "service_full_access_activity" ON activity_log;
CREATE POLICY "service_full_access_activity" ON activity_log FOR ALL USING (true);

-- ============================================================
-- PERFORMANCE INDEXES
-- ============================================================

-- Stores
CREATE INDEX IF NOT EXISTS idx_stores_city ON stores(store_city);
CREATE INDEX IF NOT EXISTS idx_stores_state ON stores(store_state);
CREATE INDEX IF NOT EXISTS idx_stores_category ON stores(store_category);
CREATE INDEX IF NOT EXISTS idx_stores_active ON stores(is_active);
CREATE INDEX IF NOT EXISTS idx_stores_created ON stores(created_at DESC);

-- Users
CREATE INDEX IF NOT EXISTS idx_users_auth_token ON users(auth_token);
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);

-- Recordings — multi-tenant
CREATE INDEX IF NOT EXISTS idx_recordings_store_phone ON recordings(store_phone);
CREATE INDEX IF NOT EXISTS idx_recordings_store_date ON recordings(store_phone, date_recorded DESC);
CREATE INDEX IF NOT EXISTS idx_recordings_classification ON recordings(store_phone, classification);
CREATE INDEX IF NOT EXISTS idx_recordings_source_phone ON recordings(source_phone);

-- Orders — multi-tenant
CREATE INDEX IF NOT EXISTS idx_orders_store_phone ON orders(store_phone);
CREATE INDEX IF NOT EXISTS idx_orders_store_created ON orders(store_phone, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_store_status ON orders(store_phone, is_cancelled, delivery_status);
CREATE INDEX IF NOT EXISTS idx_orders_customer_phone ON orders(customer_phone);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_payment ON orders(store_phone, payment_status);
-- Backward compat
CREATE INDEX IF NOT EXISTS idx_orders_user_phone ON orders(user_phone);

-- Order items — analytics queries
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_store ON order_items(store_phone);
CREATE INDEX IF NOT EXISTS idx_order_items_product ON order_items(store_phone, product_name);
CREATE INDEX IF NOT EXISTS idx_order_items_category ON order_items(store_phone, product_category);

-- Analytics
CREATE INDEX IF NOT EXISTS idx_analytics_store_date ON store_analytics_daily(store_phone, date_key DESC);

-- Activity log
CREATE INDEX IF NOT EXISTS idx_activity_store ON activity_log(store_phone, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_user ON activity_log(user_phone, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_action ON activity_log(action, created_at DESC);

-- ============================================================
-- FUNCTIONS
-- ============================================================

-- Atomic order counter increment (prevents race conditions)
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
-- VIEWS — Admin cross-store analytics
-- ============================================================

-- All stores with order counts
CREATE OR REPLACE VIEW admin_store_overview AS
SELECT
    s.phone AS store_phone,
    s.store_name,
    s.owner_name,
    s.store_category,
    s.store_city,
    s.store_state,
    s.is_active,
    s.plan_type,
    s.created_at,
    s.last_active_at,
    COUNT(DISTINCT o.id) AS total_orders,
    COALESCE(SUM(o.total_amount), 0) AS total_revenue,
    CASE WHEN COUNT(DISTINCT o.id) > 0
         THEN COALESCE(SUM(o.total_amount), 0) / COUNT(DISTINCT o.id)
         ELSE 0 END AS avg_order_value,
    COUNT(DISTINCT r.id) AS total_recordings,
    COUNT(DISTINCT o.customer_phone) AS unique_customers
FROM stores s
LEFT JOIN orders o ON o.store_phone = s.phone AND o.is_cancelled = FALSE
LEFT JOIN recordings r ON r.store_phone = s.phone
GROUP BY s.phone;

-- Top products across all stores
CREATE OR REPLACE VIEW admin_top_products AS
SELECT
    oi.product_name,
    oi.product_category,
    COUNT(*) AS times_ordered,
    COUNT(DISTINCT oi.store_phone) AS stores_ordering,
    SUM(oi.quantity_numeric) AS total_quantity,
    oi.quantity_unit,
    SUM(oi.total_price) AS total_revenue
FROM order_items oi
GROUP BY oi.product_name, oi.product_category, oi.quantity_unit
ORDER BY times_ordered DESC;
