import crypto from 'node:crypto';
import QRCode from 'qrcode';
import {
  KarigarTrustScore,
  KarigarRawMetrics,
  PublicArtisanPassport,
  User,
  Party
} from '../../shared/types.js';
import {
  calculateKarigarTrustScore,
  TRUST_CALCULATION_VERSION,
  DEFAULT_FACTOR_BENCHMARKS
} from '../../shared/trustScoring.js';
import { dbManager } from './index.js';
import { sqliteManager } from './sqlite.js';
import { SEED_PARTIES } from './ledgerRepository.js';

export class TrustScoreRepository {
  private inMemoryScores: Map<string, KarigarTrustScore> = new Map();

  constructor() {
    this.ensureInitialized();
  }

  private ensureInitialized(): void {
    if (dbManager.isSqlite) {
      const db = sqliteManager.getDb();
      const count = db.prepare('SELECT count(*) as cnt FROM trust_scores').get() as any;
      if (!count || count.cnt === 0) {
        this.recalculateAllSync();
      }
    }
  }

  /**
   * Aggregates real workshop data for a Karigar from orders, milestones, ledger blocks, and settlements.
   */
  gatherKarigarRawMetrics(karigarId: string): KarigarRawMetrics {
    if (dbManager.isSqlite) {
      const db = sqliteManager.getDb();

      // 1. Orders and On-Time Metrics
      const orderRows = db.prepare(`
        SELECT id, occasion_date, status
        FROM orders
        WHERE karigar_id = ?
      `).all(karigarId) as any[];

      const totalOrders = orderRows.length;
      let onTimeOrders = 0;
      let delayedOrders = 0;

      for (const ord of orderRows) {
        if (ord.status === 'DELAYED') {
          delayedOrders++;
        } else if (ord.status === 'DELIVERED') {
          // Check final milestone completion date
          const finalMs = db.prepare(`
            SELECT planned_date, actual_date, status
            FROM milestones
            WHERE order_id = ? AND sequence = (SELECT MAX(sequence) FROM milestones WHERE order_id = ?)
          `).get(ord.id, ord.id) as any;

          if (!finalMs || !finalMs.actual_date || finalMs.actual_date <= ord.occasion_date) {
            onTimeOrders++;
          } else {
            delayedOrders++;
          }
        } else {
          // In progress or active orders without delays
          const hasDelay = db.prepare(`
            SELECT count(*) as cnt FROM milestones WHERE order_id = ? AND status = 'DELAYED'
          `).get(ord.id) as any;
          if (hasDelay && hasDelay.cnt > 0) {
            delayedOrders++;
          } else {
            onTimeOrders++;
          }
        }
      }

      // 2. Returns and Wastage Adherence Metrics
      const returnRows = db.prepare(`
        SELECT weight_grams, status, metadata
        FROM gold_ledger
        WHERE karigar_id = ? AND transaction_type = 'RETURN'
      `).all(karigarId) as any[];

      const totalReturns = returnRows.length;
      let withinToleranceReturns = 0;
      let totalExcessPct = 0;

      for (const ret of returnRows) {
        let meta: any = {};
        try {
          meta = typeof ret.metadata === 'string' ? JSON.parse(ret.metadata) : (ret.metadata || {});
        } catch {
          meta = {};
        }

        const isExceeded = ret.status === 'REVIEW_REQUIRED' || meta.exceedsAllowedWastage === true;
        if (!isExceeded) {
          withinToleranceReturns++;
        } else {
          const agreed = Number(meta.agreedWastagePct || 8);
          const actual = Number(meta.actualWastagePct || 11);
          const excess = Math.max(0, actual - (agreed + 2));
          totalExcessPct += excess;
        }
      }

      const avgExcessWastagePct = totalReturns > 0 ? Number((totalExcessPct / totalReturns).toFixed(2)) : 0;

      // 3. Quality Acceptance Metrics (QC Milestones + Undisputed returns)
      const qcRows = db.prepare(`
        SELECT m.status, m.notes
        FROM milestones m
        JOIN orders o ON o.id = m.order_id
        WHERE o.karigar_id = ? AND (m.name LIKE '%QC%' OR m.name LIKE '%Quality%' OR m.name LIKE '%Hallmark%')
      `).all(karigarId) as any[];

      const totalQcReviews = qcRows.length;
      let passedQcReviews = 0;
      for (const qc of qcRows) {
        if (qc.status === 'COMPLETED') {
          passedQcReviews++;
        }
      }

      // 4. Dispute Frequency Metrics (Ledger entries + Settlements)
      const ledgerRows = db.prepare(`
        SELECT status
        FROM gold_ledger
        WHERE karigar_id = ?
      `).all(karigarId) as any[];

      const settlementRows = db.prepare(`
        SELECT status
        FROM settlements
        WHERE karigar_id = ?
      `).all(karigarId) as any[];

      const totalTransactions = ledgerRows.length + settlementRows.length;
      let disputedTransactions = 0;

      for (const l of ledgerRows) {
        if (l.status === 'DISPUTED' || l.status === 'ESCALATED') {
          disputedTransactions++;
        }
      }
      for (const s of settlementRows) {
        if (s.status === 'DISPUTED') {
          disputedTransactions++;
        }
      }

      // 5. Communication Responsiveness Metrics (Confirmation turnaround hours)
      const confirmedRows = db.prepare(`
        SELECT timestamp, confirmed_at, status
        FROM gold_ledger
        WHERE karigar_id = ? AND confirmed_at IS NOT NULL
      `).all(karigarId) as any[];

      const totalConfirmations = confirmedRows.length;
      let totalResponseHours = 0;

      for (const c of confirmedRows) {
        if (c.status === 'ESCALATED') {
          totalResponseHours += 24.0;
        } else {
          const created = new Date(c.timestamp).getTime();
          const confirmed = new Date(c.confirmed_at).getTime();
          const diffHours = Math.max(0.1, (confirmed - created) / (1000 * 60 * 60));
          totalResponseHours += Math.min(24.0, diffHours);
        }
      }

      const avgResponseHours = totalConfirmations > 0
        ? Number((totalResponseHours / totalConfirmations).toFixed(1))
        : 4.0; // default benchmark ~4h

      return {
        totalOrders,
        onTimeOrders,
        delayedOrders,
        totalReturns,
        withinToleranceReturns,
        avgExcessWastagePct,
        totalQcReviews,
        passedQcReviews,
        totalTransactions,
        disputedTransactions,
        totalConfirmations,
        avgResponseHours
      };
    }

    // Default cold start metrics for memory/fallback
    return {
      totalOrders: 0,
      onTimeOrders: 0,
      delayedOrders: 0,
      totalReturns: 0,
      withinToleranceReturns: 0,
      avgExcessWastagePct: 0,
      totalQcReviews: 0,
      passedQcReviews: 0,
      totalTransactions: 0,
      disputedTransactions: 0,
      totalConfirmations: 0,
      avgResponseHours: 4.0
    };
  }

