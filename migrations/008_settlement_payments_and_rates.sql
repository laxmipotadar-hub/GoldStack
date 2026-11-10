-- Migration 008: Add payment execution columns and gold rate snapshot to settlements

ALTER TABLE settlements ADD COLUMN gold_rate REAL DEFAULT 7420.0;
ALTER TABLE settlements ADD COLUMN payment_method TEXT CHECK (payment_method IN ('UPI', 'BANK', 'CASH', NULL));
ALTER TABLE settlements ADD COLUMN payment_reference TEXT;

