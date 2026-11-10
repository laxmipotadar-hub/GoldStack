# GoldStack • Immutable Gold Ledger System
> **Cryptographically Verified Jewellery Job-Work & Karigar Ledger Platform**
> Built with TypeScript, React, Express, PostgreSQL, SHA-256 Hash Chaining, Google Cloud Storage, and Koshish Heritage Design System.

---

## 📖 Overview

The **GoldStack Immutable Gold Ledger** provides zero-ambiguity, tamper-proof tracking of physical gold bullion, finished ornaments, and workshop metal loss (*tunda/chheelan*) between jewellery showroom owners (*Jewellers*) and master goldsmith artisans (*Karigars*).

Every issuance, return, and wastage transaction is cryptographically linked to the preceding block using a **SHA-256 hash chain**, protected by **dual digital signatures**, stamped with **GPS coordinates**, and safeguarded with **perceptual image difference hashing (dHash)** for weighing-scale photo evidence.

---

## 🚀 Key Features

### 1. Cryptographic Hash Chain (`SHA-256`)
- Every transaction block computes its unique hash via:
  $$\text{Hash} = \text{SHA256}(\text{previous\_hash} + \text{canonicalJSON}(\text{transaction\_data}) + \text{timestamp})$$
- Deterministic canonical serialization prevents false verification failures across environments.
- Real-time **Chain Verification Engine** walks from the genesis block (`00000000...`) through the tip of the chain, verifying every link.
- Interactive **Tamper Simulation & Detection**: modifies block weights on-the-fly to demonstrate real-time cryptographic audit detection.

### 2. Dual Confirmation Workflow
- **Step 1 (Issuance/Return):** Initiating party specifies weights, purity (18K, 20K, 22K 916, 24K), attaches compressed photo evidence with dHash, captures GPS location, and signs digitally (`PENDING_CONFIRMATION`).
- **Step 2 (Counterparty Review):** The counterparty inspects weights, pure gold 24K equivalent, and scale evidence.
  - **Confirm:** Provides digital signature to transition status to `CONFIRMED` and permanently lock the block.
  - **Dispute:** Marks as `DISPUTED` with recorded reason for supervisory reconciliation.
- **24-Hour Timeout Escalation:** Automated periodic background worker flags any unconfirmed transaction older than 24 hours as `ESCALATED`.

### 3. Photo Evidence & Tamper Detection
- **Client-Side Compression:** High-resolution camera photos are automatically scaled to max 1080p and compressed below 2MB.
- **Perceptual dHash (Difference Hash):** Converts the image to a 9x8 grayscale thumbnail to extract a 64-bit fingerprint. Computes Hamming distance to detect visual tampering or altered weigh-scale chits.
- **Google Cloud Storage (GCS) Integration:** Generates v4 signed upload URLs (`getSignedUrl`) for direct cloud bucket uploads, with an automated local storage fallback for dev and offline environments.

### 4. Offline Queue & Background Sync
- Persists transactions into local browser storage if workshop network connectivity drops.
- Automatically listens to `window.addEventListener('online')` and replays pending entries in chronological order.
- **Last-Write-Wins (LWW) with Manual Review Flag:** If a concurrent conflict or state divergence occurs while offline, records the latest state and raises `needs_review: true`.

### 5. Smart Wastage Agreement Engine & Karigar Analytics
- **Benchmark Database:** Standard wastage ranges seeded for simple rings (5-8%), medium necklaces (8-12%), bridal sets (12-18%), and temple jewellery (15-22%).
- **Dual-Confirmation Proposals:** Jewellers propose an agreed wastage percentage referenced by `order_ref`; Karigars review and digitally sign to accept or dispute.
- **Automated `REVIEW_REQUIRED` Gate:** When gold is returned, actual wastage percentage is compared against the agreed rate. If variance exceeds agreed + 2.0%, the entry is flagged with `REVIEW_REQUIRED` for supervisory review.
- **Per-Karigar Wastage Analytics (WMA):** Rolling Weighted Moving Average (WMA) weighting recent returns linearly higher ($w_i = i$), category benchmark delta comparisons, and interactive trend charts.

### 6. Customer Occasion Orders & Critical Path Method (CPM)
- **Occasion Order Protection:** Anchors jewellery manufacturing to customer milestone dates (Weddings, Festivals, Ceremonies) with AES-256 encrypted customer names.
- **CPM Milestone Engine:** Forward pass (ES, EF) and backward pass (LS, LF) calculating float/slack to identify the zero-slack **Critical Path**.
- **Reverse-Scheduling:** Schedules milestone target completion dates backward from the non-negotiable wedding delivery deadline.
- **Downstream Delay Cascade:** When a workshop stage lags, recomputes all dependent milestone planned dates and alerts when occasion buffer is compromised.

### 7. Delay-Risk Alerting & Escalation Management
- **Risk Scoring Function:** Weighted combination of runway urgency (0.35), milestone completion lag (0.25), existing delays (0.25), and artisan reliability history (0.15), categorized into `LOW`, `MEDIUM`, and `HIGH` probability.
- **Escalation State Machine:**
  $$\text{ON\_TRACK} \rightarrow \text{AT\_RISK} \rightarrow \text{DELAYED} \rightarrow \text{ESCALATED}$$
