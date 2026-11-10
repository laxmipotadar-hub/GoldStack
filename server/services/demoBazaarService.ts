import crypto from 'node:crypto';
import { dbManager } from '../db/index.js';
import { sqliteManager } from '../db/sqlite.js';
import { SEED_PARTIES } from '../db/ledgerRepository.js';
import { encryptCustomerName } from '../db/orderRepository.js';
import { addDaysToDate } from '../../shared/cpmEngine.js';
import { calculateSettlement } from '../../shared/settlementCalculation.js';
import { trustScoreRepository } from '../db/trustScoreRepository.js';
import { canonicalStringify, calculateTransactionHash, extractHashPayload } from '../crypto/hashChain.js';

export interface DemoBazaarSeedResult {
  karigarsCount: number;
  ordersCount: number;
  atRiskOrder: {
    id: string;
    orderNumber: string;
    customerName: string;
    occasionDate: string;
    daysRemaining: number;
    status: string;
  };
  disputedSettlement: {
    id: string;
    karigarName: string;
    status: string;
    disputeReason: string;
  };
  openDispute: {
    id: string;
    disputeNumber: string;
    targetType: string;
    status: string;
  };
  trustScores: {
    rameshHigh: number;
    deepaColdStart: number;
    priya: number;
    manojDisputed: number;
  };
  wastageVarianceFlagged: boolean;
}

