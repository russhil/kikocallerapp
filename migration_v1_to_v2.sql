-- ============================================================
-- MIGRATION: v1 → v2
-- Run this BEFORE the new schema if you have existing data.
-- This script is idempotent — safe to run multiple times.
-- ============================================================

-- ============================================================
-- Step 1: Create the stores table and populate from existing users
-- ============================================================
CREATE TABLE IF NOT EXISTS stores (
    phone TEXT PRIMARY KEY,
    store_name TEXT NOT NULL DEFAULT '',
    owner_name TEXT NOT NULL DEFAULT '',
    store_category TEXT,
    store_address TEXT,
    store_city TEXT,
    store_state TEXT,
    store_pincode TEXT,
    gst_number TEXT,
    avg_order_value DOUBLE PRECISION DEFAULT 0,
    total_orders BIGINT DEFAULT 0,
    total_revenue DOUBLE PRECISION DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    plan_type TEXT DEFAULT 'free',
    referral_code TEXT,
    referred_by TEXT,
    onboarding_completed BOOLEAN DEFAULT FALSE,
    last_active_at BIGINT,
    created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
    updated_at BIGINT
);

-- Populate stores from existing users (one store per registered phone)
INSERT INTO stores (phone, store_name, owner_name, created_at)
SELECT phone, shop_name, shopkeeper_name, created_at
FROM users
ON CONFLICT (phone) DO NOTHING;

-- Also create stores for any phone numbers in orders/recordings not yet in stores
INSERT INTO stores (phone, store_name)
SELECT DISTINCT user_phone, COALESCE(store_name, '')
FROM orders
WHERE user_phone IS NOT NULL
ON CONFLICT (phone) DO NOTHING;

INSERT INTO stores (phone)
SELECT DISTINCT user_phone
FROM recordings
WHERE user_phone IS NOT NULL AND user_phone NOT IN (SELECT phone FROM stores)
ON CONFLICT (phone) DO NOTHING;

-- ============================================================
-- Step 2: Add new columns to users
-- ============================================================
ALTER TABLE users ADD COLUMN IF NOT EXISTS device_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS device_model TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS device_os TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS app_version TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS fcm_token TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at BIGINT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS login_count BIGINT DEFAULT 0;

-- Add FK to stores (only if not already existing)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'users_phone_fkey' AND table_name = 'users'
    ) THEN
        ALTER TABLE users ADD CONSTRAINT users_phone_fkey
            FOREIGN KEY (phone) REFERENCES stores(phone) ON DELETE CASCADE;
    END IF;
END $$;

-- ============================================================
-- Step 3: Add new columns to recordings
-- ============================================================
ALTER TABLE recordings ADD COLUMN IF NOT EXISTS store_phone TEXT;
ALTER TABLE recordings ADD COLUMN IF NOT EXISTS call_type TEXT;
ALTER TABLE recordings ADD COLUMN IF NOT EXISTS sim_slot INTEGER;
ALTER TABLE recordings ADD COLUMN IF NOT EXISTS network_type TEXT;
ALTER TABLE recordings ADD COLUMN IF NOT EXISTS language_detected TEXT;
ALTER TABLE recordings ADD COLUMN IF NOT EXISTS sentiment TEXT;
ALTER TABLE recordings ADD COLUMN IF NOT EXISTS audio_quality_score REAL;
ALTER TABLE recordings ADD COLUMN IF NOT EXISTS word_count INTEGER;
ALTER TABLE recordings ADD COLUMN IF NOT EXISTS speaker_count INTEGER;
ALTER TABLE recordings ADD COLUMN IF NOT EXISTS processing_time_ms BIGINT;
ALTER TABLE recordings ADD COLUMN IF NOT EXISTS ai_model_used TEXT;
ALTER TABLE recordings ADD COLUMN IF NOT EXISTS transcript_confidence REAL;

-- Backfill store_phone from user_phone
UPDATE recordings SET store_phone = user_phone WHERE store_phone IS NULL AND user_phone IS NOT NULL;

-- Add FK (only after backfill)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'recordings_store_phone_fkey' AND table_name = 'recordings'
    ) THEN
        ALTER TABLE recordings ADD CONSTRAINT recordings_store_phone_fkey
            FOREIGN KEY (store_phone) REFERENCES stores(phone) ON DELETE CASCADE;
    END IF;
END $$;

-- ============================================================
-- Step 4: Add new columns to orders
-- ============================================================
ALTER TABLE orders ADD COLUMN IF NOT EXISTS store_phone TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_address TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS item_count INTEGER DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_cancelled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancelled_at BIGINT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancel_reason TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_source TEXT DEFAULT 'call';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'pending';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_status TEXT DEFAULT 'pending';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivered_at BIGINT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS confidence_score REAL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS processing_time_ms BIGINT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS device_model TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS device_os_version TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS app_version TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS session_id TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;

-- Backfill store_phone from user_phone
UPDATE orders SET store_phone = user_phone WHERE store_phone IS NULL AND user_phone IS NOT NULL;

-- Backfill item_count from products JSONB
UPDATE orders SET item_count = jsonb_array_length(products) WHERE item_count = 0 OR item_count IS NULL;

