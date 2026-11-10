import crypto from 'node:crypto';
import {
  WastageBenchmark,
  WastageAgreement,
  WastageAgreementStatus,
  DesignComplexity,
  WastageVarianceDetails,
  ProposeWastageRequest,
  RespondWastageRequest,
  BenchmarkQuery,
  Role,
  User,
  KarigarReturnVariancePoint,
  CategoryBenchmarkComparison,
  KarigarWastageAnalytics
} from '../../shared/types.js';
import {
  calculateWeightedMovingAverage,
  calculateRollingWma,
  calculateSimpleAverage,
  determineTrendDirection
} from '../../shared/analytics.js';
import { dbManager } from './index.js';
import { sqliteManager } from './sqlite.js';

export const SEED_BENCHMARKS: WastageBenchmark[] = [
  {
    id: 'bm-rings-simple',
    category: 'RINGS',
    subcategory: 'Plain Band & Solitaire',
    complexity: 'SIMPLE',
    min_pct: 5.0,
    max_pct: 8.0,
    avg_pct: 6.5,
    sample_size: 450,
    description: 'Standard die-punch, plain cast rings, low filing loss'
  },
  {
    id: 'bm-necklaces-med',
    category: 'NECKLACES',
    subcategory: 'Choker & Link Necklace',
    complexity: 'MEDIUM',
    min_pct: 8.0,
    max_pct: 12.0,
    avg_pct: 10.0,
    sample_size: 320,
    description: 'Linked motifs, stone setting collets, moderate filing and polishing loss'
  },
  {
    id: 'bm-bridal-complex',
    category: 'BRIDAL_SETS',
    subcategory: 'Kundan Jadau & Polki Haar Set',
    complexity: 'COMPLEX',
    min_pct: 12.0,
    max_pct: 18.0,
    avg_pct: 15.0,
    sample_size: 210,
    description: 'Intricate floral filigree, multi-tier construction, extensive soldering and engraving'
  },
  {
    id: 'bm-temple-vcomplex',
    category: 'TEMPLE_JEWELLERY',
    subcategory: 'Nakshi & Antique Deity Ornaments',
    complexity: 'VERY_COMPLEX',
    min_pct: 15.0,
    max_pct: 22.0,
    avg_pct: 18.5,
    sample_size: 180,
    description: 'Deep relief repousse (chasing), antique oxide finish, heavy hand-chiseled detailing'
  },
  {
    id: 'bm-bangles-simple',
    category: 'BANGLES',
    subcategory: 'Plain Solid Kadas',
    complexity: 'SIMPLE',
    min_pct: 5.5,
    max_pct: 8.5,
    avg_pct: 7.0,
    sample_size: 280,
    description: 'Solid wire drawing, sizing and minimal buffing'
  },
  {
    id: 'bm-earrings-med',
    category: 'EARRINGS',
    subcategory: 'Jhumkas & Chandbalis',
    complexity: 'MEDIUM',
    min_pct: 8.5,
    max_pct: 12.5,
    avg_pct: 10.5,
    sample_size: 340,
    description: 'Hollow dome fabrication with hanging pearls/gold beads'
  }
];

