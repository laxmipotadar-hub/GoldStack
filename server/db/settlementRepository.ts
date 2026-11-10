import crypto from 'node:crypto';
import {
  Settlement,
  SettlementStatus,
  SettlementLineItem,
  CreateSettlementRequest,
  ApproveSettlementRequest,
  DisputeSettlementRequest,
  MarkSettlementPaidRequest,
  PaymentMethod,
  SettlementAgingReport,
  SettlementAgingItem,
  SettlementAgingBucket,
  GoldRate,
  GoldLedgerEntry,
  User,
  Role
} from '../../shared/types.js';
import {
  calculateSettlement,
  SettlementCalculationInput,
  SettlementCalculationResult
} from '../../shared/settlementCalculation.js';
import { dbManager } from './index.js';
import { sqliteManager } from './sqlite.js';
import { notificationService } from '../services/notificationService.js';
import { ledgerRepository } from './ledgerRepository.js';
import { trustScoreRepository } from './trustScoreRepository.js';

export class SettlementRepository {
  private inMemorySettlements: Settlement[] = [];
  private inMemoryRates: GoldRate[] = [
    {
      id: 'rate-curr',
      rate_per_gram_24k: 7420.0,
      currency: 'INR',
      effective_date: new Date().toISOString().split('T')[0],
      created_at: new Date().toISOString()
    }
  ];
  private initialized = false;

  async init(): Promise<void> {
    if (this.initialized) return;

    if (dbManager.isSqlite) {
      sqliteManager.getDb();
      await this.seedInitialSettlementsIfEmpty();
    }

    this.initialized = true;
  }

  /**
   * Retrieves the current 24K gold bullion rate (₹ 7,420/g by default)
   */
  async getCurrentGoldRate(): Promise<number> {
    if (dbManager.isSqlite) {
      try {
        const db = sqliteManager.getDb();
        const row = db.prepare(`
          SELECT rate_per_gram_24k FROM gold_rates
          ORDER BY effective_date DESC, created_at DESC
          LIMIT 1
        `).get() as { rate_per_gram_24k: number } | undefined;

        if (row && row.rate_per_gram_24k) {
          return Number(row.rate_per_gram_24k);
        }
      } catch (err) {
        console.error('[SettlementRepository] Failed to query gold_rates in SQLite:', err);
      }
    }
    return this.inMemoryRates[0]?.rate_per_gram_24k || 7420.0;
  }

  /**
   * Retrieves historical gold rates table
   */
  async getGoldRateHistory(): Promise<GoldRate[]> {
    if (dbManager.isSqlite) {
      try {
        const db = sqliteManager.getDb();
        const rows = db.prepare(`
          SELECT * FROM gold_rates ORDER BY effective_date DESC, created_at DESC
        `).all() as any[];

        return rows.map((r) => ({
          id: r.id,
          rate_per_gram_24k: Number(r.rate_per_gram_24k),
          currency: r.currency,
          effective_date: r.effective_date,
          created_at: r.created_at
        }));
      } catch (err) {
        console.error('[SettlementRepository] Failed to fetch rate history:', err);
      }
    }
    return this.inMemoryRates;
  }

