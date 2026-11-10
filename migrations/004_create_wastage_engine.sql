-- Migration 004: Create Smart Wastage Agreement Engine tables & update gold_ledger status constraint

PRAGMA foreign_keys = OFF;

-- 1. Upgrade gold_ledger table to include 'REVIEW_REQUIRED' in status check constraint
CREATE TABLE IF NOT EXISTS gold_ledger_new (
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
  status TEXT NOT NULL DEFAULT 'PENDING_CONFIRMATION' CHECK (status IN ('PENDING_CONFIRMATION', 'CONFIRMED', 'DISPUTED', 'ESCALATED', 'REVIEW_REQUIRED')),
  initiated_by TEXT NOT NULL CHECK (initiated_by IN ('JEWELLER', 'KARIGAR')),
  confirmation_deadline TEXT NOT NULL,
  confirmed_at TEXT,
  dispute_reason TEXT,
  metadata TEXT DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (jeweller_id) REFERENCES platform_parties(id),
  FOREIGN KEY (karigar_id) REFERENCES platform_parties(id)
);

INSERT INTO gold_ledger_new SELECT * FROM gold_ledger;
DROP TABLE gold_ledger;
ALTER TABLE gold_ledger_new RENAME TO gold_ledger;

CREATE INDEX IF NOT EXISTS idx_gold_ledger_karigar_id ON gold_ledger(karigar_id);
CREATE INDEX IF NOT EXISTS idx_gold_ledger_jeweller_id ON gold_ledger(jeweller_id);
CREATE INDEX IF NOT EXISTS idx_gold_ledger_order_id ON gold_ledger(order_id);
CREATE INDEX IF NOT EXISTS idx_gold_ledger_status ON gold_ledger(status);
CREATE INDEX IF NOT EXISTS idx_gold_ledger_seq ON gold_ledger(sequence_number);
CREATE INDEX IF NOT EXISTS idx_gold_ledger_timestamp ON gold_ledger(timestamp);

