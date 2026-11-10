-- Migration 006: Create order_events and in_app_notifications tables for delay-risk alerting and escalation state machine

PRAGMA foreign_keys=off;

-- 1. Upgrade orders table to support ON_TRACK and ESCALATED statuses
CREATE TABLE IF NOT EXISTS orders_new (
  id TEXT PRIMARY KEY,
  order_number TEXT NOT NULL UNIQUE,
  jeweller_id TEXT NOT NULL,
  karigar_id TEXT NOT NULL,
  customer_name_encrypted TEXT NOT NULL,
  occasion_type TEXT NOT NULL CHECK (occasion_type IN ('WEDDING', 'FESTIVAL', 'CEREMONY', 'OTHER')),
  occasion_date TEXT NOT NULL,
  design_complexity TEXT NOT NULL CHECK (design_complexity IN ('SIMPLE', 'MEDIUM', 'COMPLEX', 'INTRICATE')),
  status TEXT NOT NULL DEFAULT 'ON_TRACK' CHECK (status IN ('ACTIVE', 'ON_TRACK', 'IN_PROGRESS', 'READY', 'DELIVERED', 'DELAYED', 'CANCELLED', 'AT_RISK', 'ESCALATED')),
  item_description TEXT,
  target_weight_grams REAL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (jeweller_id) REFERENCES platform_parties(id),
  FOREIGN KEY (karigar_id) REFERENCES platform_parties(id)
);

INSERT INTO orders_new SELECT * FROM orders;
DROP TABLE orders;
ALTER TABLE orders_new RENAME TO orders;

CREATE INDEX IF NOT EXISTS idx_orders_jeweller_id ON orders(jeweller_id);
CREATE INDEX IF NOT EXISTS idx_orders_karigar_id ON orders(karigar_id);
CREATE INDEX IF NOT EXISTS idx_orders_order_number ON orders(order_number);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_occasion_date ON orders(occasion_date);

PRAGMA foreign_keys=on;

-- 2. Order Events Table (State Transitions & Escalation Audit)
CREATE TABLE IF NOT EXISTS order_events (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  from_status TEXT NOT NULL,
  to_status TEXT NOT NULL,
  trigger_reason TEXT NOT NULL,
  risk_score REAL,
  risk_level TEXT CHECK (risk_level IN ('LOW', 'MEDIUM', 'HIGH')),
  actor_id TEXT,
  actor_role TEXT,
  metadata TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_order_events_order_id ON order_events(order_id);
CREATE INDEX IF NOT EXISTS idx_order_events_created_at ON order_events(created_at);

-- 3. In-App Notifications Table
CREATE TABLE IF NOT EXISTS in_app_notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  user_role TEXT NOT NULL,
  order_id TEXT,
  order_number TEXT,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('info', 'low', 'medium', 'high', 'critical')),
  is_read INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON in_app_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_role ON in_app_notifications(user_role);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON in_app_notifications(created_at);