  /**
   * Recalculates and persists trust score for a single Karigar.
   */
  async recalculateForKarigar(karigarId: string): Promise<KarigarTrustScore> {
    const metrics = this.gatherKarigarRawMetrics(karigarId);
    const calc = calculateKarigarTrustScore(metrics);

    const karigarParty = SEED_PARTIES.find((p) => p.id === karigarId);
    const now = new Date().toISOString();
    const id = `trust-${karigarId}`;

    let isPublic = true;

    if (dbManager.isSqlite) {
      const db = sqliteManager.getDb();
      const existing = db.prepare('SELECT is_public, created_at FROM trust_scores WHERE karigar_id = ?').get(karigarId) as any;
      if (existing) {
        isPublic = existing.is_public === 1;
      }

      db.prepare(`
        INSERT INTO trust_scores (
          id, karigar_id, composite_score, on_time_delivery, wastage_adherence,
          quality_acceptance, dispute_frequency, communication_responsiveness,
          sample_sizes, factors_json, total_orders, calculation_version, is_public,
          updated_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(karigar_id) DO UPDATE SET
          composite_score = excluded.composite_score,
          on_time_delivery = excluded.on_time_delivery,
          wastage_adherence = excluded.wastage_adherence,
          quality_acceptance = excluded.quality_acceptance,
          dispute_frequency = excluded.dispute_frequency,
          communication_responsiveness = excluded.communication_responsiveness,
          sample_sizes = excluded.sample_sizes,
          factors_json = excluded.factors_json,
          total_orders = excluded.total_orders,
          calculation_version = excluded.calculation_version,
          updated_at = excluded.updated_at
      `).run(
        id,
        karigarId,
        calc.composite_score,
        calc.factors.on_time_delivery.bayesian_score,
        calc.factors.wastage_adherence.bayesian_score,
        calc.factors.quality_acceptance.bayesian_score,
        calc.factors.dispute_frequency.bayesian_score,
        calc.factors.communication_responsiveness.bayesian_score,
        JSON.stringify({
          orders: metrics.totalOrders,
          returns: metrics.totalReturns,
          qc: metrics.totalQcReviews,
          transactions: metrics.totalTransactions,
          confirmations: metrics.totalConfirmations
        }),
        JSON.stringify(calc.factors),
        calc.total_orders,
        calc.calculation_version,
        isPublic ? 1 : 0,
        now,
        existing?.created_at || now
      );
    }

    const fullScore: KarigarTrustScore = {
      id,
      karigar_id: karigarId,
      karigar_name: karigarParty?.name || 'Artisan Goldsmith',
      business_name: karigarParty?.businessName || 'Master Bench',
      avatar_url: karigarParty?.avatarUrl,
      composite_score: calc.composite_score,
      total_orders: calc.total_orders,
      factors: calc.factors,
      calculation_version: calc.calculation_version,
      is_cold_start: calc.is_cold_start,
      is_public: isPublic,
      updated_at: now,
      created_at: now
    };

    this.inMemoryScores.set(karigarId, fullScore);
    return fullScore;
  }

