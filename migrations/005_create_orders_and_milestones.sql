-- Migration 005: Create orders and milestones tables for customer occasion tracking and CPM engine

-- 1. Orders Table
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  order_number TEXT NOT NULL UNIQUE,
  jeweller_id TEXT NOT NULL,
  karigar_id TEXT NOT NULL,
  customer_name_encrypted TEXT NOT NULL,
  occasion_type TEXT NOT NULL CHECK (occasion_type IN ('WEDDING', 'FESTIVAL', 'CEREMONY', 'OTHER')),
  occasion_date TEXT NOT NULL,
  design_complexity TEXT NOT NULL CHECK (design_complexity IN ('SIMPLE', 'MEDIUM', 'COMPLEX', 'INTRICATE')),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'IN_PROGRESS', 'READY', 'DELIVERED', 'DELAYED', 'CANCELLED', 'AT_RISK')),
  item_description TEXT,
  target_weight_grams REAL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (jeweller_id) REFERENCES platform_parties(id),
  FOREIGN KEY (karigar_id) REFERENCES platform_parties(id)
);

CREATE INDEX IF NOT EXISTS idx_orders_jeweller_id ON orders(jeweller_id);
CREATE INDEX IF NOT EXISTS idx_orders_karigar_id ON orders(karigar_id);
CREATE INDEX IF NOT EXISTS idx_orders_order_number ON orders(order_number);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_occasion_date ON orders(occasion_date);

-- 2. Milestones Table
CREATE TABLE IF NOT EXISTS milestones (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  name TEXT NOT NULL,
  name_hi TEXT,
  sequence INTEGER NOT NULL,
  duration_days REAL NOT NULL,
  dependencies TEXT NOT NULL DEFAULT '[]', -- JSON string array of predecessor milestone IDs
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'DELAYED')),
  planned_start_date TEXT,
  planned_date TEXT NOT NULL, -- Planned finish date
  actual_date TEXT, -- Actual completion date
  earliest_start REAL,
  earliest_finish REAL,
  latest_start REAL,
  latest_finish REAL,
  slack REAL,
  is_critical INTEGER DEFAULT 0, -- 1 = critical path, 0 = slack available
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_milestones_order_id ON milestones(order_id);
CREATE INDEX IF NOT EXISTS idx_milestones_sequence ON milestones(order_id, sequence);
CREATE INDEX IF NOT EXISTS idx_milestones_status ON milestones(status);
CREATE INDEX IF NOT EXISTS idx_milestones_is_critical ON milestones(is_critical);

