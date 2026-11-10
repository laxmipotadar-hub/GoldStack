-- Migration 007: Create settlements and gold_rates tables

-- 1. Gold Bullion Rate History Table
CREATE TABLE IF NOT EXISTS gold_rates (
  id TEXT PRIMARY KEY,
  rate_per_gram_24k REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
  effective_date TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_gold_rates_effective ON gold_rates(effective_date);

-- Seed current 24K bullion rate from the UI header (₹ 7,420/g)
INSERT OR IGNORE INTO gold_rates (id, rate_per_gram_24k, currency, effective_date)
VALUES
  ('rate-2026-nov-09', 7420.00, 'INR', '2026-11-09'),
  ('rate-2026-nov-08', 7395.00, 'INR', '2026-11-08'),
  ('rate-2026-nov-07', 7410.00, 'INR', '2026-11-07');

-- 2. Settlements Table
CREATE TABLE IF NOT EXISTS settlements (
  id TEXT PRIMARY KEY,
  settlement_number TEXT NOT NULL UNIQUE,
  order_id TEXT REFERENCES orders(id) ON DELETE SET NULL,
  jeweller_id TEXT NOT NULL REFERENCES platform_parties(id),
  karigar_id TEXT NOT NULL REFERENCES platform_parties(id),
  gold_value REAL NOT NULL DEFAULT 0,
  making_charges REAL NOT NULL DEFAULT 0,
  wastage_adjustment REAL NOT NULL DEFAULT 0,
  shortage_penalty REAL NOT NULL DEFAULT 0,
  advances REAL NOT NULL DEFAULT 0,
  net_payable REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'AWAITING_KARIGAR', 'AWAITING_JEWELLER', 'DISPUTED', 'PAID')),
  line_items TEXT NOT NULL DEFAULT '[]', -- JSON string array of SettlementLineItem
  jeweller_approved_at TEXT,
  karigar_approved_at TEXT,
  paid_at TEXT,
  dispute_reason TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_settlements_order_id ON settlements(order_id);
CREATE INDEX IF NOT EXISTS idx_settlements_jeweller_id ON settlements(jeweller_id);
CREATE INDEX IF NOT EXISTS idx_settlements_karigar_id ON settlements(karigar_id);
CREATE INDEX IF NOT EXISTS idx_settlements_status ON settlements(status);
CREATE INDEX IF NOT EXISTS idx_settlements_number ON settlements(settlement_number);