  /**
   * Seed demo settlements linked to initial orders if empty
   */
  private async seedInitialSettlementsIfEmpty(): Promise<void> {
    const db = sqliteManager.getDb();
    const countRow = db.prepare('SELECT count(*) as count FROM settlements').get() as { count: number };
    if (countRow && countRow.count > 0) return;

    const jewellerId = '11111111-1111-1111-1111-111111111111'; // Lalit
    const karigarId = '22222222-2222-2222-2222-222222222222'; // Ramesh

    // Check if an order exists to link
    const orderRow = db.prepare('SELECT id, order_number FROM orders WHERE karigar_id = ? LIMIT 1').get(karigarId) as { id: string; order_number: string } | undefined;

    // Seed Settlement 1: Completed Wedding Ring Job-Work (Status: PAID)
    const calc1 = calculateSettlement({
      issuedGrams: 50.0,
      returnedGrams: 47.0, // 3.0g loss = 6.0% actual (matches 6.0% agreed)
      agreedWastagePct: 6.0,
      goldRatePerGram24K: 7420.0,
      makingChargePerGram: 650.0,
      advances: 10000.0
    });

    const now = new Date().toISOString();
    const pastDate = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

    const insertStmt = db.prepare(`
      INSERT INTO settlements (
        id, settlement_number, order_id, jeweller_id, karigar_id,
        gold_value, making_charges, wastage_adjustment, shortage_penalty,
        advances, net_payable, status, line_items, gold_rate, payment_method, payment_reference,
        jeweller_approved_at, karigar_approved_at, paid_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertStmt.run(
      'settle-seed-1',
      'SETTLE-2026-001',
      orderRow ? orderRow.id : null,
      jewellerId,
      karigarId,
      calc1.gold_value,
      calc1.making_charges,
      calc1.wastage_adjustment,
      calc1.shortage_penalty,
      calc1.advances,
      calc1.net_payable,
      'PAID',
      JSON.stringify(calc1.line_items),
      7420.0,
      'BANK',
      'NEFT-AXIS-98214',
      pastDate,
      pastDate,
      pastDate,
      pastDate,
      pastDate
    );

    // Seed Settlement 2: Bridal Choker Batch (Status: AWAITING_KARIGAR)
    const calc2 = calculateSettlement({
      issuedGrams: 100.0,
      returnedGrams: 93.0, // 7.0g loss = 7.0% actual (agreed: 6.5% -> 0.5g excess)
      agreedWastagePct: 6.5,
      actualWastageGrams: 7.0,
      goldRatePerGram24K: 7420.0,
      makingChargePerGram: 750.0,
      advances: 25000.0
    });

    insertStmt.run(
      'settle-seed-2',
      'SETTLE-2026-002',
      orderRow ? orderRow.id : null,
      jewellerId,
      karigarId,
      calc2.gold_value,
      calc2.making_charges,
      calc2.wastage_adjustment,
      calc2.shortage_penalty,
      calc2.advances,
      calc2.net_payable,
      'AWAITING_KARIGAR',
      JSON.stringify(calc2.line_items),
      7420.0,
      null,
      null,
      now,
      null,
      null,
      now,
      now
    );
  }

  /**
   * Generates a new settlement proposal for an order (Dual Approval Step 1: Jeweller generates -> AWAITING_KARIGAR)
   */
  async createSettlement(req: CreateSettlementRequest, user: User): Promise<Settlement> {
    if (user.role !== 'JEWELLER') {
      throw new Error('Access denied. Only registered Jewellers can generate settlements.');
    }

    const currentGoldRate = await this.getCurrentGoldRate();

    // Compute transparent line-item breakdown
    const calc = calculateSettlement({
      issuedGrams: req.issued_grams,
      returnedGrams: req.returned_grams,
      agreedWastagePct: req.agreed_wastage_pct,
      actualWastageGrams: req.actual_wastage_grams,
      goldRatePerGram24K: currentGoldRate,
      purityKarat: req.purity_karat || 22,
      makingChargePerGram: req.making_charge_per_gram,
      advances: req.advances || 0,
      goldValueComponent: req.gold_value || 0
    });

    const id = crypto.randomUUID();
    const settlementNumber = `SETTLE-2026-${Date.now().toString().slice(-6)}${Math.floor(10 + Math.random() * 90)}`;
    const now = new Date().toISOString();

    const settlement: Settlement = {
      id,
      settlement_number: settlementNumber,
      order_id: req.order_id || null,
      jeweller_id: user.id,
      karigar_id: req.karigar_id,
      jeweller_name: user.name,
      gold_value: calc.gold_value,
      making_charges: calc.making_charges,
      wastage_adjustment: calc.wastage_adjustment,
      shortage_penalty: calc.shortage_penalty,
      advances: calc.advances,
      net_payable: calc.net_payable,
      status: 'AWAITING_KARIGAR',
      line_items: calc.line_items,
      gold_rate: currentGoldRate,
      payment_method: null,
      payment_reference: null,
      jeweller_approved_at: now, // Jeweller generates and approves initially
      karigar_approved_at: null,
      paid_at: null,
      dispute_reason: null,
      created_at: now,
      updated_at: now
    };

    if (dbManager.isSqlite) {
      try {
        const db = sqliteManager.getDb();
        db.prepare(`
          INSERT INTO settlements (
            id, settlement_number, order_id, jeweller_id, karigar_id,
            gold_value, making_charges, wastage_adjustment, shortage_penalty,
            advances, net_payable, status, line_items, gold_rate, payment_method, payment_reference,
            jeweller_approved_at, karigar_approved_at, paid_at, dispute_reason, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          settlement.id,
          settlement.settlement_number,
          settlement.order_id || null,
          settlement.jeweller_id,
          settlement.karigar_id,
          settlement.gold_value,
          settlement.making_charges,
          settlement.wastage_adjustment,
          settlement.shortage_penalty,
          settlement.advances,
          settlement.net_payable,
          settlement.status,
          JSON.stringify(settlement.line_items),
          settlement.gold_rate,
          settlement.payment_method,
          settlement.payment_reference,
          settlement.jeweller_approved_at,
          null,
          null,
          null,
          settlement.created_at,
          settlement.updated_at
        );
      } catch (err) {
        console.error('[SettlementRepository] Failed to insert settlement in SQLite:', err);
      }
    }

