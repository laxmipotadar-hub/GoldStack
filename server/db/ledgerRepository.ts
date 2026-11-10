import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  LedgerEntry,
  GoldLedgerEntry,
  LedgerStatus,
  LedgerMetadata,
  IssueGoldRequest,
  ReturnGoldRequest,
  ConfirmLedgerRequest,
  LedgerBalanceSummary,
  LedgerHistoryFilter,
  PaginatedResult,
  Party,
  User,
  Role,
  AuthUser,
  PaymentMethod
} from '../../shared/types.js';
import {
  GENESIS_PREVIOUS_HASH,
  calculateTransactionHash,
  extractHashPayload
} from '../crypto/hashChain.js';
import { dbManager } from './index.js';
import { sqliteManager } from './sqlite.js';
import { wastageRepository } from './wastageRepository.js';

export const SEED_PARTIES: Party[] = [
  {
    id: '11111111-1111-1111-1111-111111111111',
    name: 'Lalit Soni (Lalit Jewellers)',
    role: 'JEWELLER',
    phone: '+91 98201 12345',
    businessName: 'Lalit Jewellers • Zaveri Bazaar',
    avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150'
  },
  {
    id: '22222222-2222-2222-2222-222222222222',
    name: 'Ramesh Soni (Master Karigar)',
    role: 'KARIGAR',
    phone: '+91 98202 23456',
    businessName: 'Bench #4 • Master Goldsmith',
    avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150'
  },
  {
    id: '33333333-3333-3333-3333-333333333333',
    name: 'Priya Goldsmith (Filigree Artist)',
    role: 'KARIGAR',
    phone: '+91 98203 34567',
    businessName: 'Bench #7 • Antique & Filigree Specialist',
    avatarUrl: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150'
  },
  {
    id: '44444444-4444-4444-4444-444444444444',
    name: 'Manoj Filigree (Kundan Karigar)',
    role: 'KARIGAR',
    phone: '+91 98204 45678',
    businessName: 'Bench #12 • Kundan & Meenakari',
    avatarUrl: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150'
  },
  {
    id: '55555555-5555-5555-5555-555555555555',
    name: 'Vikramaditya Shreshthi (Trade Mediator)',
    role: 'MEDIATOR',
    phone: '+91 98205 56789',
    businessName: 'Zaveri Bazaar Bullion & Jewellery Trade Guild (स्वर्ण मध्यस्थ मंडल)',
    avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'
  },
  {
    id: '66666666-6666-6666-6666-666666666666',
    name: 'Deepa Verma (Heritage Apprentice)',
    role: 'KARIGAR',
    phone: '+91 98206 67890',
    businessName: 'Bench #15 • Polki Setting Apprentice (Cold-Start)',
    avatarUrl: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150'
  }
];

export function build12SeedBlocks(): GoldLedgerEntry[] {
  const jeweller = SEED_PARTIES[0];
  const karigar1 = SEED_PARTIES[1]; // Ramesh
  const karigar2 = SEED_PARTIES[2]; // Priya
  const karigar3 = SEED_PARTIES[3]; // Manoj

  const entries: GoldLedgerEntry[] = [];
  let prevHash = GENESIS_PREVIOUS_HASH;
  let seq = 1;

  const rawSeedSpecs = [
    {
      k: karigar1,
      type: 'ISSUE' as const,
      wt: 100.0,
      karat: 22,
      order: 'ORD-204',
      hoursAgo: 72,
      status: 'CONFIRMED' as const,
      desc: 'Fine 22K Casting Gold for Bridal Choker'
    },
    {
      k: karigar1,
      type: 'ISSUE' as const,
      wt: 50.0,
      karat: 22,
      order: 'ORD-204',
      hoursAgo: 60,
      status: 'CONFIRMED' as const,
      desc: 'Supplementary 22K Wire & Sheet Stock'
    },
    {
      k: karigar1,
      type: 'RETURN' as const,
      wt: 128.5,
      karat: 22,
      order: 'ORD-204',
      hoursAgo: 48,
      status: 'CONFIRMED' as const,
      desc: 'Bridal Necklace Finished Piece with Hallmarking',
      meta: { finishedItemGrams: 121.5, scrapGrams: 7.0, wastageGrams: 1.5 }
    },
    {
      k: karigar1,
      type: 'WASTAGE' as const,
      wt: 1.5,
      karat: 22,
      order: 'ORD-204',
      hoursAgo: 47,
      status: 'CONFIRMED' as const,
      desc: 'Allowed Process Loss (Tunda/Chheelan)'
    },
    {
      k: karigar2,
      type: 'ISSUE' as const,
      wt: 80.0,
      karat: 22,
      order: 'ORD-209',
      hoursAgo: 40,
      status: 'CONFIRMED' as const,
      desc: '22K Fine Strip & Wire for Filigree Bangles'
    },
    {
      k: karigar1,
      type: 'ISSUE' as const,
      wt: 20.0,
      karat: 22,
      order: 'ORD-210',
      hoursAgo: 30,
      status: 'PENDING_CONFIRMATION' as const,
      desc: 'Gold for matching earrings pendant set'
    },
    {
      k: karigar3,
      type: 'ISSUE' as const,
      wt: 60.0,
      karat: 18,
      order: 'ORD-215',
      hoursAgo: 24,
      status: 'CONFIRMED' as const,
      desc: '18K Gold for Traditional Kundan Jadau Set'
    },
    {
      k: karigar3,
      type: 'RETURN' as const,
      wt: 58.2,
      karat: 18,
      order: 'ORD-215',
      hoursAgo: 16,
      status: 'CONFIRMED' as const,
      desc: 'Completed Kundan Bangles with Enamel Work',
      meta: { finishedItemGrams: 55.0, scrapGrams: 3.2, wastageGrams: 1.8 }
    },
    {
      k: karigar3,
      type: 'WASTAGE' as const,
      wt: 1.8,
      karat: 18,
      order: 'ORD-215',
      hoursAgo: 15,
      status: 'CONFIRMED' as const,
      desc: 'Approved Meenakari & Filing Wastage'
    },
    {
      k: karigar2,
      type: 'ISSUE' as const,
      wt: 40.0,
      karat: 24,
      order: 'ORD-218',
      hoursAgo: 12,
      status: 'CONFIRMED' as const,
      desc: '24K Fine Bullion Casting Grain'
    },
    {
      k: karigar2,
      type: 'RETURN' as const,
      wt: 38.8,
      karat: 24,
      order: 'ORD-218',
      hoursAgo: 6,
      status: 'CONFIRMED' as const,
      desc: 'Intricate Floral Filigree Jhumkas',
      meta: { finishedItemGrams: 38.0, scrapGrams: 0.8, wastageGrams: 1.2 }
    },
    {
      k: karigar1,
      type: 'RETURN' as const,
      wt: 18.5,
      karat: 22,
      order: 'ORD-210',
      hoursAgo: 2,
      status: 'PENDING_CONFIRMATION' as const,
      desc: 'Earrings Finished Piece returned by Ramesh'
    }
  ];

  for (const s of rawSeedSpecs) {
    const ts = new Date(Date.now() - s.hoursAgo * 3600 * 1000).toISOString();
    const isKarigarInitiator = s.type === 'RETURN';

    const payload = extractHashPayload({
      jeweller_id: jeweller.id,
      karigar_id: s.k.id,
      order_id: s.order,
      transaction_type: s.type,
      weight_grams: s.wt,
      purity_karat: s.karat,
      photo_evidence_url: `/api/upload/evidence/seed_block_${seq}.jpg`,
      perceptual_hash: `hash${seq}abcdef012345`.padEnd(16, '0'),
      gps_lat: 18.954321,
      gps_lng: 72.831234,
      initiated_by: isKarigarInitiator ? 'KARIGAR' : 'JEWELLER',
      metadata: {
        orderNumber: s.order,
        itemDescription: s.desc,
        ...(s.meta || {})
      }
    });

    const hash = calculateTransactionHash(prevHash, payload, ts);
    const pure = Number(((s.wt * s.karat) / 24).toFixed(4));
    const isPending = s.status === 'PENDING_CONFIRMATION';

    const sampleSig =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

    entries.push({
      id: `block-${String(seq).padStart(4, '0')}-0000-1111-222233334444`,
      transaction_hash: hash,
      previous_hash: prevHash,
      sequence_number: seq,
      jeweller_id: payload.jeweller_id,
      karigar_id: payload.karigar_id,
      order_id: payload.order_id,
      transaction_type: payload.transaction_type,
      weight_grams: payload.weight_grams,
      purity_karat: payload.purity_karat,
      pure_weight_grams: pure,
      photo_evidence_url: payload.photo_evidence_url,
      perceptual_hash: payload.perceptual_hash,
      signature_jeweller: !isKarigarInitiator || !isPending ? sampleSig : null,
      signature_karigar: isKarigarInitiator || !isPending ? sampleSig : null,
      gps_lat: payload.gps_lat,
      gps_lng: payload.gps_lng,
      timestamp: ts,
      status: s.status,
      initiated_by: payload.initiated_by,
      confirmation_deadline: new Date(new Date(ts).getTime() + 24 * 3600 * 1000).toISOString(),
      confirmed_at: !isPending ? new Date(new Date(ts).getTime() + 20 * 60 * 1000).toISOString() : null,
      dispute_reason: null,
      metadata: payload.metadata,
      created_at: ts
    });

    prevHash = hash;
    seq++;
  }

  return entries;
}