- **`order_events` Audit Trail:** Fully logs state transitions with actor roles, trigger reasons, and timestamps.
- **Pluggable Multi-Channel Notifications:** `INotificationChannel` interface supporting `ConsoleMockSmsChannel` (`[SMS→karigar] Order #X at risk, 5 days to wedding`) alongside mock Twilio SMS and WhatsApp Business channels.
- **Frontend Controls:** In-app notification bell with live unread badge, `<RiskBadge>` with popover factor breakdown, and Jeweller Escalation Acknowledgment.

### 8. Heritage Design System (*Koshish Heritage Ledger*)
- Warm Ivory canvas (`#FFF8F5`), Deep Espresso ink (`#231A13`), and Champagne Gold accents (`#C6A15B`).
- Prominent rupee (₹) currency badges, 3-decimal gram metrics (`00.000 g`), tola conversions (`1 Tola = 11.6638 g`), and bilingual English & Devanagari labels.

---

## 🗄️ Database Schema (`gold_ledger`)

```sql
CREATE TYPE ledger_transaction_type AS ENUM ('ISSUE', 'RETURN', 'WASTAGE', 'ADJUSTMENT');
CREATE TYPE ledger_status AS ENUM ('PENDING_CONFIRMATION', 'CONFIRMED', 'DISPUTED', 'ESCALATED');
CREATE TYPE party_role AS ENUM ('JEWELLER', 'KARIGAR');

CREATE TABLE gold_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_hash VARCHAR(64) NOT NULL UNIQUE,
    previous_hash VARCHAR(64) NOT NULL,
    sequence_number BIGSERIAL NOT NULL UNIQUE,
    jeweller_id UUID NOT NULL REFERENCES platform_parties(id),
    karigar_id UUID NOT NULL REFERENCES platform_parties(id),
    order_id UUID REFERENCES jewellery_orders(id) ON DELETE SET NULL,
    transaction_type ledger_transaction_type NOT NULL,
    weight_grams DECIMAL(10,2) NOT NULL CHECK (weight_grams > 0),
    purity_karat INT NOT NULL CHECK (purity_karat BETWEEN 1 AND 24),
    pure_weight_grams DECIMAL(10,4) GENERATED ALWAYS AS (ROUND((weight_grams * purity_karat / 24.0)::numeric, 4)) STORED,
    photo_evidence_url TEXT,
    perceptual_hash VARCHAR(64),
    signature_jeweller TEXT,
    signature_karigar TEXT,
    gps_lat DECIMAL(10,7),
    gps_lng DECIMAL(10,7),
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status ledger_status NOT NULL DEFAULT 'PENDING_CONFIRMATION',
    initiated_by party_role NOT NULL,
    confirmation_deadline TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '24 hours'),
    confirmed_at TIMESTAMP WITH TIME ZONE,
    dispute_reason TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

---

## 🔌 API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/ledger/issue` | Create gold issuance block (signed by Jeweller) |
| `POST` | `/api/ledger/return` | Create gold return block with scrap & wastage breakdown (signed by Karigar) |
| `POST` | `/api/ledger/confirm` | Dual confirmation counterparty signature or dispute submission |
| `GET` | `/api/ledger/balance/:karigarId` | Real-time net weight, 24K pure fine equivalent, and karat breakdown |
| `GET` | `/api/ledger/history` | Paginated transaction history with filters (`karigar_id`, `status`, `search`) |
| `POST` | `/api/ledger/verify-chain` | Cryptographic audit walking and validating the full SHA-256 chain |
| `POST` | `/api/ledger/escalate-expired`| Auto-escalates pending entries exceeding the 24-hour confirmation window |
| `POST` | `/api/auth/send-otp` | Generates and sends OTP (Demo OTP: `123456`) |
| `POST` | `/api/auth/verify-otp` | Validates OTP and issues `httpOnly` JWT session cookie |
| `GET` | `/api/auth/me` | Validates active session and returns authenticated user profile |
| `POST` | `/api/auth/logout` | Clears `httpOnly` authentication cookie |
| `POST` | `/api/upload/signed-url` | Generate GCS v4 signed upload URL |
| `POST` | `/api/upload/direct` | Direct upload with server-side perceptual dHash calculation |
| `GET` | `/api/wastage/benchmarks` | Query standard wastage benchmark ranges with design suggestions |
| `POST` | `/api/wastage/propose` | Jeweller proposes wastage agreement for an order |
| `POST` | `/api/wastage/respond` | Karigar accepts or rejects proposed wastage agreement |
| `GET` | `/api/wastage/analytics/:karigarId` | Rolling average wastage (WMA), variance trend, and benchmark comparisons |
| `GET` | `/api/orders` | List customer occasion orders with status & occasion filters |
| `POST` | `/api/orders` | Create occasion order with auto-generated CPM reverse schedule |
| `GET` | `/api/orders/:id` | Single order detail with milestones, critical path, and risk factors |
| `POST` | `/api/orders/:id/milestones/:mid/complete` | Complete milestone and advance downstream sequence |
| `POST` | `/api/orders/:id/milestones/:mid/delay` | Record milestone delay and cascade downstream dates |
| `POST` | `/api/orders/:id/acknowledge-escalation` | Jeweller acknowledges escalation (`AT_RISK` / `DELAYED` $\rightarrow$ `ESCALATED`) |
| `GET` | `/api/orders/:id/events` | Chronological state transitions audit log |
| `GET` | `/api/notifications` | In-app alerts for authenticated user |
| `POST` | `/api/notifications/:id/read` | Mark in-app notification as read |
| `POST` | `/api/notifications/mark-all-read` | Mark all user notifications as read |