export const SEED_AGREEMENTS: WastageAgreement[] = [
  {
    id: 'agr-seed-881',
    order_ref: 'ORD-2026-881',
    jeweller_id: '11111111-1111-1111-1111-111111111111',
    karigar_id: '22222222-2222-2222-2222-222222222222',
    agreed_pct: 6.5,
    design_complexity: 'SIMPLE',
    category: 'RINGS',
    status: 'ACCEPTED',
    signature_jeweller: 'data:image/png;base64,jeweller_sig_seed',
    signature_karigar: 'data:image/png;base64,karigar_sig_seed',
    proposed_at: '2026-03-01T08:00:00Z',
    responded_at: '2026-03-01T09:30:00Z',
    created_at: '2026-03-01T08:00:00Z',
    updated_at: '2026-03-01T09:30:00Z'
  },
  {
    id: 'agr-seed-882',
    order_ref: 'ORD-2026-882',
    jeweller_id: '11111111-1111-1111-1111-111111111111',
    karigar_id: '33333333-3333-3333-3333-333333333333',
    agreed_pct: 15.0,
    design_complexity: 'COMPLEX',
    category: 'BRIDAL_SETS',
    status: 'ACCEPTED',
    signature_jeweller: 'data:image/png;base64,jeweller_sig_seed',
    signature_karigar: 'data:image/png;base64,karigar_sig_seed',
    proposed_at: '2026-03-01T09:00:00Z',
    responded_at: '2026-03-01T10:15:00Z',
    created_at: '2026-03-01T09:00:00Z',
    updated_at: '2026-03-01T10:15:00Z'
  },
  {
    id: 'agr-seed-901',
    order_ref: 'ORD-2026-901',
    jeweller_id: '11111111-1111-1111-1111-111111111111',
    karigar_id: '22222222-2222-2222-2222-222222222222',
    agreed_pct: 10.0,
    design_complexity: 'MEDIUM',
    category: 'NECKLACES',
    status: 'PROPOSED',
    signature_jeweller: 'data:image/png;base64,jeweller_sig_seed',
    signature_karigar: null,
    proposed_at: '2026-03-02T11:00:00Z',
    responded_at: null,
    created_at: '2026-03-02T11:00:00Z',
    updated_at: '2026-03-02T11:00:00Z'
  }
];

export class WastageRepository {
  private inMemoryBenchmarks: WastageBenchmark[] = [...SEED_BENCHMARKS];
  private inMemoryAgreements: WastageAgreement[] = [...SEED_AGREEMENTS];

  async init(): Promise<void> {
    if (dbManager.isSqlite) {
      this.syncSqliteSeeds();
    }
  }