export class LedgerRepository {
  private inMemoryLedger: GoldLedgerEntry[] = [];
  private inMemoryOtps: Map<string, { otp: string; expiresAt: string }> = new Map();
  private dataFilePath: string;

  constructor() {
    this.dataFilePath = path.resolve(process.cwd(), 'data', 'ledger_store.json');
  }

  async init(): Promise<void> {
    if (dbManager.isPostgres) {
      await this.initPostgresParties();
      return;
    }

    if (dbManager.isSqlite) {
      this.initSqliteData();
      return;
    }

    // File-backed fallback
    try {
      await fs.mkdir(path.dirname(this.dataFilePath), { recursive: true });
      const raw = await fs.readFile(this.dataFilePath, 'utf8');
      this.inMemoryLedger = JSON.parse(raw);
      console.log(`[Repository] Loaded ${this.inMemoryLedger.length} ledger blocks from persistent store.`);
    } catch {
      console.log('[Repository] No existing ledger store found. Seeding initial genesis chain...');
      this.inMemoryLedger = build12SeedBlocks();
      await this.saveStore();
    }
  }

  private initSqliteData(): void {
    const db = sqliteManager.getDb();

    // 1. Seed / upsert parties
    const insertParty = db.prepare(`
      INSERT OR IGNORE INTO platform_parties (id, role, full_name, business_name, phone)
      VALUES (?, ?, ?, ?, ?)
    `);
    for (const p of SEED_PARTIES) {
      insertParty.run(p.id, p.role, p.name, p.businessName || null, p.phone);
    }

    // 2. Seed 12 ledger blocks if ledger table is empty
    const blockCount = (db.prepare('SELECT COUNT(*) as count FROM gold_ledger').get() as any).count;
    if (blockCount === 0) {
      const seedBlocks = build12SeedBlocks();
      const insertBlock = db.prepare(`
        INSERT INTO gold_ledger (
          id, transaction_hash, previous_hash, sequence_number, jeweller_id, karigar_id, order_id,
          transaction_type, weight_grams, purity_karat, pure_weight_grams, photo_evidence_url,
          perceptual_hash, signature_jeweller, signature_karigar, gps_lat, gps_lng, timestamp,
          status, initiated_by, confirmation_deadline, confirmed_at, dispute_reason, metadata, created_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        )
      `);

      const insertMany = db.transaction((blocks: GoldLedgerEntry[]) => {
        for (const b of blocks) {
          insertBlock.run(
            b.id,
            b.transaction_hash,
            b.previous_hash,
            b.sequence_number,
            b.jeweller_id,
            b.karigar_id,
            b.order_id,
            b.transaction_type,
            b.weight_grams,
            b.purity_karat,
            b.pure_weight_grams,
            b.photo_evidence_url,
            b.perceptual_hash,
            b.signature_jeweller,
            b.signature_karigar,
            b.gps_lat,
            b.gps_lng,
            b.timestamp,
            b.status,
            b.initiated_by,
            b.confirmation_deadline,
            b.confirmed_at,
            b.dispute_reason,
            JSON.stringify(b.metadata),
            b.created_at
          );
        }
      });

      insertMany(seedBlocks);
      console.log(`[SQLite] Migrated and seeded ${seedBlocks.length} verified genesis ledger blocks into SQLite.`);
    }

    // Sync in-memory view with SQLite
    this.inMemoryLedger = this.getAllFromSqlite();
  }

  private getAllFromSqlite(): GoldLedgerEntry[] {
    const db = sqliteManager.getDb();
    const rows = db.prepare('SELECT * FROM gold_ledger ORDER BY sequence_number ASC').all() as any[];
    return rows.map(this.mapSqliteRow);
  }

