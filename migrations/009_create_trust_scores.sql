-- Migration 009: Create trust_scores table for Karigar Trust Engine & Artisan Passport

CREATE TABLE IF NOT EXISTS trust_scores (
  id TEXT PRIMARY KEY,
  karigar_id TEXT NOT NULL UNIQUE,
  composite_score REAL NOT NULL,
  on_time_delivery REAL NOT NULL,
  wastage_adherence REAL NOT NULL,
  quality_acceptance REAL NOT NULL,
  dispute_frequency REAL NOT NULL,
  communication_responsiveness REAL NOT NULL,
  sample_sizes TEXT NOT NULL,
  factors_json TEXT NOT NULL,
  total_orders INTEGER NOT NULL DEFAULT 0,
  calculation_version TEXT NOT NULL DEFAULT 'v1.0',
  is_public INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_trust_scores_karigar ON trust_scores(karigar_id);
CREATE INDEX IF NOT EXISTS idx_trust_scores_composite ON trust_scores(composite_score DESC);