---

## 🔐 Authentication, Roles & Data Ownership

GoldStack implements strict server-side role-based access control and party data isolation:
- **Roles:** `JEWELLER` (showroom management, issuing vouchers) and `KARIGAR` (goldsmith artisans, returning finished work).
- **Phone + Mock OTP Login:** Accepts `"123456"` for instant evaluation with clear console and UI demo mode indicators.
- **JWT Session in `httpOnly` Cookies:** Sessions are secured with signed JSON Web Tokens in `httpOnly` cookies (`token`), preventing client-side script tampering.
- **Server-Side Data Ownership:**
  - Karigars can only retrieve ledger entries and balances where `karigar_id === req.user.id`. Querying another artisan's data results in `403 Forbidden`.
  - Only registered `JEWELLER` accounts can issue gold vouchers.
- **Default SQLite Store & Migrations:**
  - Backed by SQLite via `better-sqlite3` at `data/goldstack.sqlite` with WAL mode and foreign keys.
  - Numbered SQL migrations in `migrations/` (`001_create_parties.sql`, `002_create_gold_ledger.sql`, `003_create_otp_sessions.sql`).
  - Seamless fallback to JSON file store (`data/gold_ledger_store.json`) when SQLite or PostgreSQL is unavailable.
- **Consolidated Shared Types:**
  - Domain models, entities (`LedgerEntry`, `User`, `Role`, `TransactionType`), and API request/response shapes are centrally maintained in `shared/types.ts` and `shared/index.ts`.

---

## 🧪 Automated Test Suite

Run all unit, repository, and authentication tests with Vitest (99/99 passing across 12 test suites):

```bash
pnpm test
```

Test coverage includes:
- ✅ **Hash Chain (`tests/hashChain.test.ts`):** Genesis link, canonical stringify determinism, chain verification, tampering detection on weight alterations, broken link pointer detection.
- ✅ **Perceptual dHash (`tests/perceptualHash.test.ts`):** Hamming distance computation, bit-shift invariance, image noise tolerance (>90% similarity).
- ✅ **Offline Queue (`tests/offlineSync.test.ts`):** Enqueue with unique client nonce, FIFO replay, LWW conflict resolution.
- ✅ **Repository (`tests/repository.test.ts`):** Pure gold 24K calculations, dual confirmation lock, immutability enforcement against post-confirmation edits, SQLite 12 genesis seed blocks.
- ✅ **Authentication & Access Control (`tests/auth.test.ts`):** Mock OTP login, JWT cookie generation, session verification via `/api/auth/me`, 401 unauthorized access rejection, 403 cross-karigar isolation, and role guard validation.
- ✅ **Smart Wastage Agreement Engine (`tests/wastage.test.ts`):** Benchmark retrieval, proposal & acceptance dual signatures, 403 authorization guardrails, and return flow +2.0% variance `REVIEW_REQUIRED` gate.
- ✅ **Wastage Analytics (`tests/wastageAnalytics.test.ts`):** Pure TypeScript Weighted Moving Average (WMA) calculation, variance points, category benchmark comparisons.
- ✅ **CPM Milestone Engine (`tests/cpmEngine.test.ts`):** Forward pass (ES, EF), backward pass (LS, LF), zero-slack Critical Path identification, reverse scheduling, duration scaling by design complexity.
- ✅ **Customer Occasion Orders (`tests/orders.test.ts`):** Order creation with reverse-scheduled milestones, strict jeweller/karigar data ownership isolation, delay cascades.
- ✅ **Risk Scoring Engine (`tests/riskScoring.test.ts`):** Urgency, completion lag, delay severity, and artisan history factor weighting, probability score mathematical verification.
- ✅ **Delay-Risk Alerting & Escalation (`tests/riskAlerting.test.ts`):** State transitions (`ON_TRACK` $\rightarrow$ `AT_RISK` $\rightarrow$ `DELAYED` $\rightarrow$ `ESCALATED`), `order_events` logging, simulated console SMS interception (`[SMS→karigar] Order #X at risk, 5 days to wedding`), in-app notifications API.

---

## 🛠️ Development & Execution

### 1. Run Server & Frontend Together
```bash
pnpm run dev
```

- **Frontend (Vite + React):** [http://localhost:5173](http://localhost:5173)
- **Backend API (Express + TS):** [http://localhost:3001](http://localhost:3001)

### 2. Build for Production
```bash
pnpm run build
```