  private mapSqliteRow(row: any): GoldLedgerEntry {
    return {
      id: row.id,
      transaction_hash: row.transaction_hash,
      previous_hash: row.previous_hash,
      sequence_number: row.sequence_number,
      jeweller_id: row.jeweller_id,
      karigar_id: row.karigar_id,
      order_id: row.order_id,
      transaction_type: row.transaction_type,
      weight_grams: Number(row.weight_grams),
      purity_karat: Number(row.purity_karat),
      pure_weight_grams: Number(row.pure_weight_grams),
      photo_evidence_url: row.photo_evidence_url,
      perceptual_hash: row.perceptual_hash,
      signature_jeweller: row.signature_jeweller,
      signature_karigar: row.signature_karigar,
      gps_lat: row.gps_lat !== null ? Number(row.gps_lat) : null,
      gps_lng: row.gps_lng !== null ? Number(row.gps_lng) : null,
      timestamp: row.timestamp,
      status: row.status,
      initiated_by: row.initiated_by,
      confirmation_deadline: row.confirmation_deadline,
      confirmed_at: row.confirmed_at,
      dispute_reason: row.dispute_reason,
      metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata || {},
      created_at: row.created_at
    };
  }

  private async saveStore(): Promise<void> {
    if (dbManager.isPostgres || dbManager.isSqlite) return;
    try {
      await fs.mkdir(path.dirname(this.dataFilePath), { recursive: true });
      await fs.writeFile(this.dataFilePath, JSON.stringify(this.inMemoryLedger, null, 2), 'utf8');
    } catch (err) {
      console.error('[Repository] Error saving ledger store:', err);
    }
  }

  private async initPostgresParties(): Promise<void> {
    for (const p of SEED_PARTIES) {
      await dbManager.query(
        `INSERT INTO platform_parties (id, role, full_name, business_name, phone)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, business_name = EXCLUDED.business_name;`,
        [p.id, p.role, p.name, p.businessName, p.phone]
      );
    }
  }

  // --- Auth & OTP helpers ---
  async saveOtp(phone: string, otp: string, expiresAt: string): Promise<void> {
    if (dbManager.isSqlite) {
      const db = sqliteManager.getDb();
      db.prepare(`
        INSERT INTO auth_otps (phone, otp, expires_at)
        VALUES (?, ?, ?)
        ON CONFLICT(phone) DO UPDATE SET otp = excluded.otp, expires_at = excluded.expires_at
      `).run(phone, otp, expiresAt);
      return;
    }
    this.inMemoryOtps.set(phone, { otp, expiresAt });
  }

  async verifyOtp(phone: string, otp: string): Promise<boolean> {
    if (otp === '123456') return true; // Standard demo OTP override

    if (dbManager.isSqlite) {
      const db = sqliteManager.getDb();
      const row = db.prepare('SELECT otp, expires_at FROM auth_otps WHERE phone = ?').get(phone) as any;
      if (!row) return false;
      const isNotExpired = new Date(row.expires_at) > new Date();
      return row.otp === otp && isNotExpired;
    }

    const stored = this.inMemoryOtps.get(phone);
    if (!stored) return false;
    return stored.otp === otp && new Date(stored.expiresAt) > new Date();
  }

  async findPartyById(id: string): Promise<Party | null> {
    const parties = await this.getParties();
    return parties.find((p) => p.id === id) || null;
  }

  async getEntryById(id: string): Promise<GoldLedgerEntry | null> {
    if (dbManager.isPostgres) {
      const res = await dbManager.query<GoldLedgerEntry>('SELECT * FROM gold_ledger WHERE id = $1', [id]);
      return res.rows[0] || null;
    }
    if (dbManager.isSqlite) {
      const db = sqliteManager.getDb();
      const row = db.prepare('SELECT * FROM gold_ledger WHERE id = ?').get(id);
      return row ? this.mapSqliteRow(row) : null;
    }
    return this.inMemoryLedger.find((e) => e.id === id) || null;
  }

  async getParties(): Promise<Party[]> {
    if (dbManager.isPostgres) {
      const res = await dbManager.query<Party>(
        'SELECT id, full_name as name, role, phone, business_name as "businessName" FROM platform_parties'
      );
      return res.rows;
    }
    if (dbManager.isSqlite) {
      const db = sqliteManager.getDb();
      const rows = db.prepare('SELECT id, full_name as name, role, phone, business_name as businessName FROM platform_parties').all() as any[];
      return rows;
    }
    return SEED_PARTIES;
  }

  async getLatestBlock(): Promise<GoldLedgerEntry | null> {
    if (dbManager.isPostgres) {
      const res = await dbManager.query<GoldLedgerEntry>(
        'SELECT * FROM gold_ledger ORDER BY sequence_number DESC LIMIT 1'
      );
      return res.rows[0] || null;
    }
    if (dbManager.isSqlite) {
      const db = sqliteManager.getDb();
      const row = db.prepare('SELECT * FROM gold_ledger ORDER BY sequence_number DESC LIMIT 1').get();
      return row ? this.mapSqliteRow(row) : null;
    }
    if (this.inMemoryLedger.length === 0) return null;
    return this.inMemoryLedger[this.inMemoryLedger.length - 1];
  }

