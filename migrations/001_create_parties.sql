-- Migration 001: Create platform parties (Jewellers and Karigars)
CREATE TABLE IF NOT EXISTS platform_parties (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('JEWELLER', 'KARIGAR')),
  full_name TEXT NOT NULL,
  business_name TEXT,
  phone TEXT NOT NULL UNIQUE,
  email TEXT,
  address TEXT,
  gstin TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_parties_phone ON platform_parties(phone);
CREATE INDEX IF NOT EXISTS idx_parties_role ON platform_parties(role);

