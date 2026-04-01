-- ============================================================
-- DATA REPAIR SCRIPT
-- Run this in the Supabase SQL Editor to fix missing data.
-- This script is IDEMPOTENT — safe to run multiple times.
-- ============================================================

-- ============================================================
-- 1. Re-create missing `users` rows from `stores`
-- The `users` table is empty but `stores` has 14 rows.
-- This inserts a user row for every store, which allows
-- auth tokens to be stored and API auth to work.
-- ============================================================
INSERT INTO users (phone, shop_name, shopkeeper_name, created_at)
SELECT
    s.phone,
    s.store_name,
    s.owner_name,
    s.created_at
FROM stores s
WHERE NOT EXISTS (
    SELECT 1 FROM users u WHERE u.phone = s.phone
);

-- Verify
SELECT 'users_after_repair' AS check_name, COUNT(*) AS count FROM users;

-- ============================================================
-- 2. Clean orphaned `order_items` where the `order_id` 
-- doesn't exist in the `orders` table.
-- These are items with IDs like "001", "003" that were 
-- inserted but their parent order row is missing.
-- ============================================================
DELETE FROM order_items
WHERE order_id NOT IN (SELECT order_id FROM orders);

-- Verify
SELECT 'order_items_after_cleanup' AS check_name, COUNT(*) AS count FROM order_items;

-- ============================================================
-- 3. Initialize `order_counters` for all stores that have
-- completed onboarding (so next-id endpoint works).
-- ============================================================
INSERT INTO order_counters (user_phone, last_order_num)
SELECT s.phone, 0
FROM stores s
WHERE s.onboarding_completed = TRUE
  AND NOT EXISTS (
    SELECT 1 FROM order_counters oc WHERE oc.user_phone = s.phone
  );

-- Verify
SELECT 'order_counters_after_repair' AS check_name, COUNT(*) AS count FROM order_counters;

-- ============================================================
-- 4. Summary: Show current state of all tables
-- ============================================================
SELECT 'stores' AS table_name, COUNT(*) AS row_count FROM stores
UNION ALL
SELECT 'users', COUNT(*) FROM users
UNION ALL
SELECT 'recordings', COUNT(*) FROM recordings
UNION ALL
SELECT 'orders', COUNT(*) FROM orders
UNION ALL
SELECT 'order_items', COUNT(*) FROM order_items
UNION ALL
SELECT 'order_counters', COUNT(*) FROM order_counters
UNION ALL
SELECT 'activity_log', COUNT(*) FROM activity_log
UNION ALL
SELECT 'store_analytics_daily', COUNT(*) FROM store_analytics_daily;