  async createIssueEntry(req: IssueGoldRequest): Promise<GoldLedgerEntry> {
    const timestamp = new Date().toISOString();
    const deadline = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    const id = crypto.randomUUID();

    const prevBlock = await this.getLatestBlock();
    const previousHash = prevBlock ? prevBlock.transaction_hash : GENESIS_PREVIOUS_HASH;
    const sequenceNumber = prevBlock ? prevBlock.sequence_number + 1 : 1;

    const payload = extractHashPayload({
      jeweller_id: req.jeweller_id,
      karigar_id: req.karigar_id,
      order_id: req.order_id || null,
      transaction_type: 'ISSUE',
      weight_grams: req.weight_grams,
      purity_karat: req.purity_karat,
      photo_evidence_url: req.photo_evidence_url || null,
      perceptual_hash: req.perceptual_hash || null,
      gps_lat: req.gps_lat || null,
      gps_lng: req.gps_lng || null,
      initiated_by: 'JEWELLER',
      metadata: req.metadata || {}
    });

    const transactionHash = calculateTransactionHash(previousHash, payload, timestamp);
    const pureWeightGrams = Number(((req.weight_grams * req.purity_karat) / 24).toFixed(4));

    const entry: GoldLedgerEntry = {
      id,
      transaction_hash: transactionHash,
      previous_hash: previousHash,
      sequence_number: sequenceNumber,
      jeweller_id: req.jeweller_id,
      karigar_id: req.karigar_id,
      order_id: req.order_id || null,
      transaction_type: 'ISSUE',
      weight_grams: Number(req.weight_grams.toFixed(2)),
      purity_karat: req.purity_karat,
      pure_weight_grams: pureWeightGrams,
      photo_evidence_url: req.photo_evidence_url || null,
      perceptual_hash: req.perceptual_hash || null,
      signature_jeweller: req.signature_jeweller,
      signature_karigar: null,
      gps_lat: req.gps_lat || null,
      gps_lng: req.gps_lng || null,
      timestamp,
      status: 'PENDING_CONFIRMATION',
      initiated_by: 'JEWELLER',
      confirmation_deadline: deadline,
      confirmed_at: null,
      dispute_reason: null,
      metadata: req.metadata || {},
      created_at: timestamp
    };

    if (dbManager.isPostgres) {
      await dbManager.query(
        `INSERT INTO gold_ledger (
          id, transaction_hash, previous_hash, jeweller_id, karigar_id, order_id,
          transaction_type, weight_grams, purity_karat, photo_evidence_url, perceptual_hash,
          signature_jeweller, signature_karigar, gps_lat, gps_lng, timestamp, status,
          initiated_by, confirmation_deadline, metadata
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20
        )`,
        [
          entry.id,
          entry.transaction_hash,
          entry.previous_hash,
          entry.jeweller_id,
          entry.karigar_id,
          entry.order_id,
          entry.transaction_type,
          entry.weight_grams,
          entry.purity_karat,
          entry.photo_evidence_url,
          entry.perceptual_hash,
          entry.signature_jeweller,
          entry.signature_karigar,
          entry.gps_lat,
          entry.gps_lng,
          entry.timestamp,
          entry.status,
          entry.initiated_by,
          entry.confirmation_deadline,
          JSON.stringify(entry.metadata)
        ]
      );
    } else if (dbManager.isSqlite) {
      const db = sqliteManager.getDb();
      db.prepare(`
        INSERT INTO gold_ledger (
          id, transaction_hash, previous_hash, sequence_number, jeweller_id, karigar_id, order_id,
          transaction_type, weight_grams, purity_karat, pure_weight_grams, photo_evidence_url,
          perceptual_hash, signature_jeweller, signature_karigar, gps_lat, gps_lng, timestamp,
          status, initiated_by, confirmation_deadline, confirmed_at, dispute_reason, metadata, created_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        )
      `).run(
        entry.id,
        entry.transaction_hash,
        entry.previous_hash,
        entry.sequence_number,
        entry.jeweller_id,
        entry.karigar_id,
        entry.order_id,
        entry.transaction_type,
        entry.weight_grams,
        entry.purity_karat,
        entry.pure_weight_grams,
        entry.photo_evidence_url,
        entry.perceptual_hash,
        entry.signature_jeweller,
        entry.signature_karigar,
        entry.gps_lat,
        entry.gps_lng,
        entry.timestamp,
        entry.status,
        entry.initiated_by,
        entry.confirmation_deadline,
        entry.confirmed_at,
        entry.dispute_reason,
        JSON.stringify(entry.metadata),
        entry.created_at
      );
      this.inMemoryLedger.push(entry);
    } else {
      this.inMemoryLedger.push(entry);
      await this.saveStore();
    }

    return entry;
  }