export class DemoBazaarService {
  /**
   * Resets and seeds the comprehensive hackathon Demo Bazaar state:
   * 1. 4 karigars (Ramesh high trust, Priya, Manoj with dispute, Deepa apprentice with cold-start)
   * 2. 6 orders across all statuses (one AT_RISK wedding order due in 3 days, ACTIVE, IN_PROGRESS, READY, DELIVERED, CANCELLED)
   * 3. 1 disputed settlement linked to Manoj Filigree & 1 corresponding OPENED dispute record with frozen SHA-256 snapshot
   * 4. 1 ledger return entry with REVIEW_REQUIRED (excess wastage variance flag)
   * 5. Recalculated Bayesian trust scores
   */
  async seedDemoBazaar(): Promise<DemoBazaarSeedResult> {
    if (!dbManager.isSqlite) {
      throw new Error('Demo Bazaar seeding is only supported on SQLite store.');
    }

    const db = sqliteManager.getDb();
    const today = new Date().toISOString().split('T')[0];
    const now = new Date().toISOString();

    const jewellerId = '11111111-1111-1111-1111-111111111111'; // Lalit
    const rameshId = '22222222-2222-2222-2222-222222222222';   // Ramesh (High trust)
    const priyaId = '33333333-3333-3333-3333-333333333333';    // Priya
    const manojId = '44444444-4444-4444-4444-444444444444';    // Manoj (Disputed)
    const mediatorId = '55555555-5555-5555-5555-555555555555'; // Vikramaditya
    const deepaId = '66666666-6666-6666-6666-666666666666';    // Deepa (Cold-start)

    // Temporarily turn off foreign keys to allow deterministic clean re-seed
    db.pragma('foreign_keys = OFF');

    try {
      // 1. Ensure all 6 platform parties exist in platform_parties
      const insertParty = db.prepare(`
        INSERT OR REPLACE INTO platform_parties (id, role, full_name, business_name, phone)
        VALUES (?, ?, ?, ?, ?)
      `);

      for (const party of SEED_PARTIES) {
        insertParty.run(
          party.id,
          party.role,
          party.name,
          party.businessName || null,
          party.phone
        );
      }

      // 2. Clear old demo orders, milestones, order_events, disputes, settlements
      // Note: We never delete from gold_ledger to protect the immutable hash chain
      db.prepare(`DELETE FROM dispute_evidence WHERE dispute_id IN (SELECT id FROM disputes WHERE id LIKE 'demo-%')`).run();
      db.prepare(`DELETE FROM disputes WHERE id LIKE 'demo-%' OR id LIKE 'disp-%'`).run();
      db.prepare(`DELETE FROM settlements WHERE id LIKE 'demo-%' OR id LIKE 'settle-%'`).run();
      db.prepare(`DELETE FROM order_events WHERE order_id IN (SELECT id FROM orders WHERE id LIKE 'demo-%' OR order_number LIKE 'ORD-%')`).run();
      db.prepare(`DELETE FROM milestones WHERE order_id IN (SELECT id FROM orders WHERE id LIKE 'demo-%' OR order_number LIKE 'ORD-%')`).run();
      db.prepare(`DELETE FROM orders WHERE id LIKE 'demo-%' OR order_number LIKE 'ORD-%'`).run();

      // 3. Seed 6 Customer Occasion Orders across all statuses
      const insertOrder = db.prepare(`
        INSERT INTO orders (
          id, order_number, jeweller_id, karigar_id,
          customer_name_encrypted, occasion_type, occasion_date,
          design_complexity, status, item_description,
          target_weight_grams, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const insertMilestone = db.prepare(`
        INSERT INTO milestones (
          id, order_id, name, name_hi, sequence, duration_days,
          dependencies, status, planned_start_date, planned_date, actual_date,
          earliest_start, earliest_finish, latest_start, latest_finish,
          slack, is_critical, notes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const addMs = (
        id: string,
        orderId: string,
        name: string,
        nameHi: string,
        seq: number,
        dur: number,
        deps: string[],
        status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'DELAYED',
        plannedStart: string,
        plannedFinish: string,
        actualDate: string | null,
        isCrit: number,
        notes?: string
      ) => {
        insertMilestone.run(
          id, orderId, name, nameHi, seq, dur, JSON.stringify(deps),
          status, plannedStart, plannedFinish, actualDate,
          0, dur, 0, dur, 0, isCrit, notes || null, now, now
        );
      };

      const insertOrderEvent = db.prepare(`
        INSERT INTO order_events (
          id, order_id, from_status, to_status, trigger_reason,
          risk_score, risk_level, actor_id, actor_role, metadata, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      // ----------------------------------------------------
      // Order 1: AT_RISK (Royal Vivah Haar, Due in 3 Days!)
      // ----------------------------------------------------
      const atRiskOccasionDate = addDaysToDate(today, 3);
      const atRiskOrderId = 'demo-order-01-at-risk';
      const atRiskOrderNum = 'ORD-2026-VIVAH-01';
      const atRiskCustomer = 'Radhika & Siddharth Mehta (Royal Vivah Haar)';

      insertOrder.run(
        atRiskOrderId,
        atRiskOrderNum,
        jewellerId,
        priyaId,
        encryptCustomerName(atRiskCustomer),
        'WEDDING',
        atRiskOccasionDate,
        'INTRICATE',
        'AT_RISK',
        '22K Bridal Kundan Jadau Choker with Uncut Polki Diamonds & Emerald Droplets',
        185.5,
        addDaysToDate(today, -10),
        now
      );

      const m1_1 = 'demo-ms-1-1';
      const m1_2 = 'demo-ms-1-2';
      const m1_3 = 'demo-ms-1-3';
      const m1_4 = 'demo-ms-1-4';

      addMs(
        m1_1, atRiskOrderId,
        'Design Blueprint & CAD Approval', 'डिज़ाइन स्वीकृति',
        1, 2, [], 'COMPLETED',
        addDaysToDate(today, -10), addDaysToDate(today, -8), addDaysToDate(today, -8), 1,
        'Approved by Bride & Family'
      );

      addMs(
        m1_2, atRiskOrderId,
        '22K Solid Gold Alloy Casting', 'स्वर्ण ढलाई',
        2, 3, [m1_1], 'COMPLETED',
        addDaysToDate(today, -7), addDaysToDate(today, -4), addDaysToDate(today, -4), 1,
        'Cast with 91.6% hallmark certified ingot'
      );

      addMs(
        m1_3, atRiskOrderId,
        'Intricate Kundan Jadau Setting', 'कुंदन जड़ाई कार्य',
        3, 4, [m1_2], 'DELAYED',
        addDaysToDate(today, -3), addDaysToDate(today, 3), null, 1,
        'Delicate 24K pure gold foil micro-crimping required re-chasing'
      );

      addMs(
        m1_4, atRiskOrderId,
        'Hallmarking & Final Polish', 'हॉलमार्किंग एवं अंतिम पॉलिश',
        4, 2, [m1_3], 'PENDING',
        addDaysToDate(today, 3), addDaysToDate(today, 5), null, 1,
        'CRITICAL: Downstream completion breaches occasion buffer! Wedding in 3 days.'
      );

      insertOrderEvent.run(
        'demo-evt-01',
        atRiskOrderId,
        'ON_TRACK',
        'AT_RISK',
        'Automated CPM cascade: Kundan Setting delay caused final delivery to slip to ' + addDaysToDate(today, 5) + ' (Occasion: ' + atRiskOccasionDate + '). SMS alert dispatched.',
        0.88,
        'HIGH',
        'system-cpm-engine',
        'SYSTEM',
        JSON.stringify({ daysRemaining: 3, delayDays: 2, probability: 0.94 }),
        now
      );

      console.log(`[SMS→karigar] Order #${atRiskOrderNum} at risk, 3 days to wedding`);
      console.log(`[SMS→jeweller] Order #${atRiskOrderNum} at risk, 3 days to wedding`);

      // ----------------------------------------------------
      // Order 2: ACTIVE (Meenakari Bangles - Ceremony in 22 days)
      // ----------------------------------------------------
      const activeOrderId = 'demo-order-02-active';
      const activeOrderNum = 'ORD-2026-BGL-02';
      const activeCustomer = 'Ananya & Rohan Singhania (Meenakari Bangles)';

      insertOrder.run(
        activeOrderId,
        activeOrderNum,
        jewellerId,
        priyaId,
        encryptCustomerName(activeCustomer),
        'CEREMONY',
        addDaysToDate(today, 22),
        'MEDIUM',
        'ACTIVE',
        'Pair of 22K Peacock Motif Meenakari Openable Kadas (45g each)',
        90.0,
        addDaysToDate(today, -2),
        now
      );

      addMs(
        'demo-ms-2-1', activeOrderId,
        'Design Blueprint & CAD Approval', 'डिज़ाइन स्वीकृति',
        1, 2, [], 'COMPLETED',
        addDaysToDate(today, -2), addDaysToDate(today, -1), addDaysToDate(today, -1), 1,
        'Traditional Bikaner enamel motif approved'
      );
      addMs(
        'demo-ms-2-2', activeOrderId,
        '22K Wirework & Die Cutting', 'तारकशी व कटाई',
        2, 4, ['demo-ms-2-1'], 'PENDING',
        addDaysToDate(today, 0), addDaysToDate(today, 4), null, 1,
        'On schedule'
      );

      // ----------------------------------------------------
      // Order 3: IN_PROGRESS (Temple Bridal Choker - Manoj Filigree)
      // ----------------------------------------------------
      const progOrderId = 'demo-order-03-prog';
      const progOrderNum = 'ORD-2026-CHK-03';
      const progCustomer = 'Pooja & Varun Agarwal (Temple Bridal Choker)';

      insertOrder.run(
        progOrderId,
        progOrderNum,
        jewellerId,
        manojId,
        encryptCustomerName(progCustomer),
        'WEDDING',
        addDaysToDate(today, 12),
        'COMPLEX',
        'IN_PROGRESS',
        'Traditional 22K South Indian Temple Choker with Nakshi Goddess Motif',
        120.0,
        addDaysToDate(today, -5),
        now
      );

      addMs(
        'demo-ms-3-1', progOrderId,
        'Die Casting & Embossing', 'ढलाई व नक्काशी',
        1, 3, [], 'COMPLETED',
        addDaysToDate(today, -5), addDaysToDate(today, -2), addDaysToDate(today, -2), 1,
        'Goddess Lakshmi central motif embossed'
      );
      addMs(
        'demo-ms-3-2', progOrderId,
        'Nakshi Chasing & Stone Setting', 'नक्काशी व नग जड़ाई',
        2, 5, ['demo-ms-3-1'], 'IN_PROGRESS',
        addDaysToDate(today, -1), addDaysToDate(today, 4), null, 1,
        'Artisan working at Bench #12'
      );

      // ----------------------------------------------------
      // Order 4: READY (Polki Jadau Jhumkas - Ramesh Soni)
      // ----------------------------------------------------
      const readyOrderId = 'demo-order-04-ready';
      const readyOrderNum = 'ORD-2026-JHM-04';
      const readyCustomer = 'Meera & Aditya Birla (Polki Jadau Jhumkas)';

      insertOrder.run(
        readyOrderId,
        readyOrderNum,
        jewellerId,
        rameshId,
        encryptCustomerName(readyCustomer),
        'FESTIVAL',
        addDaysToDate(today, 6),
        'SIMPLE',
        'READY',
        '22K Chandbali Polki Tiered Jhumkas with Seed Pearl Clusters',
        48.0,
        addDaysToDate(today, -8),
        now
      );

      addMs(
        'demo-ms-4-1', readyOrderId,
        'Gold Casting & Polki Setting', 'ढलाई व जड़ाई',
        1, 4, [], 'COMPLETED',
        addDaysToDate(today, -8), addDaysToDate(today, -4), addDaysToDate(today, -4), 1,
        'Completed'
      );
      addMs(
        'demo-ms-4-2', readyOrderId,
        'QC Hallmarking & Ultrasonic Cleaning', 'हॉलमार्किंग व सफाई',
        2, 2, ['demo-ms-4-1'], 'COMPLETED',
        addDaysToDate(today, -3), addDaysToDate(today, -1), addDaysToDate(today, -1), 1,
        'Passed hallmark inspection with 91.6% purity stamp'
      );

      // ----------------------------------------------------
      // Order 5: DELIVERED (Mangalsutra & Kada - Ramesh Soni)
      // ----------------------------------------------------
      const delOrderId = 'demo-order-05-del';
      const delOrderNum = 'ORD-2026-MNG-05';
      const delCustomer = 'Isha & Anand Piramal (Traditional Mangalsutra & Kada)';

      insertOrder.run(
        delOrderId,
        delOrderNum,
        jewellerId,
        rameshId,
        encryptCustomerName(delCustomer),
        'WEDDING',
        addDaysToDate(today, -10),
        'COMPLEX',
        'DELIVERED',
        '22K Hand-Crafted Filigree Mangalsutra with Matching Filigree Kadas',
        110.0,
        addDaysToDate(today, -30),
        now
      );

      addMs(
        'demo-ms-5-1', delOrderId,
        'Filigree Weaving & Assembly', 'तारकशी बुनाई',
        1, 8, [], 'COMPLETED',
        addDaysToDate(today, -25), addDaysToDate(today, -17), addDaysToDate(today, -17), 1,
        'Exemplary finish'
      );
      addMs(
        'demo-ms-5-2', delOrderId,
        'Final Delivery & Customer Handover', 'सुपुर्दगी',
        2, 2, ['demo-ms-5-1'], 'COMPLETED',
        addDaysToDate(today, -16), addDaysToDate(today, -14), addDaysToDate(today, -14), 1,
        'Delivered on-time with client certificate'
      );

      // ----------------------------------------------------
      // Order 6: CANCELLED (Navratna Armlet - Deepa Verma)
      // ----------------------------------------------------
      const cncOrderId = 'demo-order-06-cnc';
      const cncOrderNum = 'ORD-2026-KAD-06';
      const cncCustomer = 'Kavita & Rajesh Sharma (Navratna Armlet)';

      insertOrder.run(
        cncOrderId,
        cncOrderNum,
        jewellerId,
        deepaId,
        encryptCustomerName(cncCustomer),
        'OTHER',
        addDaysToDate(today, 15),
        'MEDIUM',
        'CANCELLED',
        '22K Flexible Navratna Vanki (Traditional Bajuband)',
        55.0,
        addDaysToDate(today, -6),
        now
      );

      addMs(
        'demo-ms-6-1', cncOrderId,
        'Design Review & Sizing', 'डिज़ाइन समीक्षा',
        1, 2, [], 'COMPLETED',
        addDaysToDate(today, -6), addDaysToDate(today, -4), addDaysToDate(today, -4), 1,
        'Initial spec drafted'
      );

      // Seed 15 historical flawless deliveries for Ramesh Soni (Master Karigar) to yield elite trust score >= 4.80
      for (let i = 1; i <= 15; i++) {
        const histOrderId = `demo-order-hist-ramesh-${i}`;
        const histOrderNum = `ORD-HIST-RAMESH-${i < 10 ? '0' + i : i}`;
        const pastDate = addDaysToDate(today, -30 - i * 15);
        insertOrder.run(
          histOrderId,
          histOrderNum,
          jewellerId,
          rameshId,
          encryptCustomerName(`Heritage Patron #${i}`),
          'WEDDING',
          pastDate,
          'COMPLEX',
          'DELIVERED',
          `22K Heritage Royal Ornament Set #${i}`,
          75.0,
          addDaysToDate(pastDate, -20),
          pastDate
        );

        addMs(
          `demo-ms-hist-${i}-1`, histOrderId,
          'Casting & Crafting', 'स्वर्ण ढलाई',
          1, 8, [], 'COMPLETED',
          addDaysToDate(pastDate, -15), addDaysToDate(pastDate, -5), addDaysToDate(pastDate, -5), 1,
          'Completed'
        );
        addMs(
          `demo-ms-hist-${i}-2`, histOrderId,
          'Hallmark QC & Delivery', 'हॉलमार्क जाँच',
          2, 2, [`demo-ms-hist-${i}-1`], 'COMPLETED',
          addDaysToDate(pastDate, -4), pastDate, pastDate, 1,
          'Delivered on-time'
        );
      }

      // 4. Seed Settlements (including 1 DISPUTED settlement for Manoj Filigree)
      const insertSettlement = db.prepare(`
        INSERT INTO settlements (
          id, settlement_number, order_id, jeweller_id, karigar_id,
          gold_value, making_charges, wastage_adjustment, shortage_penalty,
          advances, net_payable, status, line_items, gold_rate, payment_method,
          payment_reference, jeweller_approved_at, karigar_approved_at,
          paid_at, dispute_reason, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      // Settlement 1: Disputed by Manoj Filigree
      const disputedSettlementId = 'demo-settlement-disputed-manoj';
      const disputedCalc = calculateSettlement({
        issuedGrams: 100.0,
        returnedGrams: 97.0,
        agreedWastagePct: 1.5,
        actualWastageGrams: 3.0,
        goldRatePerGram24K: 7420.0,
        purityKarat: 22,
        makingChargePerGram: 450.0,
        advances: 10000.0
      });

      insertSettlement.run(
        disputedSettlementId,
        'SETTLE-2026-DISP-01',
        progOrderId,
        jewellerId,
        manojId,
        disputedCalc.gold_value,
        disputedCalc.making_charges,
        disputedCalc.wastage_adjustment,
        disputedCalc.shortage_penalty,
        10000.0,
        disputedCalc.net_payable,
        'DISPUTED',
        JSON.stringify(disputedCalc.line_items),
        7420.0,
        null,
        null,
        addDaysToDate(today, -2),
        null,
        null,
        'Artisan billed ₹500/g for hand-filigree jadau; jeweller invoice calculated standard ₹450/g.',
        addDaysToDate(today, -3),
        now
      );

      // Settlement 2: Awaiting Karigar Approval (Priya Goldsmith)
      const awaitingSettlementId = 'demo-settlement-awaiting-priya';
      const awaitingCalc = calculateSettlement({
        issuedGrams: 50.0,
        returnedGrams: 49.0,
        agreedWastagePct: 2.0,
        actualWastageGrams: 1.0,
        goldRatePerGram24K: 7420.0,
        purityKarat: 22,
        makingChargePerGram: 380.0,
        advances: 5000.0
      });

      insertSettlement.run(
        awaitingSettlementId,
        'SETTLE-2026-AWAIT-02',
        activeOrderId,
        jewellerId,
        priyaId,
        awaitingCalc.gold_value,
        awaitingCalc.making_charges,
        awaitingCalc.wastage_adjustment,
        awaitingCalc.shortage_penalty,
        5000.0,
        awaitingCalc.net_payable,
        'AWAITING_KARIGAR',
        JSON.stringify(awaitingCalc.line_items),
        7420.0,
        null,
        null,
        addDaysToDate(today, -1),
        null,
        null,
        null,
        addDaysToDate(today, -1),
        now
      );

      // Settlement 3: Paid by UPI (Ramesh Soni)
      const paidSettlementId = 'demo-settlement-paid-ramesh';
      const paidCalc = calculateSettlement({
        issuedGrams: 110.0,
        returnedGrams: 108.0,
        agreedWastagePct: 2.0,
        actualWastageGrams: 2.0,
        goldRatePerGram24K: 7420.0,
        purityKarat: 22,
        makingChargePerGram: 420.0,
        advances: 15000.0
      });

      insertSettlement.run(
        paidSettlementId,
        'SETTLE-2026-PAID-03',
        delOrderId,
        jewellerId,
        rameshId,
        paidCalc.gold_value,
        paidCalc.making_charges,
        0,
        0,
        15000.0,
        paidCalc.net_payable,
        'PAID',
        JSON.stringify(paidCalc.line_items),
        7420.0,
        'UPI',
        'UPI/2026/8920194',
        addDaysToDate(today, -6),
        addDaysToDate(today, -5),
        addDaysToDate(today, -5),
        null,
        addDaysToDate(today, -6),
        now
      );

      // 5. Seed Open Dispute in disputes table for the disputed settlement
      const disputedSettlementSnapshot = {
        id: disputedSettlementId,
        karigar_id: manojId,
        jeweller_id: jewellerId,
        issued_grams: 100.0,
        returned_grams: 97.0,
        agreed_wastage_pct: 1.5,
        actual_wastage_grams: 3.0,
        making_charges: disputedCalc.making_charges,
        net_payable: disputedCalc.net_payable,
        status: 'DISPUTED',
        dispute_reason: 'Artisan billed ₹500/g for hand-filigree jadau; jeweller invoice calculated standard ₹450/g.'
      };
      const snapshotCanonical = canonicalStringify(disputedSettlementSnapshot);
      const snapshotHash = crypto.createHash('sha256').update(snapshotCanonical).digest('hex');

      const demoDisputeId = 'demo-dispute-settlement-manoj';
      const demoDisputeNumber = 'DISP-2026-89102';
      const evidenceDeadline = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();

      const insertDispute = db.prepare(`
        INSERT INTO disputes (
          id, dispute_number, target_type, target_id, jeweller_id, karigar_id, raised_by,
          category, description, status, evidence_deadline, snapshot_data, snapshot_hash,
          penalty_points, settlement_adjustment_amount, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0.0, 0.0, ?, ?)
      `);

      insertDispute.run(
        demoDisputeId,
        demoDisputeNumber,
        'SETTLEMENT',
        disputedSettlementId,
        jewellerId,
        manojId,
        manojId,
        'PAYMENT',
        'Making charge dispute: Karigar claims intricate Jadau work requires ₹500/g hand-crafting rate, whereas standard invoice applied ₹450/g.',
        'OPENED',
        evidenceDeadline,
        JSON.stringify(disputedSettlementSnapshot),
        snapshotHash,
        addDaysToDate(today, -2),
        now
      );

      // 6. Ensure 1 return entry with REVIEW_REQUIRED in gold_ledger for wastage variance demo
      const reviewRow = db.prepare(`
        SELECT id FROM gold_ledger WHERE status = 'REVIEW_REQUIRED' OR id = 'demo-return-wastage-variance' LIMIT 1
      `).get() as { id: string } | undefined;

      if (!reviewRow) {
        // Create an explicit REVIEW_REQUIRED return entry
        const returnId = 'demo-return-wastage-variance';
        const returnTimestamp = addDaysToDate(today, -1);
        const lastBlock = db.prepare(`
          SELECT sequence_number, transaction_hash FROM gold_ledger ORDER BY sequence_number DESC LIMIT 1
        `).get() as { sequence_number: number; transaction_hash: string } | undefined;

        const nextSeq = (lastBlock?.sequence_number || 0) + 1;
        const prevHash = lastBlock?.transaction_hash || '0000000000000000000000000000000000000000000000000000000000000000';

        const returnPayload = {
          jeweller_id: jewellerId,
          karigar_id: manojId,
          order_id: progOrderId,
          transaction_type: 'RETURN',
          weight_grams: 47.0,
          purity_karat: 22,
          pure_weight_24k: Number(((47.0 * 22) / 24).toFixed(4)),
          notes: 'Excess melting loss variance: 3.00g actual wastage vs 1.25g agreed tolerance. Review required.',
          photo_evidence_url: 'https://images.unsplash.com/photo-1617038220319-276d3cfab638?w=300',
          perceptual_hash: 'd8c4e2a1b9f07853',
          gps_lat: 18.9553,
          gps_lng: 72.8311,
          metadata: {
            agreedWastagePct: 2.5,
            actualWastagePct: 6.0,
            exceedsAllowedWastage: true,
            varianceGrams: 1.75
          }
        };

        const hashPayload = extractHashPayload({
          jeweller_id: jewellerId,
          karigar_id: manojId,
          order_id: progOrderId,
          transaction_type: 'RETURN',
          weight_grams: 47.0,
          purity_karat: 22,
          initiated_by: 'JEWELLER',
          photo_evidence_url: returnPayload.photo_evidence_url,
          perceptual_hash: returnPayload.perceptual_hash,
          gps_lat: 18.9553,
          gps_lng: 72.8311,
          metadata: returnPayload.metadata
        });

        const txHash = calculateTransactionHash(prevHash, hashPayload, returnTimestamp);

        db.prepare(`
          INSERT INTO gold_ledger (
            id, transaction_hash, previous_hash, sequence_number, jeweller_id, karigar_id, order_id,
            transaction_type, weight_grams, purity_karat, pure_weight_grams, photo_evidence_url,
            perceptual_hash, signature_jeweller, signature_karigar, gps_lat, gps_lng, timestamp,
            status, initiated_by, confirmation_deadline, confirmed_at, dispute_reason, metadata, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          returnId,
          txHash,
          prevHash,
          nextSeq,
          jewellerId,
          manojId,
          progOrderId,
          'RETURN',
          47.0,
          22,
          Number(((47.0 * 22) / 24).toFixed(4)),
          returnPayload.photo_evidence_url,
          returnPayload.perceptual_hash,
          'SIG_JEW_DEMO',
          'SIG_KAR_DEMO',
          18.9553,
          72.8311,
          returnTimestamp,
          'REVIEW_REQUIRED',
          'JEWELLER',
          addDaysToDate(today, 1),
          null,
          null,
          JSON.stringify(returnPayload.metadata),
          now
        );
      }

      // 7. Recompute trust scores for all 4 karigars
      const scores = await trustScoreRepository.recalculateAll();

      const rameshScore = scores.find((s) => s.karigar_id === rameshId)?.composite_score || 4.85;
      const deepaScore = scores.find((s) => s.karigar_id === deepaId)?.composite_score || 4.10;
      const priyaScore = scores.find((s) => s.karigar_id === priyaId)?.composite_score || 4.52;
      const manojScore = scores.find((s) => s.karigar_id === manojId)?.composite_score || 3.88;

      return {
        karigarsCount: 4,
        ordersCount: 6,
        atRiskOrder: {
          id: atRiskOrderId,
          orderNumber: atRiskOrderNum,
          customerName: atRiskCustomer,
          occasionDate: atRiskOccasionDate,
          daysRemaining: 3,
          status: 'AT_RISK'
        },
        disputedSettlement: {
          id: disputedSettlementId,
          karigarName: 'Manoj Filigree (Kundan Karigar)',
          status: 'DISPUTED',
          disputeReason: 'Artisan billed ₹500/g for hand-filigree jadau; jeweller invoice calculated standard ₹450/g.'
        },
        openDispute: {
          id: demoDisputeId,
          disputeNumber: demoDisputeNumber,
          targetType: 'SETTLEMENT',
          status: 'OPENED'
        },
        trustScores: {
          rameshHigh: rameshScore,
          deepaColdStart: deepaScore,
          priya: priyaScore,
          manojDisputed: manojScore
        },
        wastageVarianceFlagged: true
      };
    } finally {
      db.pragma('foreign_keys = ON');
    }
  }
}

export const demoBazaarService = new DemoBazaarService();
