-- Migration 010: Create disputes, dispute_evidence, and dispute_messages tables

-- Update platform_parties table to allow MEDIATOR role
PRAGMA foreign_keys=off;
CREATE TABLE IF NOT EXISTS platform_parties_new (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('JEWELLER', 'KARIGAR', 'MEDIATOR')),
  full_name TEXT NOT NULL,
  business_name TEXT,
  phone TEXT NOT NULL UNIQUE,
  email TEXT,
  address TEXT,
  gstin TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO platform_parties_new SELECT * FROM platform_parties;
DROP TABLE platform_parties;
ALTER TABLE platform_parties_new RENAME TO platform_parties;
CREATE INDEX IF NOT EXISTS idx_parties_phone ON platform_parties(phone);
CREATE INDEX IF NOT EXISTS idx_parties_role ON platform_parties(role);
PRAGMA foreign_keys=on;

CREATE TABLE IF NOT EXISTS disputes (
  id TEXT PRIMARY KEY,
  dispute_number TEXT NOT NULL UNIQUE,
  target_type TEXT NOT NULL CHECK (target_type IN ('LEDGER_ENTRY', 'ORDER', 'SETTLEMENT')),
  target_id TEXT NOT NULL,
  jeweller_id TEXT NOT NULL,
  karigar_id TEXT NOT NULL,
  raised_by TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('WEIGHT', 'QUALITY', 'TIMING', 'PAYMENT', 'OTHER')),
  description TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('OPENED', 'EVIDENCE', 'REVIEW', 'MEDIATION', 'RESOLUTION_PROPOSED', 'RESOLVED', 'CLOSED')),
  evidence_deadline TEXT,
  snapshot_data TEXT NOT NULL,
  snapshot_hash TEXT NOT NULL,
  resolution_proposal TEXT,
  proposed_by TEXT,
  jeweller_accepted_at TEXT,
  karigar_accepted_at TEXT,
  at_fault_party TEXT CHECK (at_fault_party IN ('JEWELLER', 'KARIGAR', 'SPLIT', 'NONE', NULL)),
  penalty_points REAL DEFAULT 0.0,
  settlement_adjustment_amount REAL DEFAULT 0.0,
  resolution_notes TEXT,
  resolved_at TEXT,
  closed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS dispute_evidence (
  id TEXT PRIMARY KEY,
  dispute_id TEXT NOT NULL REFERENCES disputes(id) ON DELETE CASCADE,
  file_url TEXT NOT NULL,
  file_hash TEXT NOT NULL,
  perceptual_hash TEXT,
  uploaded_by TEXT NOT NULL,
  notes TEXT,
  uploaded_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS dispute_messages (
  id TEXT PRIMARY KEY,
  dispute_id TEXT NOT NULL REFERENCES disputes(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL,
  sender_name TEXT NOT NULL,
  sender_role TEXT NOT NULL CHECK (sender_role IN ('JEWELLER', 'KARIGAR', 'MEDIATOR', 'SYSTEM')),
  message TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_disputes_target ON disputes(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_disputes_status ON disputes(status);
CREATE INDEX IF NOT EXISTS idx_disputes_parties ON disputes(jeweller_id, karigar_id);
CREATE INDEX IF NOT EXISTS idx_dispute_evidence_disp ON dispute_evidence(dispute_id);
CREATE INDEX IF NOT EXISTS idx_dispute_messages_disp ON dispute_messages(dispute_id);