  async createReturnEntry(req: ReturnGoldRequest): Promise<GoldLedgerEntry> {
    const timestamp = new Date().toISOString();
    const deadline = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    const id = crypto.randomUUID();

    const prevBlock = await this.getLatestBlock();
    const previousHash = prevBlock ? prevBlock.transaction_hash : GENESIS_PREVIOUS_HASH;
    const sequenceNumber = prevBlock ? prevBlock.sequence_number + 1 : 1;

    // Smart Wastage Agreement Engine: Check for agreed wastage for this order
    const orderRef = req.order_id || (req.metadata?.order_ref as string) || (req.metadata?.orderNumber as string);
    let agreement = orderRef ? await wastageRepository.getAgreementByOrderRef(orderRef) : null;

    // Determine issued weight: from metadata, from previous ISSUE blocks for this order, or estimated from return + loss
    let issuedGrams = 0;
    if (req.metadata?.issued_grams || req.metadata?.issuedGrams) {
      issuedGrams = Number(req.metadata?.issued_grams || req.metadata?.issuedGrams);
    } else if (orderRef) {
      const allEntries = await this.getAllEntriesForVerification();
      const issueBlocks = allEntries.filter(
        (e) => e.transaction_type === 'ISSUE' && (e.order_id === orderRef || e.metadata?.orderNumber === orderRef)
      );
      if (issueBlocks.length > 0) {
        issuedGrams = issueBlocks.reduce((acc, b) => acc + b.weight_grams, 0);
      }
    }

    if (!issuedGrams || issuedGrams <= 0) {
      issuedGrams = req.weight_grams + (req.wastage_grams || 0) + (req.scrap_grams || 0);
    }

    let agreedPct: number | undefined = agreement?.agreed_pct;
    if (agreedPct === undefined && (req.metadata?.agreed_wastage_pct || req.metadata?.agreedWastagePct)) {
      agreedPct = Number(req.metadata?.agreed_wastage_pct || req.metadata?.agreedWastagePct);
    }

    let initialStatus: LedgerStatus = 'PENDING_CONFIRMATION';
    const metadata: LedgerMetadata = {
      ...(req.metadata || {}),
      wastageGrams: req.wastage_grams || 0,
      scrapGrams: req.scrap_grams || 0
    };

    if (agreedPct !== undefined && !isNaN(agreedPct) && issuedGrams > 0) {
      const varianceDetails = wastageRepository.calculateVariance(issuedGrams, req.weight_grams, agreedPct);
      metadata.order_ref = orderRef || undefined;
      metadata.agreedWastagePct = agreedPct;
      metadata.actualWastagePct = varianceDetails.actual_wastage_pct;
      metadata.allowedWastageGrams = varianceDetails.allowed_wastage_grams;
      metadata.varianceGrams = varianceDetails.variance_grams;
      metadata.variancePct = varianceDetails.variance_pct;
      metadata.exceedsAllowedWastage = varianceDetails.exceeds_tolerance;
      metadata.reviewRequired = varianceDetails.review_required;
      metadata.wastageVariance = varianceDetails;

      // If actual exceeds agreed + 2%, flag entry with REVIEW_REQUIRED
      if (varianceDetails.review_required) {
        initialStatus = 'REVIEW_REQUIRED';
        metadata.needsManualReview = true;
        metadata.conflictDetails = `Actual wastage (${varianceDetails.actual_wastage_pct}%) exceeds agreed limit (${agreedPct}%) by ${varianceDetails.variance_pct}% (Threshold: agreed + 2%). Flagged with REVIEW_REQUIRED.`;
      }
    }

    const payload = extractHashPayload({
      jeweller_id: req.jeweller_id,
      karigar_id: req.karigar_id,
      order_id: req.order_id || null,
      transaction_type: 'RETURN',
      weight_grams: req.weight_grams,
      purity_karat: req.purity_karat,
      photo_evidence_url: req.photo_evidence_url || null,
      perceptual_hash: req.perceptual_hash || null,
      gps_lat: req.gps_lat || null,
      gps_lng: req.gps_lng || null,
      initiated_by: 'KARIGAR',
      metadata
    });

    const transactionHash = calculateTransactionHash(previousHash, payload, timestamp);
    const pureWeightGrams = Number(((req.weight_grams * req.purity_karat) / 24).toFixed(4));

    const entry: GoldLedgerEntry = {
      id,
      transaction_hash: transactionHash,
      previous_hash: previousHash,
      sequence_number: sequenceNumber,
      jeweller_id: req.jeweller_id,
      karigar_id: req.karigar_id,
      order_id: req.order_id || null,
      transaction_type: 'RETURN',
      weight_grams: Number(req.weight_grams.toFixed(2)),
      purity_karat: req.purity_karat,
      pure_weight_grams: pureWeightGrams,
      photo_evidence_url: req.photo_evidence_url || null,
      perceptual_hash: req.perceptual_hash || null,
      signature_jeweller: null,
      signature_karigar: req.signature_karigar,
      gps_lat: req.gps_lat || null,
      gps_lng: req.gps_lng || null,
      timestamp,
      status: initialStatus,
      initiated_by: 'KARIGAR',
      confirmation_deadline: deadline,
      confirmed_at: null,
      dispute_reason: null,
      metadata,
      created_at: timestamp
    };

    if (dbManager.isPostgres) {
      await dbManager.query(
        `INSERT INTO gold_ledger (
          id, transaction_hash, previous_hash, jeweller_id, karigar_id, order_id,
          transaction_type, weight_grams, purity_karat, photo_evidence_url, perceptual_hash,
          signature_jeweller, signature_karigar, gps_lat, gps_lng, timestamp, status,
          initiated_by, confirmation_deadline, metadata
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20
        )`,
        [
          entry.id,
          entry.transaction_hash,
          entry.previous_hash,
          entry.jeweller_id,
          entry.karigar_id,
          entry.order_id,
          entry.transaction_type,
          entry.weight_grams,
          entry.purity_karat,
          entry.photo_evidence_url,
          entry.perceptual_hash,
          entry.signature_jeweller,
          entry.signature_karigar,
          entry.gps_lat,
          entry.gps_lng,
          entry.timestamp,
          entry.status,
          entry.initiated_by,
          entry.confirmation_deadline,
          JSON.stringify(entry.metadata)
        ]
      );
    } else if (dbManager.isSqlite) {
      const db = sqliteManager.getDb();
      db.prepare(`
        INSERT INTO gold_ledger (
          id, transaction_hash, previous_hash, sequence_number, jeweller_id, karigar_id, order_id,
          transaction_type, weight_grams, purity_karat, pure_weight_grams, photo_evidence_url,
          perceptual_hash, signature_jeweller, signature_karigar, gps_lat, gps_lng, timestamp,
          status, initiated_by, confirmation_deadline, confirmed_at, dispute_reason, metadata, created_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        )
      `).run(
        entry.id,
        entry.transaction_hash,
        entry.previous_hash,
        entry.sequence_number,
        entry.jeweller_id,
        entry.karigar_id,
        entry.order_id,
        entry.transaction_type,
        entry.weight_grams,
        entry.purity_karat,
        entry.pure_weight_grams,
        entry.photo_evidence_url,
        entry.perceptual_hash,
        entry.signature_jeweller,
        entry.signature_karigar,
        entry.gps_lat,
        entry.gps_lng,
        entry.timestamp,
        entry.status,
        entry.initiated_by,
        entry.confirmation_deadline,
        entry.confirmed_at,
        entry.dispute_reason,
        JSON.stringify(entry.metadata),
        entry.created_at
      );
      this.inMemoryLedger.push(entry);
    } else {
      this.inMemoryLedger.push(entry);
      await this.saveStore();
    }

    return entry;
  }

  async confirmEntry(req: ConfirmLedgerRequest, user?: AuthUser): Promise<GoldLedgerEntry> {
    let entry: GoldLedgerEntry | undefined;

    if (dbManager.isPostgres) {
      const res = await dbManager.query<GoldLedgerEntry>('SELECT * FROM gold_ledger WHERE id = $1', [req.ledger_id]);
      entry = res.rows[0];
    } else if (dbManager.isSqlite) {
      const db = sqliteManager.getDb();
      const row = db.prepare('SELECT * FROM gold_ledger WHERE id = ?').get(req.ledger_id);
      entry = row ? this.mapSqliteRow(row) : undefined;
    } else {
      entry = this.inMemoryLedger.find((item) => item.id === req.ledger_id);
    }

    if (!entry) {
      throw new Error(`Ledger entry ${req.ledger_id} not found`);
    }

    // Ownership check: Confirming party must match role and identity
    if (user) {
      if (req.party === 'JEWELLER' && entry.jeweller_id !== user.id) {
        throw new Error('Access denied. You can only confirm entries issued by or addressed to your business.');
      }
      if (req.party === 'KARIGAR' && entry.karigar_id !== user.id) {
        throw new Error('Access denied. You can only confirm entries assigned to your artisan account.');
      }
    }

    if (entry.status === 'CONFIRMED') {
      throw new Error('This ledger entry has already been confirmed and cannot be modified.');
    }

    const confirmedAt = new Date().toISOString();
    const newStatus = req.action === 'CONFIRM' ? 'CONFIRMED' : 'DISPUTED';

    let sigJeweller = entry.signature_jeweller;
    let sigKarigar = entry.signature_karigar;

    if (req.action === 'CONFIRM') {
      if (req.party === 'JEWELLER') {
        sigJeweller = req.signature;
      } else {
        sigKarigar = req.signature;
      }
    }

    if (dbManager.isPostgres) {
      const updateRes = await dbManager.query<GoldLedgerEntry>(
        `UPDATE gold_ledger
         SET status = $1,
             signature_jeweller = $2,
             signature_karigar = $3,
             confirmed_at = $4,
             dispute_reason = $5
         WHERE id = $6
         RETURNING *`,
        [newStatus, sigJeweller, sigKarigar, confirmedAt, req.dispute_reason || null, req.ledger_id]
      );
      return updateRes.rows[0];
    } else if (dbManager.isSqlite) {
      const db = sqliteManager.getDb();
      db.prepare(`
        UPDATE gold_ledger
        SET status = ?,
            signature_jeweller = ?,
            signature_karigar = ?,
            confirmed_at = ?,
            dispute_reason = ?
        WHERE id = ?
      `).run(newStatus, sigJeweller, sigKarigar, confirmedAt, req.dispute_reason || null, req.ledger_id);

      const updatedRow = db.prepare('SELECT * FROM gold_ledger WHERE id = ?').get(req.ledger_id);
      const updated = this.mapSqliteRow(updatedRow);
      const idx = this.inMemoryLedger.findIndex((i) => i.id === req.ledger_id);
      if (idx !== -1) this.inMemoryLedger[idx] = updated;
      return updated;
    }

    entry.status = newStatus;
    entry.signature_jeweller = sigJeweller;
    entry.signature_karigar = sigKarigar;
    entry.confirmed_at = confirmedAt;
    entry.dispute_reason = req.dispute_reason || null;
    await this.saveStore();

    return entry;
  }

