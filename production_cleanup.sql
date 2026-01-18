-- PRODUCTION DATABASE CLEANUP SCRIPT
-- Prairie Mobile Fuel Services
-- 
-- This script preserves:
--   - Owner account: Levi.Ernst@prairiemobilefuel.ca
--   - TRK-001 truck (with fuel levels reset to 0)
--   - Fuel pricing configuration
--   - Subscription tier configuration
--
-- INSTRUCTIONS:
-- 1. Open the Replit Database pane for your production database
-- 2. Copy and paste each section below, running them IN ORDER
-- 3. Wait for each section to complete before running the next
--
-- =====================================================

-- SECTION 1: Get IDs (run this first to verify the owner and truck exist)
-- Copy results to use in later sections if IDs differ
SELECT id, email FROM users WHERE LOWER(email) = LOWER('Levi.Ernst@prairiemobilefuel.ca');
SELECT id, unit_number, name FROM trucks WHERE unit_number = 'TRK-001';

-- =====================================================
-- SECTION 2: Clean operational data (safe to run first)
-- These tables have no foreign key dependencies

-- Delete all routes
DELETE FROM routes;

-- Delete all daily net margin snapshots
DELETE FROM daily_net_margin_snapshots;

-- Delete all fuel inventory transactions
DELETE FROM fuel_inventory_transactions;

-- Delete all truck fuel transactions
DELETE FROM truck_fuel_transactions;

-- Delete all shame events
DELETE FROM shame_events;

-- =====================================================
-- SECTION 3: Clean user-related data
-- Run these preserving owner's data

-- First, get the owner user ID into a variable (use the ID from SECTION 1)
-- Replace 'OWNER_USER_ID' with the actual ID if different

-- Delete order items for orders not belonging to owner
DELETE FROM order_items WHERE order_id IN (
  SELECT id FROM orders WHERE user_id NOT IN (
    SELECT id FROM users WHERE LOWER(email) = LOWER('Levi.Ernst@prairiemobilefuel.ca')
  )
);

-- Delete orders not belonging to owner
DELETE FROM orders WHERE user_id NOT IN (
  SELECT id FROM users WHERE LOWER(email) = LOWER('Levi.Ernst@prairiemobilefuel.ca')
);

-- Delete recurring schedules not belonging to owner
DELETE FROM recurring_schedules WHERE user_id NOT IN (
  SELECT id FROM users WHERE LOWER(email) = LOWER('Levi.Ernst@prairiemobilefuel.ca')
);

-- Delete vehicles not belonging to owner
DELETE FROM vehicles WHERE user_id NOT IN (
  SELECT id FROM users WHERE LOWER(email) = LOWER('Levi.Ernst@prairiemobilefuel.ca')
);

-- Delete reward transactions not belonging to owner
DELETE FROM reward_transactions WHERE user_id NOT IN (
  SELECT id FROM users WHERE LOWER(email) = LOWER('Levi.Ernst@prairiemobilefuel.ca')
);

-- Delete reward redemptions not belonging to owner
DELETE FROM reward_redemptions WHERE user_id NOT IN (
  SELECT id FROM users WHERE LOWER(email) = LOWER('Levi.Ernst@prairiemobilefuel.ca')
);

-- Delete reward balances not belonging to owner
DELETE FROM reward_balances WHERE user_id NOT IN (
  SELECT id FROM users WHERE LOWER(email) = LOWER('Levi.Ernst@prairiemobilefuel.ca')
);

-- Delete notifications not belonging to owner
DELETE FROM notifications WHERE user_id NOT IN (
  SELECT id FROM users WHERE LOWER(email) = LOWER('Levi.Ernst@prairiemobilefuel.ca')
);

-- Delete service requests not belonging to owner
DELETE FROM service_requests WHERE user_id NOT IN (
  SELECT id FROM users WHERE LOWER(email) = LOWER('Levi.Ernst@prairiemobilefuel.ca')
);

-- =====================================================
-- SECTION 4: Clean truck-related data

-- Delete pre-trip inspections not for TRK-001
DELETE FROM truck_pre_trip_inspections WHERE truck_id NOT IN (
  SELECT id FROM trucks WHERE unit_number = 'TRK-001'
);

-- Delete trucks not TRK-001
DELETE FROM trucks WHERE unit_number != 'TRK-001';

-- Delete drivers not assigned to owner
DELETE FROM drivers WHERE id NOT IN (
  SELECT id FROM users WHERE LOWER(email) = LOWER('Levi.Ernst@prairiemobilefuel.ca')
);

-- =====================================================
-- SECTION 5: Clean users (run last)

-- Delete all users except owner
DELETE FROM users WHERE LOWER(email) != LOWER('Levi.Ernst@prairiemobilefuel.ca');

-- =====================================================
-- SECTION 6: Reset values to zero

-- Reset TRK-001 fuel levels and odometer to 0
UPDATE trucks SET 
  regular_level = 0, 
  premium_level = 0, 
  diesel_level = 0, 
  odometer_reading = 0 
WHERE unit_number = 'TRK-001';

-- Reset fuel inventory to 0
UPDATE fuel_inventory SET current_stock = 0;

-- Reset owner's reward balance to 0
UPDATE reward_balances SET 
  available_points = 0, 
  lifetime_points = 0 
WHERE user_id IN (
  SELECT id FROM users WHERE LOWER(email) = LOWER('Levi.Ernst@prairiemobilefuel.ca')
);

-- Reset operating costs to 0
UPDATE business_settings SET setting_value = '0' WHERE setting_key = 'operatingCosts';

-- =====================================================
-- SECTION 7: Verify cleanup (run to confirm)

SELECT 'users' as table_name, COUNT(*) as count FROM users
UNION ALL SELECT 'orders', COUNT(*) FROM orders
UNION ALL SELECT 'vehicles', COUNT(*) FROM vehicles
UNION ALL SELECT 'trucks', COUNT(*) FROM trucks
UNION ALL SELECT 'drivers', COUNT(*) FROM drivers
UNION ALL SELECT 'recurring_schedules', COUNT(*) FROM recurring_schedules
UNION ALL SELECT 'routes', COUNT(*) FROM routes
UNION ALL SELECT 'service_requests', COUNT(*) FROM service_requests
UNION ALL SELECT 'fuel_inventory_transactions', COUNT(*) FROM fuel_inventory_transactions
UNION ALL SELECT 'daily_net_margin_snapshots', COUNT(*) FROM daily_net_margin_snapshots;

-- Expected results:
-- users: 1 (owner only)
-- orders: 0 (or owner's orders only)
-- vehicles: 1 (owner's vehicle only)
-- trucks: 1 (TRK-001 only)
-- drivers: 0
-- recurring_schedules: 0
-- routes: 0
-- service_requests: 0
-- fuel_inventory_transactions: 0
-- daily_net_margin_snapshots: 0
