-- ====================================================================
-- IMMUTABLE GOLD LEDGER DATABASE SCHEMA (POSTGRESQL)
-- Jewellery Job-Work Platform
-- ====================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Clean existing if re-running
DROP TABLE IF EXISTS gold_ledger CASCADE;
DROP TABLE IF EXISTS jewellery_orders CASCADE;
DROP TABLE IF EXISTS platform_parties CASCADE;
DROP TYPE IF EXISTS ledger_transaction_type CASCADE;
DROP TYPE IF EXISTS ledger_status CASCADE;
DROP TYPE IF EXISTS party_role CASCADE;

-- 1. ENUMS
CREATE TYPE ledger_transaction_type AS ENUM (
    'ISSUE',
    'RETURN',
    'WASTAGE',
    'ADJUSTMENT'
);

CREATE TYPE ledger_status AS ENUM (
    'PENDING_CONFIRMATION',
    'CONFIRMED',
    'DISPUTED',
    'ESCALATED',
    'REVIEW_REQUIRED'
);

CREATE TYPE party_role AS ENUM (
    'JEWELLER',
    'KARIGAR'
);

-- 2. PARTIES TABLE (Jewellers and Karigars / Goldsmiths)
CREATE TABLE platform_parties (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role party_role NOT NULL,
    full_name VARCHAR(150) NOT NULL,
    business_name VARCHAR(200),
    phone VARCHAR(20) NOT NULL UNIQUE,
    email VARCHAR(150),
    address TEXT,
    gstin VARCHAR(15),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. ORDERS TABLE (Optional Job-Work Orders)
CREATE TABLE jewellery_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number VARCHAR(50) NOT NULL UNIQUE,
    jeweller_id UUID NOT NULL REFERENCES platform_parties(id),
    karigar_id UUID NOT NULL REFERENCES platform_parties(id),
    item_type VARCHAR(100) NOT NULL, -- e.g. "Bridal Necklace", "Bangles 22K"
    target_weight_grams DECIMAL(10,2) NOT NULL,
    purity_karat INT NOT NULL CHECK (purity_karat BETWEEN 1 AND 24),
    allowed_wastage_percentage DECIMAL(5,2) DEFAULT 2.50,
    status VARCHAR(30) DEFAULT 'IN_PROGRESS',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. IMMUTABLE GOLD LEDGER TABLE
CREATE TABLE gold_ledger (
    -- Unique Identifier
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Cryptographic Blockchain Hash Chain
    transaction_hash VARCHAR(64) NOT NULL UNIQUE,
    previous_hash VARCHAR(64) NOT NULL,
    sequence_number BIGSERIAL NOT NULL UNIQUE,

    -- Parties Involved
    jeweller_id UUID NOT NULL REFERENCES platform_parties(id),
    karigar_id UUID NOT NULL REFERENCES platform_parties(id),
    order_id UUID REFERENCES jewellery_orders(id) ON DELETE SET NULL,

    -- Transaction Core Attributes
    transaction_type ledger_transaction_type NOT NULL,
    weight_grams DECIMAL(10,2) NOT NULL CHECK (weight_grams > 0),
    purity_karat INT NOT NULL CHECK (purity_karat BETWEEN 1 AND 24),
    -- Automatically calculated pure gold equivalent (24K standard: weight * karat / 24)
    pure_weight_grams DECIMAL(10,4) GENERATED ALWAYS AS (ROUND((weight_grams * purity_karat / 24.0)::numeric, 4)) STORED,

    -- Digital Evidence & Tamper Detection
    photo_evidence_url TEXT,
    perceptual_hash VARCHAR(64), -- dHash for image tamper verification

    -- Dual Digital Signatures
    signature_jeweller TEXT,
    signature_karigar TEXT,

    -- Geolocation Evidence
    gps_lat DECIMAL(10,7),
    gps_lng DECIMAL(10,7),

    -- Cryptographic & Business Timestamps
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Dual Confirmation Workflow Fields
    status ledger_status NOT NULL DEFAULT 'PENDING_CONFIRMATION',
    initiated_by party_role NOT NULL,
    confirmation_deadline TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '24 hours'),
    confirmed_at TIMESTAMP WITH TIME ZONE,
    dispute_reason TEXT,

    -- Extensible Metadata (Item breakdown, wastage stats, client nonce for offline sync)
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 5. INDEXES FOR PERFORMANCE & AUDIT TRAIL
CREATE INDEX idx_gold_ledger_karigar_id ON gold_ledger(karigar_id);
CREATE INDEX idx_gold_ledger_jeweller_id ON gold_ledger(jeweller_id);
CREATE INDEX idx_gold_ledger_order_id ON gold_ledger(order_id);
CREATE INDEX idx_gold_ledger_tx_type ON gold_ledger(transaction_type);
CREATE INDEX idx_gold_ledger_status ON gold_ledger(status);
CREATE INDEX idx_gold_ledger_timestamp ON gold_ledger(timestamp);
CREATE INDEX idx_gold_ledger_prev_hash ON gold_ledger(previous_hash);
CREATE INDEX idx_gold_ledger_seq ON gold_ledger(sequence_number);
CREATE INDEX idx_gold_ledger_metadata_gin ON gold_ledger USING gin (metadata);

-- 6. IMMUTABILITY SAFEGUARD TRIGGER: Prevent updating hash chain, core weights, or confirmed rows
CREATE OR REPLACE FUNCTION enforce_ledger_immutability()
RETURNS TRIGGER AS $$
BEGIN
    -- Once CONFIRMED, no modifications are permitted whatsoever
    IF OLD.status = 'CONFIRMED' THEN
        RAISE EXCEPTION 'Cryptographic Ledger Violation: Confirmed entry % is immutable and cannot be modified.', OLD.id;
    END IF;

    -- If transitioning from PENDING_CONFIRMATION:
    -- Only status, confirmed_at, dispute_reason, and the missing signature are mutable.
    -- Core ledger fields (hashes, weights, purities, timestamps, parties) must NEVER change.
    IF OLD.transaction_hash != NEW.transaction_hash OR
       OLD.previous_hash != NEW.previous_hash OR
       OLD.sequence_number != NEW.sequence_number OR
       OLD.jeweller_id != NEW.jeweller_id OR
       OLD.karigar_id != NEW.karigar_id OR
       OLD.weight_grams != NEW.weight_grams OR
       OLD.purity_karat != NEW.purity_karat OR
       OLD.timestamp != NEW.timestamp OR
       OLD.initiated_by != NEW.initiated_by THEN
        RAISE EXCEPTION 'Cryptographic Ledger Violation: Core transaction data and hash chain cannot be altered.';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_enforce_ledger_immutability
BEFORE UPDATE ON gold_ledger
FOR EACH ROW
EXECUTE FUNCTION enforce_ledger_immutability();

-- 7. PREVENT ROW DELETION: Never allow deleting ledger records
CREATE OR REPLACE FUNCTION prevent_ledger_deletion()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Audit Trail Violation: Deleting records from gold_ledger is strictly prohibited. Transaction ID: %', OLD.id;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_prevent_ledger_deletion
BEFORE DELETE ON gold_ledger
FOR EACH ROW
EXECUTE FUNCTION prevent_ledger_deletion();

-- 8. AUTO-ESCALATION PROCEDURE: Escalate any pending transactions older than 24 hours
CREATE OR REPLACE FUNCTION check_and_escalate_expired_ledger_entries()
RETURNS TABLE(escalated_id UUID, time_elapsed INTERVAL) AS $$
BEGIN
    RETURN QUERY
    UPDATE gold_ledger
    SET status = 'ESCALATED',
        dispute_reason = COALESCE(dispute_reason || '; ', '') || 'Auto-escalated: 24-hour dual confirmation window expired.'
    WHERE status = 'PENDING_CONFIRMATION'
      AND CURRENT_TIMESTAMP > confirmation_deadline
    RETURNING id, CURRENT_TIMESTAMP - timestamp;
END;
$$ LANGUAGE plpgsql;

-- 9. VIEW: CURRENT BALANCE PER KARIGAR (PURE GOLD ACCOUNTING)
CREATE OR REPLACE VIEW view_karigar_gold_balances AS
SELECT 
    gl.karigar_id,
    p.full_name AS karigar_name,
    p.phone AS karigar_phone,
    gl.jeweller_id,
    jp.business_name AS jeweller_business_name,
    -- Issued Gold
    COALESCE(SUM(CASE WHEN gl.transaction_type = 'ISSUE' AND gl.status = 'CONFIRMED' THEN gl.weight_grams ELSE 0 END), 0) AS total_issued_grams,
    COALESCE(SUM(CASE WHEN gl.transaction_type = 'ISSUE' AND gl.status = 'CONFIRMED' THEN gl.pure_weight_grams ELSE 0 END), 0) AS total_issued_pure_grams,
    -- Returned Gold (Finished + Scrap)
    COALESCE(SUM(CASE WHEN gl.transaction_type = 'RETURN' AND gl.status = 'CONFIRMED' THEN gl.weight_grams ELSE 0 END), 0) AS total_returned_grams,
    COALESCE(SUM(CASE WHEN gl.transaction_type = 'RETURN' AND gl.status = 'CONFIRMED' THEN gl.pure_weight_grams ELSE 0 END), 0) AS total_returned_pure_grams,
    -- Wastage Claimed/Approved
    COALESCE(SUM(CASE WHEN gl.transaction_type = 'WASTAGE' AND gl.status = 'CONFIRMED' THEN gl.weight_grams ELSE 0 END), 0) AS total_wastage_grams,
    COALESCE(SUM(CASE WHEN gl.transaction_type = 'WASTAGE' AND gl.status = 'CONFIRMED' THEN gl.pure_weight_grams ELSE 0 END), 0) AS total_wastage_pure_grams,
    -- Net Custody Balance (Issued - Returned - Wastage)
    (
        COALESCE(SUM(CASE WHEN gl.transaction_type = 'ISSUE' AND gl.status = 'CONFIRMED' THEN gl.weight_grams ELSE 0 END), 0) -
        COALESCE(SUM(CASE WHEN gl.transaction_type = 'RETURN' AND gl.status = 'CONFIRMED' THEN gl.weight_grams ELSE 0 END), 0) -
        COALESCE(SUM(CASE WHEN gl.transaction_type = 'WASTAGE' AND gl.status = 'CONFIRMED' THEN gl.weight_grams ELSE 0 END), 0)
    ) AS net_balance_grams,
    -- Net 24K Pure Gold Custody Balance
    (
        COALESCE(SUM(CASE WHEN gl.transaction_type = 'ISSUE' AND gl.status = 'CONFIRMED' THEN gl.pure_weight_grams ELSE 0 END), 0) -
        COALESCE(SUM(CASE WHEN gl.transaction_type = 'RETURN' AND gl.status = 'CONFIRMED' THEN gl.pure_weight_grams ELSE 0 END), 0) -
        COALESCE(SUM(CASE WHEN gl.transaction_type = 'WASTAGE' AND gl.status = 'CONFIRMED' THEN gl.pure_weight_grams ELSE 0 END), 0)
    ) AS net_pure_balance_grams,
    -- Pending Confirmation stats
    COUNT(CASE WHEN gl.status = 'PENDING_CONFIRMATION' THEN 1 END) AS pending_count,
    COALESCE(SUM(CASE WHEN gl.status = 'PENDING_CONFIRMATION' THEN gl.weight_grams ELSE 0 END), 0) AS pending_grams
FROM gold_ledger gl
JOIN platform_parties p ON p.id = gl.karigar_id
JOIN platform_parties jp ON jp.id = gl.jeweller_id
GROUP BY gl.karigar_id, p.full_name, p.phone, gl.jeweller_id, jp.business_name;

-- 5. WASTAGE BENCHMARKS TABLE
CREATE TABLE IF NOT EXISTS wastage_benchmarks (
    id VARCHAR(64) PRIMARY KEY,
    category VARCHAR(64) NOT NULL,
    subcategory VARCHAR(100),
    complexity VARCHAR(32) NOT NULL CHECK (complexity IN ('SIMPLE', 'MEDIUM', 'COMPLEX', 'VERY_COMPLEX')),
    min_pct DECIMAL(5,2) NOT NULL,
    max_pct DECIMAL(5,2) NOT NULL,
    avg_pct DECIMAL(5,2) NOT NULL,
    sample_size INT NOT NULL DEFAULT 100,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6. WASTAGE AGREEMENTS TABLE
CREATE TABLE IF NOT EXISTS wastage_agreements (
    id VARCHAR(64) PRIMARY KEY,
    order_ref VARCHAR(100) NOT NULL UNIQUE,
    jeweller_id UUID NOT NULL REFERENCES platform_parties(id),
    karigar_id UUID NOT NULL REFERENCES platform_parties(id),
    agreed_pct DECIMAL(5,2) NOT NULL CHECK (agreed_pct > 0),
    design_complexity VARCHAR(32) NOT NULL CHECK (design_complexity IN ('SIMPLE', 'MEDIUM', 'COMPLEX', 'VERY_COMPLEX')),
    category VARCHAR(64),
    status VARCHAR(32) NOT NULL DEFAULT 'PROPOSED' CHECK (status IN ('PROPOSED', 'ACCEPTED', 'REJECTED')),
    signature_jeweller TEXT,
    signature_karigar TEXT,
    proposed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    responded_at TIMESTAMP WITH TIME ZONE,
    rejection_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 7. OCCASION ENUMS & CUSTOMER ORDERS TABLE
CREATE TYPE occasion_type AS ENUM ('WEDDING', 'FESTIVAL', 'CEREMONY', 'OTHER');
CREATE TYPE order_complexity AS ENUM ('SIMPLE', 'MEDIUM', 'COMPLEX', 'INTRICATE');
CREATE TYPE order_status AS ENUM ('ACTIVE', 'ON_TRACK', 'IN_PROGRESS', 'READY', 'DELIVERED', 'DELAYED', 'CANCELLED', 'AT_RISK', 'ESCALATED');
CREATE TYPE milestone_status AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'DELAYED');

CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number VARCHAR(100) NOT NULL UNIQUE,
    jeweller_id UUID NOT NULL REFERENCES platform_parties(id),
    karigar_id UUID NOT NULL REFERENCES platform_parties(id),
    customer_name_encrypted TEXT NOT NULL,
    occasion_type occasion_type NOT NULL,
    occasion_date DATE NOT NULL,
    design_complexity order_complexity NOT NULL,
    status order_status NOT NULL DEFAULT 'ON_TRACK',
    item_description TEXT,
    target_weight_grams DECIMAL(10,3),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_orders_jeweller ON orders(jeweller_id);
CREATE INDEX IF NOT EXISTS idx_orders_karigar ON orders(karigar_id);
CREATE INDEX IF NOT EXISTS idx_orders_number ON orders(order_number);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_occasion ON orders(occasion_date);

-- 8. MILESTONES TABLE WITH CRITICAL PATH (CPM) ATTRIBUTES
CREATE TABLE IF NOT EXISTS milestones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    name_hi VARCHAR(150),
    sequence INT NOT NULL,
    duration_days DECIMAL(5,1) NOT NULL,
    dependencies JSONB NOT NULL DEFAULT '[]'::jsonb,
    status milestone_status NOT NULL DEFAULT 'PENDING',
    planned_start_date DATE,
    planned_date DATE NOT NULL,
    actual_date DATE,
    earliest_start DECIMAL(6,2),
    earliest_finish DECIMAL(6,2),
    latest_start DECIMAL(6,2),
    latest_finish DECIMAL(6,2),
    slack DECIMAL(6,2),
    is_critical BOOLEAN DEFAULT FALSE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_milestones_order ON milestones(order_id);
CREATE INDEX IF NOT EXISTS idx_milestones_seq ON milestones(order_id, sequence);
CREATE INDEX IF NOT EXISTS idx_milestones_status ON milestones(status);
CREATE INDEX IF NOT EXISTS idx_milestones_critical ON milestones(is_critical);

-- 9. ORDER EVENTS TABLE (ESCALATION AUDIT TRAIL)
CREATE TABLE IF NOT EXISTS order_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    from_status VARCHAR(32) NOT NULL,
    to_status VARCHAR(32) NOT NULL,
    trigger_reason TEXT NOT NULL,
    risk_score DECIMAL(5,4),
    risk_level VARCHAR(16) CHECK (risk_level IN ('LOW', 'MEDIUM', 'HIGH')),
    actor_id UUID REFERENCES platform_parties(id),
    actor_role VARCHAR(16) CHECK (actor_role IN ('JEWELLER', 'KARIGAR', 'SYSTEM')),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_order_events_order ON order_events(order_id);
CREATE INDEX IF NOT EXISTS idx_order_events_created ON order_events(created_at);

-- 10. IN-APP NOTIFICATIONS TABLE
CREATE TABLE IF NOT EXISTS in_app_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES platform_parties(id),
    user_role VARCHAR(16) NOT NULL,
    order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    order_number VARCHAR(100),
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    severity VARCHAR(16) NOT NULL CHECK (severity IN ('info', 'low', 'medium', 'high', 'critical')),
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON in_app_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_role ON in_app_notifications(user_role);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON in_app_notifications(created_at);

-- 11. GOLD BULLION RATE HISTORY TABLE
CREATE TABLE IF NOT EXISTS gold_rates (
    id VARCHAR(64) PRIMARY KEY,
    rate_per_gram_24k DECIMAL(10,2) NOT NULL,
    currency VARCHAR(8) NOT NULL DEFAULT 'INR',
    effective_date DATE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_gold_rates_date ON gold_rates(effective_date);

-- 12. SETTLEMENTS TABLE WITH DUAL APPROVAL
CREATE TYPE settlement_status AS ENUM ('PENDING', 'AWAITING_KARIGAR', 'AWAITING_JEWELLER', 'DISPUTED', 'PAID');

CREATE TABLE IF NOT EXISTS settlements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    settlement_number VARCHAR(100) NOT NULL UNIQUE,
    order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    jeweller_id UUID NOT NULL REFERENCES platform_parties(id),
    karigar_id UUID NOT NULL REFERENCES platform_parties(id),
    gold_value DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    making_charges DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    wastage_adjustment DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    shortage_penalty DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    advances DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    net_payable DECIMAL(12,2) NOT NULL,
    status settlement_status NOT NULL DEFAULT 'PENDING',
    line_items JSONB NOT NULL DEFAULT '[]'::jsonb,
    gold_rate DECIMAL(10,2) NOT NULL DEFAULT 7420.00,
    payment_method VARCHAR(16) CHECK (payment_method IN ('UPI', 'BANK', 'CASH')),
    payment_reference VARCHAR(100),
    jeweller_approved_at TIMESTAMP WITH TIME ZONE,
    karigar_approved_at TIMESTAMP WITH TIME ZONE,
    paid_at TIMESTAMP WITH TIME ZONE,
    dispute_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_settlements_order ON settlements(order_id);
CREATE INDEX IF NOT EXISTS idx_settlements_jeweller ON settlements(jeweller_id);
CREATE INDEX IF NOT EXISTS idx_settlements_karigar ON settlements(karigar_id);
CREATE INDEX IF NOT EXISTS idx_settlements_status ON settlements(status);
CREATE INDEX IF NOT EXISTS idx_settlements_num ON settlements(settlement_number);

-- 9. KARIGAR TRUST SCORES & ARTISAN PASSPORTS
CREATE TABLE IF NOT EXISTS trust_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    karigar_id UUID NOT NULL UNIQUE REFERENCES platform_parties(id),
    composite_score DECIMAL(4,2) NOT NULL,
    on_time_delivery DECIMAL(4,2) NOT NULL,
    wastage_adherence DECIMAL(4,2) NOT NULL,
    quality_acceptance DECIMAL(4,2) NOT NULL,
    dispute_frequency DECIMAL(4,2) NOT NULL,
    communication_responsiveness DECIMAL(4,2) NOT NULL,
    sample_sizes JSONB NOT NULL DEFAULT '{}'::jsonb,
    factors_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    total_orders INTEGER NOT NULL DEFAULT 0,
    calculation_version VARCHAR(20) NOT NULL DEFAULT 'v1.0',
    is_public BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_trust_scores_karigar ON trust_scores(karigar_id);
CREATE INDEX IF NOT EXISTS idx_trust_scores_composite ON trust_scores(composite_score DESC);

-- 10. DISPUTES, EVIDENCE, AND MEDIATION MESSAGES
CREATE TYPE dispute_target_type AS ENUM ('LEDGER_ENTRY', 'ORDER', 'SETTLEMENT');
CREATE TYPE dispute_category AS ENUM ('WEIGHT', 'QUALITY', 'TIMING', 'PAYMENT', 'OTHER');
CREATE TYPE dispute_status AS ENUM ('OPENED', 'EVIDENCE', 'REVIEW', 'MEDIATION', 'RESOLUTION_PROPOSED', 'RESOLVED', 'CLOSED');

CREATE TABLE IF NOT EXISTS disputes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dispute_number VARCHAR(100) NOT NULL UNIQUE,
    target_type dispute_target_type NOT NULL,
    target_id VARCHAR(100) NOT NULL,
    jeweller_id UUID NOT NULL REFERENCES platform_parties(id),
    karigar_id UUID NOT NULL REFERENCES platform_parties(id),
    raised_by UUID NOT NULL REFERENCES platform_parties(id),
    category dispute_category NOT NULL,
    description TEXT NOT NULL,
    status dispute_status NOT NULL DEFAULT 'OPENED',
    evidence_deadline TIMESTAMP WITH TIME ZONE,
    snapshot_data JSONB NOT NULL,
    snapshot_hash VARCHAR(64) NOT NULL,
    resolution_proposal TEXT,
    proposed_by UUID REFERENCES platform_parties(id),
    jeweller_accepted_at TIMESTAMP WITH TIME ZONE,
    karigar_accepted_at TIMESTAMP WITH TIME ZONE,
    at_fault_party VARCHAR(20) CHECK (at_fault_party IN ('JEWELLER', 'KARIGAR', 'SPLIT', 'NONE')),
    penalty_points DECIMAL(4,2) DEFAULT 0.00,
    settlement_adjustment_amount DECIMAL(12,2) DEFAULT 0.00,
    resolution_notes TEXT,
    resolved_at TIMESTAMP WITH TIME ZONE,
    closed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS dispute_evidence (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dispute_id UUID NOT NULL REFERENCES disputes(id) ON DELETE CASCADE,
    file_url TEXT NOT NULL,
    file_hash VARCHAR(64) NOT NULL,
    perceptual_hash VARCHAR(64),
    uploaded_by UUID NOT NULL REFERENCES platform_parties(id),
    notes TEXT,
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS dispute_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dispute_id UUID NOT NULL REFERENCES disputes(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES platform_parties(id),
    sender_name VARCHAR(150) NOT NULL,
    sender_role VARCHAR(20) NOT NULL CHECK (sender_role IN ('JEWELLER', 'KARIGAR', 'MEDIATOR', 'SYSTEM')),
    message TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_disputes_target ON disputes(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_disputes_status ON disputes(status);
CREATE INDEX IF NOT EXISTS idx_disputes_parties ON disputes(jeweller_id, karigar_id);
CREATE INDEX IF NOT EXISTS idx_dispute_evidence_disp ON dispute_evidence(dispute_id);
CREATE INDEX IF NOT EXISTS idx_dispute_messages_disp ON dispute_messages(dispute_id);