  /**
   * Writes an immutable ADJUSTMENT entry into the blockchain ledger
   * when a Job-Work Settlement is marked PAID.
   */
  async createAdjustmentEntry(options: {
    jeweller_id: string;
    karigar_id: string;
    order_id?: string | null;
    weight_grams?: number;
    purity_karat?: number;
    settlement_id: string;
    settlement_number: string;
    net_payable: number;
    gold_rate?: number;
    payment_method: PaymentMethod;
    payment_reference?: string;
    notes?: string;
    signature_jeweller?: string;
  }): Promise<GoldLedgerEntry> {
    const latest = await this.getLatestBlock();
    const previousHash = latest ? latest.transaction_hash : GENESIS_PREVIOUS_HASH;
    const sequenceNumber = latest ? latest.sequence_number + 1 : 1;

    const id = `block-adj-${crypto.randomUUID()}`;
    const timestamp = new Date().toISOString();
    const rate = options.gold_rate && options.gold_rate > 0 ? options.gold_rate : 7420;
    const goldEquivalentGrams = options.net_payable > 0 ? Number((options.net_payable / rate).toFixed(3)) : 0.001;
    const weightGrams = options.weight_grams && options.weight_grams > 0 ? options.weight_grams : Math.max(0.001, goldEquivalentGrams);
    const purityKarat = options.purity_karat ?? 24;
    const pureWeightGrams = Number(((weightGrams * purityKarat) / 24).toFixed(4));

    const metadata: LedgerMetadata = {
      settlement_id: options.settlement_id,
      settlement_number: options.settlement_number,
      net_payable: options.net_payable,
      gold_rate: rate,
      gold_equivalent_grams: weightGrams,
      payment_method: options.payment_method,
      payment_reference: options.payment_reference || 'N/A',
      notes: options.notes || `Settlement payment voucher #${options.settlement_number}`,
      itemDescription: `हिसाब भुगतान (${options.payment_method} Ref: ${options.payment_reference || 'CASH'}) - ₹${options.net_payable.toLocaleString('en-IN')}`
    };

    const payload = extractHashPayload({
      jeweller_id: options.jeweller_id,
      karigar_id: options.karigar_id,
      order_id: options.order_id || null,
      transaction_type: 'ADJUSTMENT',
      weight_grams: weightGrams,
      purity_karat: purityKarat,
      photo_evidence_url: null,
      perceptual_hash: null,
      gps_lat: null,
      gps_lng: null,
      initiated_by: 'JEWELLER',
      metadata
    });

    const transactionHash = calculateTransactionHash(previousHash, payload, timestamp);
    const sampleSig =
      options.signature_jeweller ||
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

    const entry: GoldLedgerEntry = {
      id,
      transaction_hash: transactionHash,
      previous_hash: previousHash,
      sequence_number: sequenceNumber,
      jeweller_id: options.jeweller_id,
      karigar_id: options.karigar_id,
      order_id: options.order_id || null,
      transaction_type: 'ADJUSTMENT',
      weight_grams: Number(weightGrams.toFixed(2)),
      purity_karat: purityKarat,
      pure_weight_grams: pureWeightGrams,
      photo_evidence_url: null,
      perceptual_hash: null,
      signature_jeweller: sampleSig,
      signature_karigar: sampleSig,
      gps_lat: null,
      gps_lng: null,
      timestamp,
      status: 'CONFIRMED',
      initiated_by: 'JEWELLER',
      confirmation_deadline: timestamp,
      confirmed_at: timestamp,
      dispute_reason: null,
      metadata,
      created_at: timestamp
    };

    if (dbManager.isPostgres) {
      await dbManager.query(
        `INSERT INTO gold_ledger (
          id, transaction_hash, previous_hash, sequence_number, jeweller_id, karigar_id, order_id,
          transaction_type, weight_grams, purity_karat, pure_weight_grams, photo_evidence_url,
          perceptual_hash, signature_jeweller, signature_karigar, gps_lat, gps_lng, timestamp,
          status, initiated_by, confirmation_deadline, confirmed_at, metadata
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23
        )`,
        [
          entry.id,
          entry.transaction_hash,
          entry.previous_hash,
          entry.sequence_number,
          entry.jeweller_id,
          entry.karigar_id,
          entry.order_id,
          entry.transaction_type,
          entry.weight_grams,
          entry.purity_karat,
          entry.pure_weight_grams,
          entry.photo_evidence_url,
          entry.perceptual_hash,
          entry.signature_jeweller,
          entry.signature_karigar,
          entry.gps_lat,
          entry.gps_lng,
          entry.timestamp,
          entry.status,
          entry.initiated_by,
          entry.confirmation_deadline,
          entry.confirmed_at,
          JSON.stringify(entry.metadata)
        ]
      );
      this.inMemoryLedger.push(entry);
    } else if (dbManager.isSqlite) {
      const db = sqliteManager.getDb();
      db.prepare(`
        INSERT INTO gold_ledger (
          id, transaction_hash, previous_hash, sequence_number, jeweller_id, karigar_id, order_id,
          transaction_type, weight_grams, purity_karat, pure_weight_grams, photo_evidence_url,
          perceptual_hash, signature_jeweller, signature_karigar, gps_lat, gps_lng, timestamp,
          status, initiated_by, confirmation_deadline, confirmed_at, dispute_reason, metadata, created_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        )
      `).run(
        entry.id,
        entry.transaction_hash,
        entry.previous_hash,
        entry.sequence_number,
        entry.jeweller_id,
        entry.karigar_id,
        entry.order_id,
        entry.transaction_type,
        entry.weight_grams,
        entry.purity_karat,
        entry.pure_weight_grams,
        entry.photo_evidence_url,
        entry.perceptual_hash,
        entry.signature_jeweller,
        entry.signature_karigar,
        entry.gps_lat,
        entry.gps_lng,
        entry.timestamp,
        entry.status,
        entry.initiated_by,
        entry.confirmation_deadline,
        entry.confirmed_at,
        entry.dispute_reason,
        JSON.stringify(entry.metadata),
        entry.created_at
      );
      this.inMemoryLedger.push(entry);
    } else {
      this.inMemoryLedger.push(entry);
      await this.saveStore();
    }

    return entry;
  }