    this.inMemorySettlements.unshift(settlement);

    // Notify Karigar that settlement is awaiting their approval
    await notificationService.createInAppNotification({
      user_id: settlement.karigar_id,
      user_role: 'KARIGAR',
      order_id: settlement.order_id || undefined,
      order_number: settlement.settlement_number,
      title: `💰 नया हिसाब देय (New Settlement): #${settlement.settlement_number}`,
      message: `ज्वैलर ${user.name} ने ₹${calc.net_payable.toLocaleString('en-IN')} का अंतिम हिसाब तैयार किया है। कृपया समीक्षा कर पुष्टि करें।`,
      severity: 'info'
    });

    // Auto-update Karigar trust score in background
    trustScoreRepository.recalculateForKarigar(settlement.karigar_id).catch(() => {});

    return settlement;
  }

  /**
   * Retrieves all settlements accessible to user with strict role data isolation:
   * - Karigars see ONLY their own settlements
   * - Jewellers see all settlements originating from their workshop
   */
  async getSettlements(
    filters: { status?: SettlementStatus; order_id?: string },
    user?: User
  ): Promise<Settlement[]> {
    let list: Settlement[] = [];

    if (dbManager.isSqlite) {
      try {
        const db = sqliteManager.getDb();
        let query = `
          SELECT s.*,
                 jp.full_name as jeweller_name,
                 kp.full_name as karigar_name,
                 o.order_number as order_number
          FROM settlements s
          LEFT JOIN platform_parties jp ON jp.id = s.jeweller_id
          LEFT JOIN platform_parties kp ON kp.id = s.karigar_id
          LEFT JOIN orders o ON o.id = s.order_id
          WHERE 1=1
        `;
        const params: any[] = [];

        // Strict data ownership
        if (user?.role === 'KARIGAR') {
          query += ` AND s.karigar_id = ?`;
          params.push(user.id);
        } else if (user?.role === 'JEWELLER') {
          query += ` AND s.jeweller_id = ?`;
          params.push(user.id);
        }

        if (filters.status) {
          query += ` AND s.status = ?`;
          params.push(filters.status);
        }
        if (filters.order_id) {
          query += ` AND s.order_id = ?`;
          params.push(filters.order_id);
        }

        query += ` ORDER BY s.created_at DESC`;

        const rows = db.prepare(query).all(...params) as any[];

        list = rows.map((r) => ({
          id: r.id,
          settlement_number: r.settlement_number,
          order_id: r.order_id,
          order_number: r.order_number || undefined,
          jeweller_id: r.jeweller_id,
          karigar_id: r.karigar_id,
          jeweller_name: r.jeweller_name,
          karigar_name: r.karigar_name,
          gold_value: Number(r.gold_value),
          making_charges: Number(r.making_charges),
          wastage_adjustment: Number(r.wastage_adjustment),
          shortage_penalty: Number(r.shortage_penalty),
          advances: Number(r.advances),
          net_payable: Number(r.net_payable),
          status: r.status as SettlementStatus,
          line_items: typeof r.line_items === 'string' ? JSON.parse(r.line_items || '[]') : r.line_items || [],
          gold_rate: r.gold_rate !== undefined && r.gold_rate !== null ? Number(r.gold_rate) : 7420.0,
          payment_method: r.payment_method || null,
          payment_reference: r.payment_reference || null,
          jeweller_approved_at: r.jeweller_approved_at,
          karigar_approved_at: r.karigar_approved_at,
          paid_at: r.paid_at,
          dispute_reason: r.dispute_reason,
          created_at: r.created_at,
          updated_at: r.updated_at
        }));
      } catch (err) {
        console.error('[SettlementRepository] Failed to fetch settlements from SQLite:', err);
      }
    } else {
      list = this.inMemorySettlements.filter((s) => {
        if (user?.role === 'KARIGAR' && s.karigar_id !== user.id) return false;
        if (user?.role === 'JEWELLER' && s.jeweller_id !== user.id) return false;
        if (filters.status && s.status !== filters.status) return false;
        if (filters.order_id && s.order_id !== filters.order_id) return false;
        return true;
      });
    }

    return list;
  }

  /**
   * Retrieves single settlement by ID
   */
  async getSettlementById(id: string, user?: User): Promise<Settlement | null> {
    const all = await this.getSettlements({}, user);
    return all.find((s) => s.id === id || s.settlement_number.toUpperCase() === id.toUpperCase()) || null;
  }

  /**
   * Applies dispute resolution adjustments to a settlement
   */
  async adjustSettlement(id: string, adjustmentAmount: number, notes?: string): Promise<Settlement> {
    const settlement = await this.getSettlementById(id);
    if (!settlement) {
      throw new Error(`Settlement ${id} not found.`);
    }

    const now = new Date().toISOString();
    settlement.net_payable = Number(Math.max(0, settlement.net_payable + adjustmentAmount).toFixed(2));

    // Add adjustment line item
    const lineItem: SettlementLineItem = {
      id: crypto.randomUUID(),
      category: 'INFO',
      titleEn: 'Dispute Settlement Adjustment',
      titleHi: 'विवाद समाधान समायोजन',
      description: notes || 'Settlement adjusted pursuant to resolved trade dispute.',
      amount: adjustmentAmount,
      type: adjustmentAmount >= 0 ? 'CREDIT' : 'DEBIT'
    };
    settlement.line_items.push(lineItem);
    settlement.updated_at = now;

    if (dbManager.isSqlite) {
      try {
        const db = sqliteManager.getDb();
        db.prepare(`
          UPDATE settlements
          SET net_payable = ?, line_items = ?, updated_at = ?
          WHERE id = ?
        `).run(settlement.net_payable, JSON.stringify(settlement.line_items), now, settlement.id);
      } catch (err) {
        console.error('[SettlementRepository] Failed to update settlement adjustment in SQLite:', err);
      }
    }

    const inMem = this.inMemorySettlements.find((s) => s.id === settlement.id);
    if (inMem) {
      Object.assign(inMem, settlement);
    }

    return settlement;
  }

  /**
   * Counterparty approves settlement (Dual Approval Step 2: Both approvals required -> PAID)
   */
  async approveSettlement(id: string, user: User, req?: ApproveSettlementRequest): Promise<Settlement> {
    const settlement = await this.getSettlementById(id, user);
    if (!settlement) {
      throw new Error(`Settlement ${id} not found or access denied.`);
    }

    if (settlement.status === 'PAID') {
      throw new Error(`Settlement ${settlement.settlement_number} is already paid.`);
    }

    const now = new Date().toISOString();

    if (user.role === 'KARIGAR') {
      if (settlement.karigar_id !== user.id) {
        throw new Error('Access denied. You can only approve settlements assigned to your account.');
      }

      settlement.karigar_approved_at = now;

      // When Karigar approves and Jeweller already approved -> status becomes PAID!
      if (settlement.jeweller_approved_at) {
        settlement.status = 'PAID';
        settlement.paid_at = now;
      } else {
        settlement.status = 'AWAITING_JEWELLER';
      }
    } else if (user.role === 'JEWELLER') {
      if (settlement.jeweller_id !== user.id) {
        throw new Error('Access denied. You can only approve your own workshop settlements.');
      }

      settlement.jeweller_approved_at = now;

      if (settlement.karigar_approved_at) {
        settlement.status = 'PAID';
        settlement.paid_at = now;
      } else {
        settlement.status = 'AWAITING_KARIGAR';
      }
    }

    settlement.updated_at = now;

    if (dbManager.isSqlite) {
      try {
        const db = sqliteManager.getDb();
        db.prepare(`
          UPDATE settlements
          SET status = ?, jeweller_approved_at = ?, karigar_approved_at = ?, paid_at = ?, updated_at = ?
          WHERE id = ?
        `).run(
          settlement.status,
          settlement.jeweller_approved_at,
          settlement.karigar_approved_at,
          settlement.paid_at,
          settlement.updated_at,
          settlement.id
        );
      } catch (err) {
        console.error('[SettlementRepository] Failed to update approval in SQLite:', err);
      }
    }

    const inMem = this.inMemorySettlements.find((s) => s.id === settlement.id);
    if (inMem) {
      Object.assign(inMem, settlement);
    }

    // Dispatch dual approval confirmation notification
    const recipientId = user.role === 'KARIGAR' ? settlement.jeweller_id : settlement.karigar_id;
    const recipientRole = user.role === 'KARIGAR' ? 'JEWELLER' : 'KARIGAR';

    await notificationService.createInAppNotification({
      user_id: recipientId,
      user_role: recipientRole,
      order_id: settlement.order_id || undefined,
      order_number: settlement.settlement_number,
      title: settlement.status === 'PAID'
        ? `✅ हिसाब चुकता (Settlement Paid): #${settlement.settlement_number}`
        : `👍 हिसाब स्वीकृत (Approval Recorded): #${settlement.settlement_number}`,
      message: settlement.status === 'PAID'
        ? `उभयपक्षीय पुष्टि पूर्ण। कुल ₹${settlement.net_payable.toLocaleString('en-IN')} का भुगतान पूर्ण चिह्नित किया गया।`
        : `${user.name} ने हिसाब स्वीकार कर लिया है।`,
      severity: 'info'
    });

    // Auto-update Karigar trust score in background
    trustScoreRepository.recalculateForKarigar(settlement.karigar_id).catch(() => {});

    return settlement;
  }

  /**
   * Karigar or counterparty flags dispute on settlement
   */
  async disputeSettlement(id: string, user: User, req: DisputeSettlementRequest): Promise<Settlement> {
    const settlement = await this.getSettlementById(id, user);
    if (!settlement) {
      throw new Error(`Settlement ${id} not found or access denied.`);
    }

    if (settlement.status === 'PAID') {
      throw new Error(`Cannot dispute an already PAID settlement.`);
    }

    const now = new Date().toISOString();
    settlement.status = 'DISPUTED';
    settlement.dispute_reason = req.dispute_reason;
    settlement.updated_at = now;

    if (dbManager.isSqlite) {
      try {
        const db = sqliteManager.getDb();
        db.prepare(`
          UPDATE settlements
          SET status = 'DISPUTED', dispute_reason = ?, updated_at = ?
          WHERE id = ?
        `).run(settlement.dispute_reason, now, settlement.id);
      } catch (err) {
        console.error('[SettlementRepository] Failed to record dispute in SQLite:', err);
      }
    }

    const inMem = this.inMemorySettlements.find((s) => s.id === settlement.id);
    if (inMem) {
      Object.assign(inMem, settlement);
    }

    // Alert Jeweller regarding dispute
    await notificationService.createInAppNotification({
      user_id: settlement.jeweller_id,
      user_role: 'JEWELLER',
      order_id: settlement.order_id || undefined,
      order_number: settlement.settlement_number,
      title: `⚠️ हिसाब पर आपत्ति (Settlement Disputed): #${settlement.settlement_number}`,
      message: `कारीगर ${user.name} ने हिसाब पर आपत्ति दर्ज की है: "${req.dispute_reason}"`,
      severity: 'high'
    });

    // Auto-update Karigar trust score in background
    trustScoreRepository.recalculateForKarigar(settlement.karigar_id).catch(() => {});

    return settlement;
  }

  /**
   * Mark-as-paid execution flow with payment method (UPI/BANK/CASH) and reference number.
   * On PAID, automatically writes a corresponding ADJUSTMENT entry into the immutable gold ledger.
   */
  async markSettlementPaid(
    id: string,
    user: User,
    req: MarkSettlementPaidRequest
  ): Promise<{ settlement: Settlement; ledger_entry: GoldLedgerEntry }> {
    if (user.role !== 'JEWELLER') {
      throw new Error('Access denied. Only registered Jewellers can execute payments.');
    }

    const settlement = await this.getSettlementById(id, user);
    if (!settlement) {
      throw new Error(`Settlement ${id} not found or access denied.`);
    }

    if (settlement.status === 'PAID') {
      throw new Error(`Settlement ${settlement.settlement_number} is already marked as PAID.`);
    }

    const now = new Date().toISOString();
    settlement.status = 'PAID';
    settlement.paid_at = now;
    settlement.payment_method = req.payment_method;
    settlement.payment_reference = req.payment_reference || null;
    settlement.jeweller_approved_at = settlement.jeweller_approved_at || now;
    settlement.karigar_approved_at = settlement.karigar_approved_at || now;
    settlement.updated_at = now;

    if (dbManager.isSqlite) {
      try {
        const db = sqliteManager.getDb();
        db.prepare(`
          UPDATE settlements
          SET status = 'PAID', paid_at = ?, payment_method = ?, payment_reference = ?,
              jeweller_approved_at = ?, karigar_approved_at = ?, updated_at = ?
          WHERE id = ?
        `).run(
          settlement.paid_at,
          settlement.payment_method,
          settlement.payment_reference,
          settlement.jeweller_approved_at,
          settlement.karigar_approved_at,
          settlement.updated_at,
          settlement.id
        );
      } catch (err) {
        console.error('[SettlementRepository] Failed to update mark-as-paid in SQLite:', err);
      }
    }

    const inMem = this.inMemorySettlements.find((s) => s.id === settlement.id);
    if (inMem) {
      Object.assign(inMem, settlement);
    }

    // Write corresponding ADJUSTMENT entry into the immutable gold ledger so the passbook stays the single source of truth
    const ledgerEntry = await ledgerRepository.createAdjustmentEntry({
      jeweller_id: settlement.jeweller_id,
      karigar_id: settlement.karigar_id,
      order_id: settlement.order_id,
      settlement_id: settlement.id,
      settlement_number: settlement.settlement_number,
      net_payable: settlement.net_payable,
      gold_rate: settlement.gold_rate,
      payment_method: req.payment_method,
      payment_reference: req.payment_reference,
      notes: req.notes
    });

    // Notify Karigar about payment completion
    await notificationService.createInAppNotification({
      user_id: settlement.karigar_id,
      user_role: 'KARIGAR',
      order_id: settlement.order_id || undefined,
      order_number: settlement.settlement_number,
      title: `💰 भुगतान पूर्ण (Payment Settled): #${settlement.settlement_number}`,
      message: `ज्वैलर ${user.name} ने ₹${settlement.net_payable.toLocaleString('en-IN')} का भुगतान (${req.payment_method}${req.payment_reference ? ` Ref: ${req.payment_reference}` : ''}) पूर्ण कर बही-खाते में समायोजन (ADJUSTMENT) दर्ज किया है।`,
      severity: 'info'
    });

    // Auto-update Karigar trust score in background
    trustScoreRepository.recalculateForKarigar(settlement.karigar_id).catch(() => {});

    return { settlement, ledger_entry: ledgerEntry };
  }

  /**
   * Aging report: buckets outstanding settlements into 0-7, 8-15, 16-30, >30 days.
   * Jeweller-only view.
   */
  async getSettlementsAgingReport(user: User): Promise<SettlementAgingReport> {
    if (user.role !== 'JEWELLER') {
      throw new Error('Access denied. Aging reports are only accessible to Jewellers.');
    }

    const allSettlements = await this.getSettlements({}, user);
    const outstanding = allSettlements.filter((s) => s.status !== 'PAID');

    const now = Date.now();
    const buckets: SettlementAgingReport['buckets'] = {
      '0-7': {
        bucket: '0-7',
        label: '0-7 Days',
        label_hi: '0-7 दिन (हाल के बिल)',
        count: 0,
        total_amount: 0,
        settlements: []
      },
      '8-15': {
        bucket: '8-15',
        label: '8-15 Days',
        label_hi: '8-15 दिन (पुष्टि प्रतीक्षित)',
        count: 0,
        total_amount: 0,
        settlements: []
      },
      '16-30': {
        bucket: '16-30',
        label: '16-30 Days',
        label_hi: '16-30 दिन (लंबित भुगतान)',
        count: 0,
        total_amount: 0,
        settlements: []
      },
      '>30': {
        bucket: '>30',
        label: '>30 Days',
        label_hi: '30+ दिन (अति-लंबित बकाया)',
        count: 0,
        total_amount: 0,
        settlements: []
      }
    };

    let totalCount = 0;
    let totalAmount = 0;

    for (const s of outstanding) {
      const createdTime = new Date(s.created_at).getTime();
      const ageDays = Math.max(0, Math.floor((now - createdTime) / (1000 * 60 * 60 * 24)));

      let targetBucket: '0-7' | '8-15' | '16-30' | '>30';
      if (ageDays <= 7) {
        targetBucket = '0-7';
      } else if (ageDays <= 15) {
        targetBucket = '8-15';
      } else if (ageDays <= 30) {
        targetBucket = '16-30';
      } else {
        targetBucket = '>30';
      }

      const item: SettlementAgingItem = {
        id: s.id,
        settlement_number: s.settlement_number,
        order_id: s.order_id,
        order_number: s.order_number,
        jeweller_id: s.jeweller_id,
        karigar_id: s.karigar_id,
        jeweller_name: s.jeweller_name,
        karigar_name: s.karigar_name,
        net_payable: s.net_payable,
        status: s.status,
        created_at: s.created_at,
        age_days: ageDays
      };

      buckets[targetBucket].count += 1;
      buckets[targetBucket].total_amount += s.net_payable;
      buckets[targetBucket].settlements.push(item);

      totalCount += 1;
      totalAmount += s.net_payable;
    }

    return {
      as_of: new Date().toISOString(),
      total_outstanding_count: totalCount,
      total_outstanding_amount: Number(totalAmount.toFixed(2)),
      buckets
    };
  }

  /**
   * Jeweller updates the current 24K bullion gold rate and persists rate history.
   */
  async updateGoldRate(ratePerGram24K: number, user: User, effectiveDate?: string): Promise<GoldRate> {
    if (user.role !== 'JEWELLER') {
      throw new Error('Access denied. Only registered Jewellers can update bullion rates.');
    }

    if (ratePerGram24K <= 0) {
      throw new Error('Bullion rate must be a positive number.');
    }

    const id = `rate-${Date.now()}`;
    const dateStr = effectiveDate || new Date().toISOString().split('T')[0];
    const now = new Date().toISOString();

    const rateRecord: GoldRate = {
      id,
      rate_per_gram_24k: Number(ratePerGram24K.toFixed(2)),
      currency: 'INR',
      effective_date: dateStr,
      created_at: now
    };

    if (dbManager.isSqlite) {
      try {
        const db = sqliteManager.getDb();
        db.prepare(`
          INSERT INTO gold_rates (id, rate_per_gram_24k, currency, effective_date, created_at)
          VALUES (?, ?, ?, ?, ?)
        `).run(
          rateRecord.id,
          rateRecord.rate_per_gram_24k,
          rateRecord.currency,
          rateRecord.effective_date,
          rateRecord.created_at
        );
      } catch (err) {
        console.error('[SettlementRepository] Failed to insert new gold rate in SQLite:', err);
      }
    }

    this.inMemoryRates.unshift(rateRecord);
    return rateRecord;
  }
}

export const settlementRepository = new SettlementRepository();

