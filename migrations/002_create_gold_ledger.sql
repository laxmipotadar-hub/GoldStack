-- Migration 002: Create immutable gold ledger table
CREATE TABLE IF NOT EXISTS gold_ledger (
  id TEXT PRIMARY KEY,
  transaction_hash TEXT NOT NULL UNIQUE,
  previous_hash TEXT NOT NULL,
  sequence_number INTEGER NOT NULL UNIQUE,
  jeweller_id TEXT NOT NULL,
  karigar_id TEXT NOT NULL,
  order_id TEXT,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('ISSUE', 'RETURN', 'WASTAGE', 'ADJUSTMENT')),
  weight_grams REAL NOT NULL CHECK (weight_grams > 0),
  purity_karat INTEGER NOT NULL CHECK (purity_karat BETWEEN 1 AND 24),
  pure_weight_grams REAL NOT NULL,
  photo_evidence_url TEXT,
  perceptual_hash TEXT,
  signature_jeweller TEXT,
  signature_karigar TEXT,
  gps_lat REAL,
  gps_lng REAL,
  timestamp TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING_CONFIRMATION' CHECK (status IN ('PENDING_CONFIRMATION', 'CONFIRMED', 'DISPUTED', 'ESCALATED')),
  initiated_by TEXT NOT NULL CHECK (initiated_by IN ('JEWELLER', 'KARIGAR')),
  confirmation_deadline TEXT NOT NULL,
  confirmed_at TEXT,
  dispute_reason TEXT,
  metadata TEXT DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (jeweller_id) REFERENCES platform_parties(id),
  FOREIGN KEY (karigar_id) REFERENCES platform_parties(id)
);

CREATE INDEX IF NOT EXISTS idx_gold_ledger_karigar_id ON gold_ledger(karigar_id);
CREATE INDEX IF NOT EXISTS idx_gold_ledger_jeweller_id ON gold_ledger(jeweller_id);
CREATE INDEX IF NOT EXISTS idx_gold_ledger_order_id ON gold_ledger(order_id);
CREATE INDEX IF NOT EXISTS idx_gold_ledger_status ON gold_ledger(status);
CREATE INDEX IF NOT EXISTS idx_gold_ledger_seq ON gold_ledger(sequence_number);
CREATE INDEX IF NOT EXISTS idx_gold_ledger_timestamp ON gold_ledger(timestamp);