  async getBalance(karigarId: string, user?: AuthUser): Promise<LedgerBalanceSummary> {
    // Data ownership rule: A karigar can ONLY read their own balance
    if (user && user.role === 'KARIGAR' && user.id !== karigarId) {
      throw new Error("Access denied. Karigars can only view their own gold custody balance.");
    }

    const karigar = (await this.getParties()).find((p) => p.id === karigarId);
    const karigarName = karigar ? karigar.name : 'Unknown Karigar';

    let entries: GoldLedgerEntry[] = [];
    if (dbManager.isPostgres) {
      const res = await dbManager.query<GoldLedgerEntry>(
        'SELECT * FROM gold_ledger WHERE karigar_id = $1 ORDER BY sequence_number ASC',
        [karigarId]
      );
      entries = res.rows;
    } else if (dbManager.isSqlite) {
      const db = sqliteManager.getDb();
      const rows = db.prepare('SELECT * FROM gold_ledger WHERE karigar_id = ? ORDER BY sequence_number ASC').all(karigarId);
      entries = rows.map(this.mapSqliteRow);
    } else {
      entries = this.inMemoryLedger.filter((e) => e.karigar_id === karigarId);
    }

    let totalIssued = 0;
    let totalReturned = 0;
    let totalWastage = 0;
    let netBalanceGrams = 0;
    let netPureBalanceGrams = 0;
    let pendingCount = 0;
    let pendingGrams = 0;
    let disputedCount = 0;
    let lastTs: string | null = null;

    const breakdownByKarat: LedgerBalanceSummary['breakdown_by_karat'] = {};

    for (const e of entries) {
      const karat = e.purity_karat;
      if (!breakdownByKarat[karat]) {
        breakdownByKarat[karat] = {
          issued: 0,
          returned: 0,
          wastage: 0,
          net: 0,
          pureEquivalent: 0
        };
      }

      lastTs = e.timestamp;

      if (e.status === 'PENDING_CONFIRMATION') {
        pendingCount++;
        pendingGrams += Number(e.weight_grams);
      } else if (e.status === 'DISPUTED') {
        disputedCount++;
      }

      if (e.status === 'CONFIRMED') {
        const weight = Number(e.weight_grams);
        const pure = Number(e.pure_weight_grams);

        if (e.transaction_type === 'ISSUE') {
          totalIssued += weight;
          netBalanceGrams += weight;
          netPureBalanceGrams += pure;
          breakdownByKarat[karat].issued += weight;
          breakdownByKarat[karat].net += weight;
          breakdownByKarat[karat].pureEquivalent += pure;
        } else if (e.transaction_type === 'RETURN') {
          totalReturned += weight;
          netBalanceGrams -= weight;
          netPureBalanceGrams -= pure;
          breakdownByKarat[karat].returned += weight;
          breakdownByKarat[karat].net -= weight;
          breakdownByKarat[karat].pureEquivalent -= pure;
        } else if (e.transaction_type === 'WASTAGE') {
          totalWastage += weight;
          netBalanceGrams -= weight;
          netPureBalanceGrams -= pure;
          breakdownByKarat[karat].wastage += weight;
          breakdownByKarat[karat].net -= weight;
          breakdownByKarat[karat].pureEquivalent -= pure;
        }
      }
    }

    return {
      karigar_id: karigarId,
      karigar_name: karigarName,
      total_issued_grams: Number(totalIssued.toFixed(3)),
      total_returned_grams: Number(totalReturned.toFixed(3)),
      total_wastage_grams: Number(totalWastage.toFixed(3)),
      net_balance_grams: Number(netBalanceGrams.toFixed(3)),
      net_pure_balance_grams: Number(netPureBalanceGrams.toFixed(3)),
      breakdown_by_karat: breakdownByKarat,
      pending_confirmation_count: pendingCount,
      pending_confirmation_grams: Number(pendingGrams.toFixed(3)),
      disputed_count: disputedCount,
      last_transaction_timestamp: lastTs
    };
  }

  async getHistory(filters: LedgerHistoryFilter, user?: AuthUser): Promise<PaginatedResult<GoldLedgerEntry>> {
    // DATA OWNERSHIP ENFORCEMENT:
    // A Karigar can ONLY read entries where they are the karigar.
    if (user && user.role === 'KARIGAR') {
      filters.karigar_id = user.id;
    }
    // A Jeweller can ONLY read entries where they are the jeweller.
    if (user && user.role === 'JEWELLER') {
      filters.jeweller_id = user.id;
    }

    let all: GoldLedgerEntry[] = [];
    if (dbManager.isPostgres) {
      const res = await dbManager.query<GoldLedgerEntry>('SELECT * FROM gold_ledger ORDER BY sequence_number DESC');
      all = res.rows;
    } else if (dbManager.isSqlite) {
      all = this.getAllFromSqlite().reverse();
    } else {
      all = [...this.inMemoryLedger];
    }

    let filtered = all.filter((item) => {
      if (filters.karigar_id && item.karigar_id !== filters.karigar_id) return false;
      if (filters.jeweller_id && item.jeweller_id !== filters.jeweller_id) return false;
      if (filters.order_id && item.order_id !== filters.order_id) return false;
      if (filters.transaction_type && item.transaction_type !== filters.transaction_type) return false;
      if (filters.status && item.status !== filters.status) return false;
      if (filters.from_date && new Date(item.timestamp) < new Date(filters.from_date)) return false;
      if (filters.to_date && new Date(item.timestamp) > new Date(filters.to_date)) return false;

      if (filters.search) {
        const q = filters.search.toLowerCase();
        const matchesOrder = item.order_id?.toLowerCase().includes(q);
        const matchesHash = item.transaction_hash.toLowerCase().includes(q);
        const matchesNotes = (item.metadata?.notes as string)?.toLowerCase().includes(q);
        if (!matchesOrder && !matchesHash && !matchesNotes) return false;
      }
      return true;
    });

    const sortOrder = filters.sort_order === 'ASC' ? 1 : -1;
    filtered.sort((a, b) => (a.sequence_number - b.sequence_number) * sortOrder);

    const total = filtered.length;
    const page = Math.max(1, filters.page || 1);
    const limit = Math.max(1, filters.limit || 10);
    const totalPages = Math.ceil(total / limit) || 1;
    const offset = (page - 1) * limit;
    const data = filtered.slice(offset, offset + limit);

    const totalWeight = filtered.reduce((acc, curr) => acc + Number(curr.weight_grams), 0);
    const totalPureWeight = filtered.reduce((acc, curr) => acc + Number(curr.pure_weight_grams), 0);

    return {
      data,
      pagination: {
        total,
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      },
      summary: {
        totalWeight: Number(totalWeight.toFixed(3)),
        totalPureWeight: Number(totalPureWeight.toFixed(3))
      }
    };
  }