  private syncSqliteSeeds(): void {
    try {
      const db = sqliteManager.getDb();
      const countB = (db.prepare('SELECT count(*) as c FROM wastage_benchmarks').get() as any)?.c || 0;
      if (countB === 0) {
        const stmt = db.prepare(`
          INSERT INTO wastage_benchmarks (id, category, subcategory, complexity, min_pct, max_pct, avg_pct, sample_size, description)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const b of SEED_BENCHMARKS) {
          stmt.run(b.id, b.category, b.subcategory || null, b.complexity, b.min_pct, b.max_pct, b.avg_pct, b.sample_size, b.description || null);
        }
      }

      const countA = (db.prepare('SELECT count(*) as c FROM wastage_agreements').get() as any)?.c || 0;
      if (countA === 0) {
        const stmtA = db.prepare(`
          INSERT INTO wastage_agreements (id, order_ref, jeweller_id, karigar_id, agreed_pct, design_complexity, category, status, signature_jeweller, signature_karigar, proposed_at, responded_at, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const a of SEED_AGREEMENTS) {
          stmtA.run(
            a.id, a.order_ref, a.jeweller_id, a.karigar_id, a.agreed_pct, a.design_complexity,
            a.category || null, a.status, a.signature_jeweller, a.signature_karigar,
            a.proposed_at, a.responded_at || null, a.created_at, a.updated_at
          );
        }
      }
    } catch (err) {
      console.warn('[WastageRepo] SQLite seed sync skipped/error:', err);
    }
  }

  /**
   * Retrieves benchmarks with optional category and complexity filtering
   */
  async getBenchmarks(query?: BenchmarkQuery): Promise<WastageBenchmark[]> {
    if (dbManager.isSqlite) {
      try {
        const db = sqliteManager.getDb();
        let sql = 'SELECT * FROM wastage_benchmarks WHERE 1=1';
        const params: any[] = [];

        if (query?.category) {
          sql += ' AND UPPER(category) = UPPER(?)';
          params.push(query.category);
        }
        if (query?.complexity) {
          sql += ' AND UPPER(complexity) = UPPER(?)';
          params.push(query.complexity);
        }

        const rows = db.prepare(sql).all(...params) as any[];
        if (rows.length > 0) return rows as WastageBenchmark[];
      } catch (err) {
        console.warn('[WastageRepo] SQLite getBenchmarks error:', err);
      }
    }

    // In-memory filter
    return this.inMemoryBenchmarks.filter((b) => {
      if (query?.category && b.category.toUpperCase() !== query.category.toUpperCase()) {
        return false;
      }
      if (query?.complexity && b.complexity.toUpperCase() !== query.complexity.toUpperCase()) {
        return false;
      }
      return true;
    });
  }

  /**
   * Returns range with smart suggestion based on category & complexity
   */
  async getBenchmarkSuggestion(category?: string, complexity?: DesignComplexity): Promise<{
    category: string;
    complexity: DesignComplexity;
    min_pct: number;
    max_pct: number;
    avg_pct: number;
    suggested_pct: number;
    sample_size: number;
    description: string;
  }> {
    const list = await this.getBenchmarks({ category, complexity });
    if (list.length > 0) {
      const match = list[0];
      return {
        category: match.category,
        complexity: match.complexity,
        min_pct: match.min_pct,
        max_pct: match.max_pct,
        avg_pct: match.avg_pct,
        suggested_pct: match.avg_pct,
        sample_size: match.sample_size,
        description: match.description || `${match.category} with ${match.complexity} work`
      };
    }

    // Fallback defaults if unspecified
    const comp = complexity || 'MEDIUM';
    const defaults: Record<DesignComplexity, { min: number; max: number; avg: number }> = {
      SIMPLE: { min: 5.0, max: 8.0, avg: 6.5 },
      MEDIUM: { min: 8.0, max: 12.0, avg: 10.0 },
      COMPLEX: { min: 12.0, max: 18.0, avg: 15.0 },
      VERY_COMPLEX: { min: 15.0, max: 22.0, avg: 18.5 }
    };

    const d = defaults[comp] || defaults.MEDIUM;
    return {
      category: category || 'GENERAL',
      complexity: comp,
      min_pct: d.min,
      max_pct: d.max,
      avg_pct: d.avg,
      suggested_pct: d.avg,
      sample_size: 150,
      description: `Standard benchmark for ${category || 'jewellery'} at ${comp} craftsmanship level`
    };
  }

  /**
   * Retrieves agreement by order reference
   */
  async getAgreementByOrderRef(orderRef: string): Promise<WastageAgreement | null> {
    if (!orderRef) return null;

    if (dbManager.isSqlite) {
      try {
        const db = sqliteManager.getDb();
        const row = db.prepare('SELECT * FROM wastage_agreements WHERE UPPER(order_ref) = UPPER(?)').get(orderRef) as any;
        if (row) return row as WastageAgreement;
      } catch (err) {
        console.warn('[WastageRepo] SQLite getAgreementByOrderRef error:', err);
      }
    }

    const found = this.inMemoryAgreements.find((a) => a.order_ref.toUpperCase() === orderRef.toUpperCase());
    return found || null;
  }

  /**
   * Retrieves all agreements with role-based ownership filtering
   */
  async getAgreements(user?: User): Promise<WastageAgreement[]> {
    if (dbManager.isSqlite) {
      try {
        const db = sqliteManager.getDb();
        let sql = 'SELECT * FROM wastage_agreements';
        const params: any[] = [];

        if (user?.role === 'KARIGAR') {
          sql += ' WHERE karigar_id = ?';
          params.push(user.id);
        } else if (user?.role === 'JEWELLER') {
          sql += ' WHERE jeweller_id = ?';
          params.push(user.id);
        }

        sql += ' ORDER BY created_at DESC';
        return db.prepare(sql).all(...params) as WastageAgreement[];
      } catch (err) {
        console.warn('[WastageRepo] SQLite getAgreements error:', err);
      }
    }

    if (user?.role === 'KARIGAR') {
      return this.inMemoryAgreements.filter((a) => a.karigar_id === user.id);
    }
    if (user?.role === 'JEWELLER') {
      return this.inMemoryAgreements.filter((a) => a.jeweller_id === user.id);
    }
    return this.inMemoryAgreements;
  }

  /**
   * Jeweller proposes a wastage rate for an order
   */
  async proposeAgreement(req: ProposeWastageRequest, jewellerUser: User): Promise<WastageAgreement> {
    if (jewellerUser.role !== 'JEWELLER') {
      throw new Error('Only registered jewellers can propose wastage agreements');
    }

    if (!req.order_ref || req.order_ref.trim().length === 0) {
      throw new Error('Valid order reference is required');
    }

    if (!req.karigar_id) {
      throw new Error('Assigned karigar ID is required');
    }

    if (!req.agreed_pct || req.agreed_pct <= 0 || req.agreed_pct > 50) {
      throw new Error('Agreed wastage percentage must be between 0.1% and 50%');
    }

    const existing = await this.getAgreementByOrderRef(req.order_ref);
    if (existing && existing.status === 'ACCEPTED') {
      throw new Error(`Agreement for order ${req.order_ref} is already ACCEPTED and locked.`);
    }

    const now = new Date().toISOString();
    const id = existing ? existing.id : 'agr-' + crypto.randomUUID().slice(0, 8);
    const signature = req.signature_jeweller || 'data:image/png;base64,jeweller_sig_' + jewellerUser.id.slice(0, 8);

    const agreement: WastageAgreement = {
      id,
      order_ref: req.order_ref.trim(),
      jeweller_id: jewellerUser.id,
      karigar_id: req.karigar_id,
      agreed_pct: Number(req.agreed_pct.toFixed(2)),
      design_complexity: req.design_complexity || 'MEDIUM',
      category: req.category || 'JEWELLERY',
      status: 'PROPOSED',
      signature_jeweller: signature,
      signature_karigar: null,
      proposed_at: now,
      responded_at: null,
      rejection_reason: null,
      created_at: existing ? existing.created_at : now,
      updated_at: now
    };

    if (dbManager.isSqlite) {
      try {
        const db = sqliteManager.getDb();
        db.prepare(`
          INSERT INTO wastage_agreements (
            id, order_ref, jeweller_id, karigar_id, agreed_pct, design_complexity, category,
            status, signature_jeweller, signature_karigar, proposed_at, responded_at, rejection_reason,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(order_ref) DO UPDATE SET
            agreed_pct = excluded.agreed_pct,
            design_complexity = excluded.design_complexity,
            category = excluded.category,
            status = 'PROPOSED',
            signature_jeweller = excluded.signature_jeweller,
            signature_karigar = NULL,
            proposed_at = excluded.proposed_at,
            responded_at = NULL,
            rejection_reason = NULL,
            updated_at = excluded.updated_at
        `).run(
          agreement.id, agreement.order_ref, agreement.jeweller_id, agreement.karigar_id,
          agreement.agreed_pct, agreement.design_complexity, agreement.category,
          agreement.status, agreement.signature_jeweller, agreement.signature_karigar,
          agreement.proposed_at, agreement.responded_at, agreement.rejection_reason,
          agreement.created_at, agreement.updated_at
        );
      } catch (err) {
        console.warn('[WastageRepo] SQLite proposeAgreement error:', err);
      }
    }

    // In-memory update
    const idx = this.inMemoryAgreements.findIndex((a) => a.order_ref.toUpperCase() === agreement.order_ref.toUpperCase());
    if (idx >= 0) {
      this.inMemoryAgreements[idx] = agreement;
    } else {
      this.inMemoryAgreements.unshift(agreement);
    }

    return agreement;
  }

  /**
   * Karigar responds (Accepts or Rejects) to a proposed wastage agreement
   */
  async respondAgreement(req: RespondWastageRequest, karigarUser: User): Promise<WastageAgreement> {
    if (karigarUser.role !== 'KARIGAR') {
      throw new Error('Only the assigned artisan (karigar) can respond to a wastage proposal');
    }

    // Lookup agreement
    let agreement: WastageAgreement | undefined;
    if (dbManager.isSqlite) {
      try {
        const db = sqliteManager.getDb();
        const row = db.prepare('SELECT * FROM wastage_agreements WHERE id = ?').get(req.agreement_id) as any;
        if (row) agreement = row as WastageAgreement;
      } catch (err) {
        console.warn('[WastageRepo] SQLite respondAgreement lookup error:', err);
      }
    }

    if (!agreement) {
      agreement = this.inMemoryAgreements.find((a) => a.id === req.agreement_id);
    }

    if (!agreement) {
      throw new Error(`Wastage agreement ${req.agreement_id} not found`);
    }

    // Ownership check: karigar must be the counterparty!
    if (agreement.karigar_id !== karigarUser.id) {
      throw new Error('Access denied. You can only respond to wastage proposals addressed to your account.');
    }

    if (agreement.status !== 'PROPOSED') {
      throw new Error(`Agreement is already in ${agreement.status} status and cannot be re-evaluated.`);
    }

    const now = new Date().toISOString();
    const isAccept = req.action === 'ACCEPT';
    const signature = isAccept
      ? req.signature_karigar || 'data:image/png;base64,karigar_sig_' + karigarUser.id.slice(0, 8)
      : null;

    agreement.status = isAccept ? 'ACCEPTED' : 'REJECTED';
    agreement.signature_karigar = signature;
    agreement.responded_at = now;
    agreement.rejection_reason = !isAccept ? req.rejection_reason || 'Rejected by artisan' : null;
    agreement.updated_at = now;

    if (dbManager.isSqlite) {
      try {
        const db = sqliteManager.getDb();
        db.prepare(`
          UPDATE wastage_agreements SET
            status = ?,
            signature_karigar = ?,
            responded_at = ?,
            rejection_reason = ?,
            updated_at = ?
          WHERE id = ?
        `).run(
          agreement.status,
          agreement.signature_karigar,
          agreement.responded_at,
          agreement.rejection_reason,
          agreement.updated_at,
          agreement.id
        );
      } catch (err) {
        console.warn('[WastageRepo] SQLite respondAgreement update error:', err);
      }
    }

    const idx = this.inMemoryAgreements.findIndex((a) => a.id === agreement!.id);
    if (idx >= 0) {
      this.inMemoryAgreements[idx] = agreement;
    }

    return agreement;
  }

  /**
   * Computes actual wastage vs agreed percentage and determines if REVIEW_REQUIRED flag applies
   */
  calculateVariance(issuedGrams: number, returnedGrams: number, agreedPct: number): WastageVarianceDetails {
    const issued = Math.max(0, issuedGrams);
    const returned = Math.max(0, returnedGrams);
    const actualWastageGrams = Math.max(0, issued - returned);
    const actualWastagePct = issued > 0 ? (actualWastageGrams / issued) * 100 : 0;
    const allowedWastageGrams = (issued * agreedPct) / 100;
    const varianceGrams = actualWastageGrams - allowedWastageGrams;
    const variancePct = actualWastagePct - agreedPct;
    const toleranceThresholdPct = agreedPct + 2.0; // agreed + 2%
    const exceedsTolerance = actualWastagePct > toleranceThresholdPct;

    return {
      issued_grams: Number(issued.toFixed(3)),
      returned_grams: Number(returned.toFixed(3)),
      actual_wastage_grams: Number(actualWastageGrams.toFixed(3)),
      actual_wastage_pct: Number(actualWastagePct.toFixed(2)),
      agreed_wastage_pct: Number(agreedPct.toFixed(2)),
      allowed_wastage_grams: Number(allowedWastageGrams.toFixed(3)),
      variance_grams: Number(varianceGrams.toFixed(3)),
      variance_pct: Number(variancePct.toFixed(2)),
      tolerance_threshold_pct: Number(toleranceThresholdPct.toFixed(2)),
      exceeds_tolerance: exceedsTolerance,
      review_required: exceedsTolerance
    };
  }

  /**
   * Retrieves comprehensive wastage analytics for a specific artisan (Karigar),
   * calculating Weighted Moving Average (WMA), variance trend over the last N returns,
   * and comparison against industry benchmarks by design category.
   */
  async getKarigarWastageAnalytics(karigarId: string, limit = 10): Promise<KarigarWastageAnalytics> {
    // 1. Get Karigar info
    let karigarName = 'Artisan';
    let businessName: string | undefined;
    let phone: string | undefined;

    if (dbManager.isSqlite) {
      try {
        const db = sqliteManager.getDb();
        const p = db
          .prepare('SELECT id, full_name, business_name, phone FROM platform_parties WHERE id = ?')
          .get(karigarId) as any;
        if (p) {
          karigarName = p.full_name;
          businessName = p.business_name;
          phone = p.phone;
        }
      } catch (err) {
        console.warn('[WastageRepo] party lookup error:', err);
      }
    }

    // 2. Query all ledger entries
    let allEntries: any[] = [];
    if (dbManager.isSqlite) {
      try {
        const db = sqliteManager.getDb();
        allEntries = db.prepare('SELECT * FROM gold_ledger ORDER BY sequence_number ASC').all() as any[];
      } catch (err) {
        console.warn('[WastageRepo] ledger lookup error:', err);
      }
    }

    // Parse metadata
    allEntries = allEntries.map((e) => ({
      ...e,
      metadata: typeof e.metadata === 'string' ? JSON.parse(e.metadata || '{}') : e.metadata || {}
    }));

    // Filter RETURN entries for this karigar
    const karigarReturns = allEntries.filter(
      (e) => e.transaction_type === 'RETURN' && e.karigar_id === karigarId
    );

    // Fetch benchmarks for comparison
    const benchmarks = await this.getBenchmarks();

    // Map each return to KarigarReturnVariancePoint
    const points: KarigarReturnVariancePoint[] = [];

    for (const ret of karigarReturns) {
      const orderRef =
        ret.order_id ||
        ret.metadata?.order_ref ||
        ret.metadata?.orderNumber ||
        `ORD-${ret.sequence_number}`;

      // Determine issued grams
      let issuedGrams = 0;
      if (ret.metadata?.issued_grams || ret.metadata?.issuedGrams) {
        issuedGrams = Number(ret.metadata?.issued_grams || ret.metadata?.issuedGrams);
      } else {
        const issueBlocks = allEntries.filter(
          (e) => e.transaction_type === 'ISSUE' && (e.order_id === orderRef || e.metadata?.orderNumber === orderRef)
        );
        if (issueBlocks.length > 0) {
          issuedGrams = issueBlocks.reduce((acc, b) => acc + Number(b.weight_grams), 0);
        }
      }

      if (!issuedGrams || issuedGrams <= 0) {
        const wastageMeta = Number(ret.metadata?.wastageGrams || 0);
        const scrapMeta = Number(ret.metadata?.scrapGrams || 0);
        if (wastageMeta > 0 || scrapMeta > 0) {
          issuedGrams = Number(ret.weight_grams) + wastageMeta + scrapMeta;
        } else {
          // Fallback based on 7% standard expected wastage
          issuedGrams = Number((Number(ret.weight_grams) * 1.07).toFixed(2));
        }
      }

      const returnedGrams = Number(Number(ret.weight_grams).toFixed(3));
      const actualWastageGrams = Math.max(0, Number((issuedGrams - returnedGrams).toFixed(3)));
      const actualWastagePct =
        issuedGrams > 0 ? Number(((actualWastageGrams / issuedGrams) * 100).toFixed(2)) : 0;

      // Find agreement
      let agreement = await this.getAgreementByOrderRef(orderRef);
      let agreedWastagePct = agreement?.agreed_pct;
      if (
        agreedWastagePct === undefined &&
        (ret.metadata?.agreedWastagePct || ret.metadata?.agreed_wastage_pct)
      ) {
        agreedWastagePct = Number(ret.metadata?.agreedWastagePct || ret.metadata?.agreed_wastage_pct);
      }
      if (agreedWastagePct === undefined) {
        agreedWastagePct = 7.5; // standard fallback benchmark
      }

      // Determine category and complexity
      let category = agreement?.category || ret.metadata?.category;
      if (!category) {
        const desc = (
          (ret.metadata?.itemDescription || ret.metadata?.notes || '') as string
        ).toUpperCase();
        if (desc.includes('RING') || desc.includes('BAND')) category = 'RINGS';
        else if (desc.includes('NECKLACE') || desc.includes('CHOKER') || desc.includes('HAAR'))
          category = 'NECKLACES';
        else if (desc.includes('BRIDAL') || desc.includes('KUNDAN') || desc.includes('JADAU'))
          category = 'BRIDAL_SETS';
        else if (desc.includes('TEMPLE') || desc.includes('NAKSHI') || desc.includes('ANTIQUE'))
          category = 'TEMPLE_JEWELLERY';
        else if (desc.includes('BANGLE') || desc.includes('KADA')) category = 'BANGLES';
        else if (desc.includes('EARRING') || desc.includes('JHUMKA')) category = 'EARRINGS';
        else category = 'NECKLACES';
      }

      const complexity: DesignComplexity =
        agreement?.design_complexity || ret.metadata?.complexity || 'MEDIUM';

      const allowedWastageGrams = Number(((issuedGrams * agreedWastagePct) / 100).toFixed(3));
      const varianceGrams = Number((actualWastageGrams - allowedWastageGrams).toFixed(3));
      const variancePct = Number((actualWastagePct - agreedWastagePct).toFixed(2));
      const reviewRequired = actualWastagePct > agreedWastagePct + 2.0;

      points.push({
        id: ret.id,
        orderRef,
        timestamp: ret.timestamp,
        category,
        complexity,
        issuedGrams: Number(issuedGrams.toFixed(2)),
        returnedGrams,
        actualWastageGrams,
        actualWastagePct,
        agreedWastagePct: Number(agreedWastagePct.toFixed(2)),
        allowedWastageGrams,
        varianceGrams,
        variancePct,
        rollingWmaPct: 0,
        status: ret.status,
        reviewRequired
      });
    }

    // Sort chronologically (oldest to newest)
    points.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    // Calculate rolling WMA at each step
    const wastageSeries = points.map((p) => p.actualWastagePct);
    const rollingWmas = calculateRollingWma(wastageSeries, 5);
    for (let i = 0; i < points.length; i++) {
      points[i].rollingWmaPct = rollingWmas[i];
    }

    const totalReturnsCount = points.length;
    const overallRollingWma = calculateWeightedMovingAverage(wastageSeries);
    const overallSma = calculateSimpleAverage(wastageSeries);

    const averageAgreedPct =
      points.length > 0
        ? Number(
            (points.reduce((acc, p) => acc + p.agreedWastagePct, 0) / points.length).toFixed(2)
          )
        : 0;

    const netVarianceGrams =
      points.length > 0
        ? Number(points.reduce((acc, p) => acc + p.varianceGrams, 0).toFixed(3))
        : 0;

    const averageVariancePct =
      points.length > 0
        ? Number((points.reduce((acc, p) => acc + p.variancePct, 0) / points.length).toFixed(2))
        : 0;

    const variances = points.map((p) => p.variancePct);
    const trendDirection = determineTrendDirection(variances);

    // Limit to last N returns for trend view
    const n = Math.max(1, limit);
    const lastNPoints = points.slice(-n);

    // Category benchmark comparisons
    const categoryGroups = new Map<string, KarigarReturnVariancePoint[]>();
    for (const p of points) {
      const list = categoryGroups.get(p.category) || [];
      list.push(p);
      categoryGroups.set(p.category, list);
    }

    const categoryLabels: Record<string, string> = {
      RINGS: 'Rings (अंगूठियां)',
      NECKLACES: 'Necklaces (हार / चोकर)',
      BRIDAL_SETS: 'Bridal Sets (दुल्हन सेट)',
      TEMPLE_JEWELLERY: 'Temple Nakshi (मंदिर आभूषण)',
      BANGLES: 'Bangles & Kadas (कड़े / चूड़ियां)',
      EARRINGS: 'Earrings (झुमके)'
    };

    const categoryComparisons: CategoryBenchmarkComparison[] = [];
    const categoriesToEvaluate =
      categoryGroups.size > 0
        ? Array.from(categoryGroups.keys())
        : ['RINGS', 'NECKLACES', 'BRIDAL_SETS', 'TEMPLE_JEWELLERY'];

    for (const cat of categoriesToEvaluate) {
      const catPoints = categoryGroups.get(cat) || [];
      const catValues = catPoints.map((p) => p.actualWastagePct);
      const catAvg = calculateSimpleAverage(catValues);
      const catWma = calculateWeightedMovingAverage(catValues);

      const benchmark =
        benchmarks.find((b) => b.category.toUpperCase() === cat.toUpperCase()) || {
          min_pct: 6.0,
          max_pct: 10.0,
          avg_pct: 8.0
        };

      const deltaVsBenchmarkAvg = Number(
        (catWma > 0 ? catWma - benchmark.avg_pct : 0).toFixed(2)
      );

      let rating: 'EXCELLENT' | 'STANDARD' | 'HIGH_WASTAGE' = 'STANDARD';
      if (catPoints.length === 0) {
        rating = 'STANDARD';
      } else if (catWma <= benchmark.min_pct + 0.5) {
        rating = 'EXCELLENT';
      } else if (catWma <= benchmark.max_pct) {
        rating = 'STANDARD';
      } else {
        rating = 'HIGH_WASTAGE';
      }

      categoryComparisons.push({
        category: cat,
        categoryLabel: categoryLabels[cat] || cat,
        sampleCount: catPoints.length,
        karigarAvgPct: Number(catAvg.toFixed(2)),
        karigarWmaPct: Number(catWma.toFixed(2)),
        benchmarkMinPct: benchmark.min_pct,
        benchmarkMaxPct: benchmark.max_pct,
        benchmarkAvgPct: benchmark.avg_pct,
        performanceRating: rating,
        deltaVsBenchmarkAvg
      });
    }

    // Best and worst returns by variancePct
    let bestReturn: KarigarReturnVariancePoint | undefined;
    let worstReturn: KarigarReturnVariancePoint | undefined;

    if (points.length > 0) {
      const sortedByVariance = [...points].sort((a, b) => a.variancePct - b.variancePct);
      bestReturn = sortedByVariance[0];
      worstReturn = sortedByVariance[sortedByVariance.length - 1];
    }

    return {
      karigarId,
      karigarName,
      businessName,
      phone,
      totalReturnsCount,
      analyzedReturnsCount: lastNPoints.length,
      rollingAverageWastagePct: Number(overallRollingWma.toFixed(2)),
      simpleAverageWastagePct: Number(overallSma.toFixed(2)),
      averageAgreedPct,
      netVarianceGrams,
      averageVariancePct,
      varianceTrendDirection: trendDirection,
      varianceTrend: lastNPoints,
      categoryComparisons,
      bestReturn,
      worstReturn
    };
  }
}

export const wastageRepository = new WastageRepository();