  /**
   * Synchronous recalculation for bootstrap
   */
  private recalculateAllSync(): void {
    const karigars = SEED_PARTIES.filter((p) => p.role === 'KARIGAR');
    for (const k of karigars) {
      const metrics = this.gatherKarigarRawMetrics(k.id);
      const calc = calculateKarigarTrustScore(metrics);
      const now = new Date().toISOString();
      const id = `trust-${k.id}`;

      if (dbManager.isSqlite) {
        const db = sqliteManager.getDb();
        db.prepare(`
          INSERT INTO trust_scores (
            id, karigar_id, composite_score, on_time_delivery, wastage_adherence,
            quality_acceptance, dispute_frequency, communication_responsiveness,
            sample_sizes, factors_json, total_orders, calculation_version, is_public,
            updated_at, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
          ON CONFLICT(karigar_id) DO UPDATE SET
            composite_score = excluded.composite_score,
            on_time_delivery = excluded.on_time_delivery,
            wastage_adherence = excluded.wastage_adherence,
            quality_acceptance = excluded.quality_acceptance,
            dispute_frequency = excluded.dispute_frequency,
            communication_responsiveness = excluded.communication_responsiveness,
            sample_sizes = excluded.sample_sizes,
            factors_json = excluded.factors_json,
            total_orders = excluded.total_orders,
            updated_at = excluded.updated_at
        `).run(
          id,
          k.id,
          calc.composite_score,
          calc.factors.on_time_delivery.bayesian_score,
          calc.factors.wastage_adherence.bayesian_score,
          calc.factors.quality_acceptance.bayesian_score,
          calc.factors.dispute_frequency.bayesian_score,
          calc.factors.communication_responsiveness.bayesian_score,
          JSON.stringify({
            orders: metrics.totalOrders,
            returns: metrics.totalReturns,
            qc: metrics.totalQcReviews,
            transactions: metrics.totalTransactions,
            confirmations: metrics.totalConfirmations
          }),
          JSON.stringify(calc.factors),
          calc.total_orders,
          calc.calculation_version,
          now,
          now
        );
      }
    }
  }

  /**
   * Recalculates trust scores for all registered Karigars
   */
  async recalculateAll(): Promise<KarigarTrustScore[]> {
    const karigars = SEED_PARTIES.filter((p) => p.role === 'KARIGAR');
    const results: KarigarTrustScore[] = [];

    for (const k of karigars) {
      const score = await this.recalculateForKarigar(k.id);
      results.push(score);
    }

    return results;
  }