  async getAllEntriesForVerification(): Promise<GoldLedgerEntry[]> {
    if (dbManager.isPostgres) {
      const res = await dbManager.query<GoldLedgerEntry>('SELECT * FROM gold_ledger ORDER BY sequence_number ASC');
      return res.rows;
    }
    if (dbManager.isSqlite) {
      return this.getAllFromSqlite();
    }
    return [...this.inMemoryLedger].sort((a, b) => a.sequence_number - b.sequence_number);
  }

  async escalateExpiredEntries(): Promise<GoldLedgerEntry[]> {
    const now = new Date();
    const escalated: GoldLedgerEntry[] = [];

    if (dbManager.isPostgres) {
      const res = await dbManager.query<GoldLedgerEntry>(
        `UPDATE gold_ledger
         SET status = 'ESCALATED',
             dispute_reason = COALESCE(dispute_reason || '; ', '') || 'Auto-escalated: 24-hour dual confirmation window expired.'
         WHERE status = 'PENDING_CONFIRMATION'
           AND CURRENT_TIMESTAMP > confirmation_deadline
         RETURNING *`
      );
      return res.rows;
    }

    if (dbManager.isSqlite) {
      const db = sqliteManager.getDb();
      const expiredRows = db.prepare(`
        SELECT * FROM gold_ledger
        WHERE status = 'PENDING_CONFIRMATION' AND datetime(confirmation_deadline) < datetime('now')
      `).all() as any[];

      const updateEscalated = db.prepare(`
        UPDATE gold_ledger
        SET status = 'ESCALATED',
            dispute_reason = COALESCE(dispute_reason || '; ', '') || 'Auto-escalated: 24-hour dual confirmation window expired.'
        WHERE id = ?
      `);

      for (const row of expiredRows) {
        updateEscalated.run(row.id);
        escalated.push(this.mapSqliteRow(row));
      }

      this.inMemoryLedger = this.getAllFromSqlite();
      return escalated;
    }

    for (const e of this.inMemoryLedger) {
      if (e.status === 'PENDING_CONFIRMATION' && new Date(e.confirmation_deadline) < now) {
        e.status = 'ESCALATED';
        e.dispute_reason =
          (e.dispute_reason ? e.dispute_reason + '; ' : '') + 'Auto-escalated: 24-hour dual confirmation window expired.';
        escalated.push(e);
      }
    }

    if (escalated.length > 0) {
      await this.saveStore();
    }
    return escalated;
  }

  async simulateTampering(sequenceNumber: number, tamperedWeightGrams: number): Promise<GoldLedgerEntry> {
    if (dbManager.isSqlite) {
      const db = sqliteManager.getDb();
      const row = db.prepare('SELECT * FROM gold_ledger WHERE sequence_number = ?').get(sequenceNumber) as any;
      if (!row) throw new Error(`Block #${sequenceNumber} not found`);

      const pure = Number(((tamperedWeightGrams * row.purity_karat) / 24).toFixed(4));
      db.prepare(`
        UPDATE gold_ledger
        SET weight_grams = ?, pure_weight_grams = ?
        WHERE sequence_number = ?
      `).run(tamperedWeightGrams, pure, sequenceNumber);

      this.inMemoryLedger = this.getAllFromSqlite();
      return this.mapSqliteRow(db.prepare('SELECT * FROM gold_ledger WHERE sequence_number = ?').get(sequenceNumber));
    }

    const entry = this.inMemoryLedger.find((item) => item.sequence_number === sequenceNumber);
    if (!entry) {
      throw new Error(`Block #${sequenceNumber} not found`);
    }

    entry.weight_grams = tamperedWeightGrams;
    entry.pure_weight_grams = Number(((tamperedWeightGrams * entry.purity_karat) / 24).toFixed(4));
    entry.metadata = {
      ...entry.metadata,
      notes: `[TAMPERED SIMULATION] Weight illegally modified to ${tamperedWeightGrams}g`
    };
    await this.saveStore();
    return entry;
  }

  async resetTamperedBlock(_sequenceNumber: number): Promise<void> {
    if (dbManager.isSqlite) {
      const db = sqliteManager.getDb();
      db.exec('DELETE FROM gold_ledger');
      const seedBlocks = build12SeedBlocks();
      const insertBlock = db.prepare(`
        INSERT INTO gold_ledger (
          id, transaction_hash, previous_hash, sequence_number, jeweller_id, karigar_id, order_id,
          transaction_type, weight_grams, purity_karat, pure_weight_grams, photo_evidence_url,
          perceptual_hash, signature_jeweller, signature_karigar, gps_lat, gps_lng, timestamp,
          status, initiated_by, confirmation_deadline, confirmed_at, dispute_reason, metadata, created_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        )
      `);
      for (const b of seedBlocks) {
        insertBlock.run(
          b.id,
          b.transaction_hash,
          b.previous_hash,
          b.sequence_number,
          b.jeweller_id,
          b.karigar_id,
          b.order_id,
          b.transaction_type,
          b.weight_grams,
          b.purity_karat,
          b.pure_weight_grams,
          b.photo_evidence_url,
          b.perceptual_hash,
          b.signature_jeweller,
          b.signature_karigar,
          b.gps_lat,
          b.gps_lng,
          b.timestamp,
          b.status,
          b.initiated_by,
          b.confirmation_deadline,
          b.confirmed_at,
          b.dispute_reason,
          JSON.stringify(b.metadata),
          b.created_at
        );
      }
      this.inMemoryLedger = this.getAllFromSqlite();
      return;
    }

    this.inMemoryLedger = build12SeedBlocks();
    await this.saveStore();
  }
}

export const ledgerRepository = new LedgerRepository();