-- Add FK
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'orders_store_phone_fkey' AND table_name = 'orders'
    ) THEN
        ALTER TABLE orders ADD CONSTRAINT orders_store_phone_fkey
            FOREIGN KEY (store_phone) REFERENCES stores(phone) ON DELETE CASCADE;
    END IF;
END $$;

-- ============================================================
-- Step 5: Create order_items table and backfill from JSONB
-- ============================================================
CREATE TABLE IF NOT EXISTS order_items (
    id BIGSERIAL PRIMARY KEY,
    order_id TEXT NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
    store_phone TEXT NOT NULL REFERENCES stores(phone) ON DELETE CASCADE,
    product_name TEXT NOT NULL,
    product_category TEXT,
    quantity TEXT NOT NULL DEFAULT '1',
    quantity_numeric REAL,
    quantity_unit TEXT,
    unit_price DOUBLE PRECISION DEFAULT 0,
    total_price DOUBLE PRECISION DEFAULT 0,
    created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

-- Backfill order_items from existing orders' products JSONB
INSERT INTO order_items (order_id, store_phone, product_name, quantity, unit_price, total_price, created_at)
SELECT
    o.order_id,
    o.store_phone,
    item->>'name',
    COALESCE(item->>'quantity', '1'),
    COALESCE((item->>'price')::DOUBLE PRECISION, 0),
    COALESCE((item->>'price')::DOUBLE PRECISION, 0),
    o.created_at
FROM orders o,
     jsonb_array_elements(o.products) AS item
WHERE o.store_phone IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = o.order_id)
ON CONFLICT DO NOTHING;

-- ============================================================
-- Step 6: Create analytics and activity_log tables
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

-- Add new columns to activity_log (create table if it didn't exist in v1)
CREATE TABLE IF NOT EXISTS activity_log (
    id BIGSERIAL PRIMARY KEY,
    user_phone TEXT,
    action TEXT NOT NULL,
    entity_type TEXT,
    entity_id TEXT,
    metadata JSONB DEFAULT '{}'::JSONB,
    created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

ALTER TABLE activity_log ADD COLUMN IF NOT EXISTS store_phone TEXT;
ALTER TABLE activity_log ADD COLUMN IF NOT EXISTS ip_address TEXT;
ALTER TABLE activity_log ADD COLUMN IF NOT EXISTS user_agent TEXT;

-- ============================================================
-- Step 7: RLS for new tables
-- ============================================================
ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_analytics_daily ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_full_access_stores" ON stores;
CREATE POLICY "service_full_access_stores" ON stores FOR ALL USING (true);

DROP POLICY IF EXISTS "service_full_access_order_items" ON order_items;
CREATE POLICY "service_full_access_order_items" ON order_items FOR ALL USING (true);

DROP POLICY IF EXISTS "service_full_access_analytics" ON store_analytics_daily;
CREATE POLICY "service_full_access_analytics" ON store_analytics_daily FOR ALL USING (true);

-- ============================================================
-- Step 8: New indexes for scalability
-- ============================================================

-- Stores
CREATE INDEX IF NOT EXISTS idx_stores_city ON stores(store_city);
CREATE INDEX IF NOT EXISTS idx_stores_state ON stores(store_state);
CREATE INDEX IF NOT EXISTS idx_stores_category ON stores(store_category);
CREATE INDEX IF NOT EXISTS idx_stores_active ON stores(is_active);
CREATE INDEX IF NOT EXISTS idx_stores_created ON stores(created_at DESC);

-- Recordings (composite)
CREATE INDEX IF NOT EXISTS idx_recordings_store_phone ON recordings(store_phone);
CREATE INDEX IF NOT EXISTS idx_recordings_store_date ON recordings(store_phone, date_recorded DESC);
CREATE INDEX IF NOT EXISTS idx_recordings_classification ON recordings(store_phone, classification);

-- Orders (composite)
CREATE INDEX IF NOT EXISTS idx_orders_store_phone ON orders(store_phone);
CREATE INDEX IF NOT EXISTS idx_orders_store_created ON orders(store_phone, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_store_status ON orders(store_phone, is_cancelled, delivery_status);
CREATE INDEX IF NOT EXISTS idx_orders_customer_phone ON orders(customer_phone);
CREATE INDEX IF NOT EXISTS idx_orders_payment ON orders(store_phone, payment_status);

-- Order items
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_store ON order_items(store_phone);
CREATE INDEX IF NOT EXISTS idx_order_items_product ON order_items(store_phone, product_name);
CREATE INDEX IF NOT EXISTS idx_order_items_category ON order_items(store_phone, product_category);

-- Analytics
CREATE INDEX IF NOT EXISTS idx_analytics_store_date ON store_analytics_daily(store_phone, date_key DESC);

-- Activity
CREATE INDEX IF NOT EXISTS idx_activity_store ON activity_log(store_phone, created_at DESC);

-- ============================================================
-- Step 9: Admin views
-- ============================================================
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

-- ============================================================
-- Migration complete! 
-- Stores backfilled from users table.
-- Order items backfilled from orders.products JSONB.
-- All new columns have safe defaults.
-- ============================================================