  /**
   * Fetches trust score for a Karigar, computing on the fly if not yet recorded
   */
  async getTrustScore(karigarId: string): Promise<KarigarTrustScore> {
    if (dbManager.isSqlite) {
      const db = sqliteManager.getDb();
      const row = db.prepare('SELECT * FROM trust_scores WHERE karigar_id = ?').get(karigarId) as any;
      if (row) {
        const karigarParty = SEED_PARTIES.find((p) => p.id === karigarId);
        let factors: any = {};
        try {
          factors = JSON.parse(row.factors_json);
        } catch {
          factors = null;
        }

        if (factors) {
          return {
            id: row.id,
            karigar_id: row.karigar_id,
            karigar_name: karigarParty?.name || 'Master Karigar',
            business_name: karigarParty?.businessName || 'Bench #4',
            avatar_url: karigarParty?.avatarUrl,
            composite_score: Number(row.composite_score),
            total_orders: row.total_orders,
            factors,
            calculation_version: row.calculation_version,
            is_cold_start: row.total_orders === 0,
            is_public: row.is_public === 1,
            updated_at: row.updated_at,
            created_at: row.created_at
          };
        }
      }
    }

    return this.recalculateForKarigar(karigarId);
  }

  /**
   * Lists all Karigar trust scores, sorted descending by composite score
   */
  async getAllTrustScores(): Promise<KarigarTrustScore[]> {
    const karigars = SEED_PARTIES.filter((p) => p.role === 'KARIGAR');
    const scores: KarigarTrustScore[] = [];

    for (const k of karigars) {
      const s = await this.getTrustScore(k.id);
      scores.push(s);
    }

    return scores.sort((a, b) => b.composite_score - a.composite_score);
  }

  /**
   * Sets privacy status for an artisan passport
   */
  async setPrivacy(karigarId: string, isPublic: boolean, user: User): Promise<KarigarTrustScore> {
    if (user.role === 'KARIGAR' && user.id !== karigarId) {
      throw new Error('Access denied. You can only update the privacy settings of your own artisan passport.');
    }

    if (dbManager.isSqlite) {
      const db = sqliteManager.getDb();
      db.prepare('UPDATE trust_scores SET is_public = ?, updated_at = ? WHERE karigar_id = ?').run(
        isPublic ? 1 : 0,
        new Date().toISOString(),
        karigarId
      );
    }

    return this.getTrustScore(karigarId);
  }

  /**
   * Applies dispute resolution penalty points to an artisan's trust score
   */
  async applyPenalty(karigarId: string, penaltyPoints: number): Promise<KarigarTrustScore> {
    const score = await this.getTrustScore(karigarId);
    const newComposite = Number(Math.max(0.5, score.composite_score - penaltyPoints).toFixed(2));

    // Also deduct from dispute frequency factor proportionally
    const newDisputeFactor = Number(Math.max(0.0, score.factors.dispute_frequency.bayesian_score - penaltyPoints * 1.5).toFixed(2));
    score.factors.dispute_frequency.bayesian_score = newDisputeFactor;
    score.composite_score = newComposite;
    score.updated_at = new Date().toISOString();

    if (dbManager.isSqlite) {
      const db = sqliteManager.getDb();
      db.prepare(`
        UPDATE trust_scores
        SET composite_score = ?, dispute_frequency = ?, factors_json = ?, updated_at = ?
        WHERE karigar_id = ?
      `).run(
        newComposite,
        newDisputeFactor,
        JSON.stringify(score.factors),
        score.updated_at,
        karigarId
      );
    }

    this.inMemoryScores.set(karigarId, score);
    return score;
  }

  /**
   * Generates public shareable artisan passport with QR code
   */
  async getPublicPassport(karigarId: string, hostUrl: string = 'http://localhost:5173'): Promise<PublicArtisanPassport> {
    const score = await this.getTrustScore(karigarId);

    if (!score.is_public) {
      throw new Error('This artisan passport has been set to private by the artisan.');
    }

    const passportUrl = `${hostUrl}/passport/${karigarId}`;
    const qrCodeDataUrl = await QRCode.toDataURL(passportUrl, {
      width: 280,
      margin: 1,
      color: {
        dark: '#1e4629',
        light: '#f0f8f3'
      }
    });

    return {
      karigar_id: score.karigar_id,
      karigar_name: score.karigar_name || 'Master Artisan',
      business_name: score.business_name,
      avatar_url: score.avatar_url,
      composite_score: score.composite_score,
      total_orders: score.total_orders,
      factors: score.factors,
      calculation_version: score.calculation_version,
      is_public: score.is_public,
      qr_code_data_url: qrCodeDataUrl,
      passport_url: passportUrl,
      issued_at: new Date().toISOString()
    };
  }
}

export const trustScoreRepository = new TrustScoreRepository();