-- 2. Create wastage_benchmarks table
CREATE TABLE IF NOT EXISTS wastage_benchmarks (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  subcategory TEXT,
  complexity TEXT NOT NULL CHECK (complexity IN ('SIMPLE', 'MEDIUM', 'COMPLEX', 'VERY_COMPLEX')),
  min_pct REAL NOT NULL,
  max_pct REAL NOT NULL,
  avg_pct REAL NOT NULL,
  sample_size INTEGER NOT NULL DEFAULT 100,
  description TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_benchmarks_cat_comp ON wastage_benchmarks(category, complexity);

-- 3. Create wastage_agreements table
CREATE TABLE IF NOT EXISTS wastage_agreements (
  id TEXT PRIMARY KEY,
  order_ref TEXT NOT NULL UNIQUE,
  jeweller_id TEXT NOT NULL,
  karigar_id TEXT NOT NULL,
  agreed_pct REAL NOT NULL CHECK (agreed_pct > 0),
  design_complexity TEXT NOT NULL CHECK (design_complexity IN ('SIMPLE', 'MEDIUM', 'COMPLEX', 'VERY_COMPLEX')),
  category TEXT,
  status TEXT NOT NULL DEFAULT 'PROPOSED' CHECK (status IN ('PROPOSED', 'ACCEPTED', 'REJECTED')),
  signature_jeweller TEXT,
  signature_karigar TEXT,
  proposed_at TEXT NOT NULL,
  responded_at TEXT,
  rejection_reason TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (jeweller_id) REFERENCES platform_parties(id),
  FOREIGN KEY (karigar_id) REFERENCES platform_parties(id)
);

CREATE INDEX IF NOT EXISTS idx_agreements_order_ref ON wastage_agreements(order_ref);
CREATE INDEX IF NOT EXISTS idx_agreements_jeweller ON wastage_agreements(jeweller_id);
CREATE INDEX IF NOT EXISTS idx_agreements_karigar ON wastage_agreements(karigar_id);
CREATE INDEX IF NOT EXISTS idx_agreements_status ON wastage_agreements(status);

-- 4. Seed Standard Industry Wastage Benchmarks
-- Simple rings: 5-8%
INSERT OR IGNORE INTO wastage_benchmarks (id, category, subcategory, complexity, min_pct, max_pct, avg_pct, sample_size, description)
VALUES ('bm-rings-simple', 'RINGS', 'Plain Band & Solitaire', 'SIMPLE', 5.0, 8.0, 6.5, 450, 'Standard die-punch, plain cast rings, low filing loss');

-- Medium necklaces: 8-12%
INSERT OR IGNORE INTO wastage_benchmarks (id, category, subcategory, complexity, min_pct, max_pct, avg_pct, sample_size, description)
VALUES ('bm-necklaces-med', 'NECKLACES', 'Choker & Link Necklace', 'MEDIUM', 8.0, 12.0, 10.0, 320, 'Linked motifs, stone setting collets, moderate filing and polishing loss');

-- Bridal sets: 12-18%
INSERT OR IGNORE INTO wastage_benchmarks (id, category, subcategory, complexity, min_pct, max_pct, avg_pct, sample_size, description)
VALUES ('bm-bridal-complex', 'BRIDAL_SETS', 'Kundan Jadau & Polki Haar Set', 'COMPLEX', 12.0, 18.0, 15.0, 210, 'Intricate floral filigree, multi-tier construction, extensive soldering and engraving');

-- Temple jewellery: 15-22%
INSERT OR IGNORE INTO wastage_benchmarks (id, category, subcategory, complexity, min_pct, max_pct, avg_pct, sample_size, description)
VALUES ('bm-temple-vcomplex', 'TEMPLE_JEWELLERY', 'Nakshi & Antique Deity Ornaments', 'VERY_COMPLEX', 15.0, 22.0, 18.5, 180, 'Deep relief repousse (chasing), antique oxide finish, heavy hand-chiseled detailing');

-- Additional benchmarks
INSERT OR IGNORE INTO wastage_benchmarks (id, category, subcategory, complexity, min_pct, max_pct, avg_pct, sample_size, description)
VALUES ('bm-bangles-simple', 'BANGLES', 'Plain Solid Kadas', 'SIMPLE', 5.5, 8.5, 7.0, 280, 'Solid wire drawing, sizing and minimal buffing');

INSERT OR IGNORE INTO wastage_benchmarks (id, category, subcategory, complexity, min_pct, max_pct, avg_pct, sample_size, description)
VALUES ('bm-earrings-med', 'EARRINGS', 'Jhumkas & Chandbalis', 'MEDIUM', 8.5, 12.5, 10.5, 340, 'Hollow dome fabrication with hanging pearls/gold beads');

-- 5. Seed Pre-existing Agreements for Seed Orders
INSERT OR IGNORE INTO wastage_agreements (id, order_ref, jeweller_id, karigar_id, agreed_pct, design_complexity, category, status, signature_jeweller, signature_karigar, proposed_at, responded_at, created_at, updated_at)
VALUES (
  'agr-seed-881',
  'ORD-2026-881',
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
  6.5,
  'SIMPLE',
  'RINGS',
  'ACCEPTED',
  'data:image/png;base64,jeweller_sig_seed',
  'data:image/png;base64,karigar_sig_seed',
  '2026-03-01T08:00:00Z',
  '2026-03-01T09:30:00Z',
  '2026-03-01T08:00:00Z',
  '2026-03-01T09:30:00Z'
);

INSERT OR IGNORE INTO wastage_agreements (id, order_ref, jeweller_id, karigar_id, agreed_pct, design_complexity, category, status, signature_jeweller, signature_karigar, proposed_at, responded_at, created_at, updated_at)
VALUES (
  'agr-seed-882',
  'ORD-2026-882',
  '11111111-1111-1111-1111-111111111111',
  '33333333-3333-3333-3333-333333333333',
  15.0,
  'COMPLEX',
  'BRIDAL_SETS',
  'ACCEPTED',
  'data:image/png;base64,jeweller_sig_seed',
  'data:image/png;base64,karigar_sig_seed',
  '2026-03-01T09:00:00Z',
  '2026-03-01T10:15:00Z',
  '2026-03-01T09:00:00Z',
  '2026-03-01T10:15:00Z'
);

INSERT OR IGNORE INTO wastage_agreements (id, order_ref, jeweller_id, karigar_id, agreed_pct, design_complexity, category, status, signature_jeweller, signature_karigar, proposed_at, responded_at, created_at, updated_at)
VALUES (
  'agr-seed-901',
  'ORD-2026-901',
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
  10.0,
  'MEDIUM',
  'NECKLACES',
  'PROPOSED',
  'data:image/png;base64,jeweller_sig_seed',
  NULL,
  '2026-03-02T11:00:00Z',
  NULL,
  '2026-03-02T11:00:00Z',
  '2026-03-02T11:00:00Z'
);

PRAGMA foreign_keys = ON;

