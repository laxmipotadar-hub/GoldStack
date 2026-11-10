-- Migration 003: Create OTP table for phone-based authentication
CREATE TABLE IF NOT EXISTS auth_otps (
  phone TEXT PRIMARY KEY,
  otp TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

