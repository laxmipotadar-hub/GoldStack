import crypto from 'node:crypto';
import {
  Dispute,
  DisputeEvidence,
  DisputeMessage,
  CreateDisputeRequest,
  AddDisputeEvidenceRequest,
  ProposeResolutionRequest,
  DisputeStatus,
  Role,
  User,
  Party
} from '../../shared/types.js';
import {
  canTransitionDispute,
  computeEvidenceDeadline,
  isEvidenceTimeoutExpired
} from '../../shared/disputeStateMachine.js';
import { canonicalStringify } from '../crypto/hashChain.js';
import { dbManager } from './index.js';
import { sqliteManager } from './sqlite.js';
import { SEED_PARTIES } from './ledgerRepository.js';
import { ledgerRepository } from './ledgerRepository.js';
import { orderRepository } from './orderRepository.js';
import { settlementRepository } from './settlementRepository.js';
import { trustScoreRepository } from './trustScoreRepository.js';
import { notificationService } from '../services/notificationService.js';

export class DisputeRepository {
  private inMemoryDisputes: Dispute[] = [];

  constructor() {
    this.ensureInitialized();
  }

  private ensureInitialized(): void {
    if (dbManager.isSqlite) {
      // Periodic check for 72h evidence window expiration
      const timer = setInterval(() => {
        this.checkEvidenceTimeouts().catch((err) => {
          console.error('[DisputeRepository] Error checking evidence timeouts:', err);
        });
      }, 60 * 1000);
      if (timer.unref) {
        timer.unref();
      }
    }
  }

  /**
   * Captures an immutable deep-copy snapshot of the target entity (Ledger Entry, Order, or Settlement)
   * and computes a cryptographic SHA-256 hash.
   */
  async captureTargetSnapshot(
    targetType: 'LEDGER_ENTRY' | 'ORDER' | 'SETTLEMENT',
    targetId: string,
    user?: User
  ): Promise<{ snapshotData: Record<string, any>; snapshotHash: string; jewellerId: string; karigarId: string }> {
    let targetData: any = null;
    let jewellerId = '';
    let karigarId = '';

    if (targetType === 'LEDGER_ENTRY') {
      const entry = await ledgerRepository.getEntryById(targetId);
      if (!entry) {
        throw new Error(`Ledger entry #${targetId} not found to raise dispute.`);
      }
      targetData = JSON.parse(JSON.stringify(entry));
      jewellerId = entry.jeweller_id;
      karigarId = entry.karigar_id;
    } else if (targetType === 'ORDER') {
      const order = await orderRepository.getOrderById(targetId, user);
      if (!order) {
        throw new Error(`Order #${targetId} not found to raise dispute.`);
      }
      targetData = JSON.parse(JSON.stringify(order));
      jewellerId = order.jeweller_id;
      karigarId = order.karigar_id;
    } else if (targetType === 'SETTLEMENT') {
      const settlement = await settlementRepository.getSettlementById(targetId, user);
      if (!settlement) {
        throw new Error(`Settlement #${targetId} not found to raise dispute.`);
      }
      targetData = JSON.parse(JSON.stringify(settlement));
      jewellerId = settlement.jeweller_id;
      karigarId = settlement.karigar_id;
    } else {
      throw new Error(`Unsupported dispute target type: ${targetType}`);
    }

    const canonicalJson = canonicalStringify(targetData);
    const snapshotHash = crypto.createHash('sha256').update(canonicalJson).digest('hex');

    return {
      snapshotData: targetData,
      snapshotHash,
      jewellerId,
      karigarId
    };
  }

  /**
   * Raises a new dispute on a ledger entry, occasion order, or job-work settlement.
   * Freezes the target state into an immutable snapshot.
   */
  async createDispute(req: CreateDisputeRequest, user: User): Promise<Dispute> {
    const { snapshotData, snapshotHash, jewellerId, karigarId } = await this.captureTargetSnapshot(
      req.target_type,
      req.target_id,
      user
    );

    // Permission check: User must be either the jeweller or the karigar involved (or a mediator)
    if (user.role === 'JEWELLER' && user.id !== jewellerId) {
      throw new Error('Access denied. You can only dispute transactions originating from your workshop.');
    }
    if (user.role === 'KARIGAR' && user.id !== karigarId) {
      throw new Error('Access denied. You can only dispute transactions assigned to your artisan account.');
    }

    const disputeId = crypto.randomUUID();
    const disputeNumber = `DISP-2026-${Date.now().toString().slice(-6)}${Math.floor(10 + Math.random() * 90)}`;
    const now = new Date().toISOString();
    const evidenceDeadline = computeEvidenceDeadline(now);

    const jewellerParty = SEED_PARTIES.find((p) => p.id === jewellerId);
    const karigarParty = SEED_PARTIES.find((p) => p.id === karigarId);

    const dispute: Dispute = {
      id: disputeId,
      dispute_number: disputeNumber,
      target_type: req.target_type,
      target_id: req.target_id,
      jeweller_id: jewellerId,
      karigar_id: karigarId,
      jeweller_name: jewellerParty?.name || 'Lalit Jewellers',
      karigar_name: karigarParty?.name || 'Artisan Goldsmith',
      raised_by: user.id,
      raised_by_name: user.name,
      raised_by_role: user.role,
      category: req.category,
      description: req.description,
      status: 'OPENED',
      evidence_deadline: evidenceDeadline,
      snapshot_data: snapshotData,
      snapshot_hash: snapshotHash,
      resolution_proposal: null,
      proposed_by: null,
      jeweller_accepted_at: null,
      karigar_accepted_at: null,
      at_fault_party: null,
      penalty_points: 0.0,
      settlement_adjustment_amount: 0.0,
      resolution_notes: null,
      resolved_at: null,
      closed_at: null,
      evidence: [],
      messages: [],
      created_at: now,
      updated_at: now
    };

    // If initial evidence provided, record it
    if (req.initial_evidence_url) {
      const fileHash = crypto.createHash('sha256').update(req.initial_evidence_url).digest('hex');
      const ev: DisputeEvidence = {
        id: crypto.randomUUID(),
        dispute_id: disputeId,
        file_url: req.initial_evidence_url,
        file_hash: fileHash,
        perceptual_hash: fileHash.slice(0, 16),
        uploaded_by: user.id,
        uploaded_by_name: user.name,
        uploaded_by_role: user.role,
        notes: req.initial_evidence_notes || 'Initial evidentiary photo/document',
        uploaded_at: now
      };
      dispute.evidence.push(ev);
    }

    // Initial system opening message
    const initialMsg: DisputeMessage = {
      id: crypto.randomUUID(),
      dispute_id: disputeId,
      sender_id: user.id,
      sender_name: user.name,
      sender_role: user.role,
      message: `[Dispute Opened] Category: ${req.category}. Target: ${req.target_type} #${req.target_id}. Immutable target snapshot captured (SHA-256: ${snapshotHash.slice(0, 12)}...). Reason: "${req.description}"`,
      created_at: now
    };
    dispute.messages.push(initialMsg);

    if (dbManager.isSqlite) {
      const db = sqliteManager.getDb();
      db.prepare(`
        INSERT INTO disputes (
          id, dispute_number, target_type, target_id, jeweller_id, karigar_id, raised_by,
          category, description, status, evidence_deadline, snapshot_data, snapshot_hash,
          penalty_points, settlement_adjustment_amount, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0.0, 0.0, ?, ?)
      `).run(
        dispute.id,
        dispute.dispute_number,
        dispute.target_type,
        dispute.target_id,
        dispute.jeweller_id,
        dispute.karigar_id,
        dispute.raised_by,
        dispute.category,
        dispute.description,
        dispute.status,
        dispute.evidence_deadline,
        JSON.stringify(dispute.snapshot_data),
        dispute.snapshot_hash,
        dispute.created_at,
        dispute.updated_at
      );

      for (const ev of dispute.evidence) {
        db.prepare(`
          INSERT INTO dispute_evidence (id, dispute_id, file_url, file_hash, perceptual_hash, uploaded_by, notes, uploaded_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(ev.id, ev.dispute_id, ev.file_url, ev.file_hash, ev.perceptual_hash, ev.uploaded_by, ev.notes, ev.uploaded_at);
      }

      for (const msg of dispute.messages) {
        db.prepare(`
          INSERT INTO dispute_messages (id, dispute_id, sender_id, sender_name, sender_role, message, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(msg.id, msg.dispute_id, msg.sender_id, msg.sender_name, msg.sender_role, msg.message, msg.created_at);
      }
    }

    this.inMemoryDisputes.unshift(dispute);

    // Notify counterparty
    const counterpartyId = user.id === jewellerId ? karigarId : jewellerId;
    const counterpartyRole = user.id === jewellerId ? 'KARIGAR' : 'JEWELLER';
    await notificationService.createInAppNotification({
      user_id: counterpartyId,
      user_role: counterpartyRole,
      title: `⚖️ नया विवाद दर्ज (Dispute Raised): #${dispute.dispute_number}`,
      message: `${user.name} ने ${req.target_type} #${req.target_id} पर आपत्ति दर्ज की है। 72 घंटे के भीतर साक्ष्य प्रस्तुत करें।`,
      severity: 'high'
    });

    return dispute;
  }

  /**
   * Fetches single dispute by ID with evidence, threaded messages, and party details.
   */
  async getDisputeById(id: string, user?: User): Promise<Dispute | null> {
    if (dbManager.isSqlite) {
      const db = sqliteManager.getDb();
      const row = db.prepare(`
        SELECT d.*,
               jp.full_name as jeweller_name,
               kp.full_name as karigar_name,
               rp.full_name as raised_by_name,
               rp.role as raised_by_role,
               pp.full_name as proposed_by_name
        FROM disputes d
        LEFT JOIN platform_parties jp ON jp.id = d.jeweller_id
        LEFT JOIN platform_parties kp ON kp.id = d.karigar_id
        LEFT JOIN platform_parties rp ON rp.id = d.raised_by
        LEFT JOIN platform_parties pp ON pp.id = d.proposed_by
        WHERE d.id = ? OR UPPER(d.dispute_number) = ?
      `).get(id, id.toUpperCase()) as any;

      if (!row) return null;

      // Access control:
      if (user) {
        if (user.role === 'KARIGAR' && row.karigar_id !== user.id) return null;
        if (user.role === 'JEWELLER' && row.jeweller_id !== user.id) return null;
      }

      const evidenceRows = db.prepare(`
        SELECT de.*, p.full_name as uploaded_by_name, p.role as uploaded_by_role
        FROM dispute_evidence de
        LEFT JOIN platform_parties p ON p.id = de.uploaded_by
        WHERE de.dispute_id = ?
        ORDER BY de.uploaded_at ASC
      `).all(row.id) as any[];

      const messageRows = db.prepare(`
        SELECT * FROM dispute_messages
        WHERE dispute_id = ?
        ORDER BY created_at ASC
      `).all(row.id) as any[];

      return {
        id: row.id,
        dispute_number: row.dispute_number,
        target_type: row.target_type,
        target_id: row.target_id,
        jeweller_id: row.jeweller_id,
        karigar_id: row.karigar_id,
        jeweller_name: row.jeweller_name,
        karigar_name: row.karigar_name,
        raised_by: row.raised_by,
        raised_by_name: row.raised_by_name,
        raised_by_role: row.raised_by_role,
        category: row.category,
        description: row.description,
        status: row.status,
        evidence_deadline: row.evidence_deadline,
        snapshot_data: typeof row.snapshot_data === 'string' ? JSON.parse(row.snapshot_data) : row.snapshot_data,
        snapshot_hash: row.snapshot_hash,
        resolution_proposal: row.resolution_proposal,
        proposed_by: row.proposed_by,
        proposed_by_name: row.proposed_by_name,
        jeweller_accepted_at: row.jeweller_accepted_at,
        karigar_accepted_at: row.karigar_accepted_at,
        at_fault_party: row.at_fault_party,
        penalty_points: Number(row.penalty_points || 0),
        settlement_adjustment_amount: Number(row.settlement_adjustment_amount || 0),
        resolution_notes: row.resolution_notes,
        resolved_at: row.resolved_at,
        closed_at: row.closed_at,
        evidence: evidenceRows.map((e) => ({
          id: e.id,
          dispute_id: e.dispute_id,
          file_url: e.file_url,
          file_hash: e.file_hash,
          perceptual_hash: e.perceptual_hash,
          uploaded_by: e.uploaded_by,
          uploaded_by_name: e.uploaded_by_name,
          uploaded_by_role: e.uploaded_by_role,
          notes: e.notes,
          uploaded_at: e.uploaded_at
        })),
        messages: messageRows.map((m) => ({
          id: m.id,
          dispute_id: m.dispute_id,
          sender_id: m.sender_id,
          sender_name: m.sender_name,
          sender_role: m.sender_role,
          message: m.message,
          created_at: m.created_at
        })),
        created_at: row.created_at,
        updated_at: row.updated_at
      };
    }

    const inMem = this.inMemoryDisputes.find((d) => d.id === id || d.dispute_number.toUpperCase() === id.toUpperCase());
    return inMem || null;
  }

  /**
   * Lists disputes with role-based filtering:
   * - Jeweller sees their workshop's disputes
   * - Karigar sees their assigned disputes
   * - Mediator sees all trade guild disputes
   */
  async getDisputes(
    filters: { status?: DisputeStatus; target_type?: string; category?: string },
    user?: User
  ): Promise<Dispute[]> {
    if (dbManager.isSqlite) {
      const db = sqliteManager.getDb();
      let query = `
        SELECT d.id
        FROM disputes d
        WHERE 1=1
      `;
      const params: any[] = [];

      if (user?.role === 'KARIGAR') {
        query += ` AND d.karigar_id = ?`;
        params.push(user.id);
      } else if (user?.role === 'JEWELLER') {
        query += ` AND d.jeweller_id = ?`;
        params.push(user.id);
      } // MEDIATOR sees all!

      if (filters.status) {
        query += ` AND d.status = ?`;
        params.push(filters.status);
      }
      if (filters.target_type) {
        query += ` AND d.target_type = ?`;
        params.push(filters.target_type);
      }
      if (filters.category) {
        query += ` AND d.category = ?`;
        params.push(filters.category);
      }

      query += ` ORDER BY d.created_at DESC`;

      const rows = db.prepare(query).all(...params) as any[];
      const list: Dispute[] = [];
      for (const r of rows) {
        const full = await this.getDisputeById(r.id, user);
        if (full) list.push(full);
      }
      return list;
    }

    return [...this.inMemoryDisputes];
  }

  /**
   * Advances the dispute through the state machine.
   * Strictly validates transition table and actor role permissions.
   */
  async transitionDispute(
    disputeId: string,
    toStatus: DisputeStatus,
    user: User | { role: 'SYSTEM'; id: string; name: string },
    reason?: string
  ): Promise<Dispute> {
    const dispute = await this.getDisputeById(disputeId);
    if (!dispute) {
      throw new Error(`Dispute ${disputeId} not found.`);
    }

    const validation = canTransitionDispute(dispute.status, toStatus, user.role);
    if (!validation.allowed) {
      throw new Error(validation.reason || `Cannot transition dispute to ${toStatus}`);
    }

    const now = new Date().toISOString();
    const oldStatus = dispute.status;
    dispute.status = toStatus;
    dispute.updated_at = now;

    if (toStatus === 'EVIDENCE') {
      dispute.evidence_deadline = computeEvidenceDeadline(now);
    } else if (toStatus === 'CLOSED') {
      dispute.closed_at = now;
    }

    // Add state change message to audit thread
    const msg: DisputeMessage = {
      id: crypto.randomUUID(),
      dispute_id: dispute.id,
      sender_id: user.id,
      sender_name: user.name,
      sender_role: user.role,
      message: `[Status Transition] ${oldStatus} ➔ ${toStatus}. Actor: ${user.name} (${user.role}). ${reason ? `Notes: "${reason}"` : ''}`,
      created_at: now
    };
    dispute.messages.push(msg);

    if (dbManager.isSqlite) {
      const db = sqliteManager.getDb();
      db.prepare(`
        UPDATE disputes
        SET status = ?, evidence_deadline = ?, closed_at = ?, updated_at = ?
        WHERE id = ?
      `).run(
        dispute.status,
        dispute.evidence_deadline || null,
        dispute.closed_at || null,
        dispute.updated_at,
        dispute.id
      );

      db.prepare(`
        INSERT INTO dispute_messages (id, dispute_id, sender_id, sender_name, sender_role, message, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(msg.id, msg.dispute_id, msg.sender_id, msg.sender_name, msg.sender_role, msg.message, msg.created_at);
    }

    return (await this.getDisputeById(dispute.id))!;
  }

  /**
   * Uploads evidence file with cryptographic SHA-256 and perceptual hash.
   */
  async addEvidence(disputeId: string, req: AddDisputeEvidenceRequest, user: User): Promise<DisputeEvidence> {
    const dispute = await this.getDisputeById(disputeId, user);
    if (!dispute) {
      throw new Error(`Dispute ${disputeId} not found or access denied.`);
    }

    if (dispute.status === 'RESOLVED' || dispute.status === 'CLOSED') {
      throw new Error(`Cannot submit evidence to a ${dispute.status} dispute.`);
    }

    const now = new Date().toISOString();
    const fileHash = req.file_hash || crypto.createHash('sha256').update(req.file_url).digest('hex');
    const perceptualHash = req.perceptual_hash || fileHash.slice(0, 16);

    const ev: DisputeEvidence = {
      id: crypto.randomUUID(),
      dispute_id: dispute.id,
      file_url: req.file_url,
      file_hash: fileHash,
      perceptual_hash: perceptualHash,
      uploaded_by: user.id,
      uploaded_by_name: user.name,
      uploaded_by_role: user.role,
      notes: req.notes,
      uploaded_at: now
    };

    const msg: DisputeMessage = {
      id: crypto.randomUUID(),
      dispute_id: dispute.id,
      sender_id: user.id,
      sender_name: user.name,
      sender_role: user.role,
      message: `[Evidence Uploaded] ${user.name} submitted evidence file. SHA-256: ${fileHash.slice(0, 12)}... ${req.notes ? `Notes: "${req.notes}"` : ''}`,
      created_at: now
    };

    if (dbManager.isSqlite) {
      const db = sqliteManager.getDb();
      db.prepare(`
        INSERT INTO dispute_evidence (id, dispute_id, file_url, file_hash, perceptual_hash, uploaded_by, notes, uploaded_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(ev.id, ev.dispute_id, ev.file_url, ev.file_hash, ev.perceptual_hash, ev.uploaded_by, ev.notes || null, ev.uploaded_at);

      db.prepare(`
        INSERT INTO dispute_messages (id, dispute_id, sender_id, sender_name, sender_role, message, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(msg.id, msg.dispute_id, msg.sender_id, msg.sender_name, msg.sender_role, msg.message, msg.created_at);
    }

    return ev;
  }

  /**
   * Adds threaded in-dispute chat message between Jeweller, Karigar, and Mediator.
   */
  async addMessage(disputeId: string, messageText: string, user: User): Promise<DisputeMessage> {
    const dispute = await this.getDisputeById(disputeId, user);
    if (!dispute) {
      throw new Error(`Dispute ${disputeId} not found or access denied.`);
    }

    const now = new Date().toISOString();
    const msg: DisputeMessage = {
      id: crypto.randomUUID(),
      dispute_id: dispute.id,
      sender_id: user.id,
      sender_name: user.name,
      sender_role: user.role,
      message: messageText,
      created_at: now
    };

    if (dbManager.isSqlite) {
      const db = sqliteManager.getDb();
      db.prepare(`
        INSERT INTO dispute_messages (id, dispute_id, sender_id, sender_name, sender_role, message, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(msg.id, msg.dispute_id, msg.sender_id, msg.sender_name, msg.sender_role, msg.message, msg.created_at);
    }

    return msg;
  }

  /**
   * Mediator proposes resolution terms (financial adjustment & fault/penalty points).
   * Transitions status to RESOLUTION_PROPOSED.
   */
  async proposeResolution(disputeId: string, req: ProposeResolutionRequest, user: User): Promise<Dispute> {
    if (user.role !== 'MEDIATOR') {
      throw new Error('Access denied. Only registered Trade Guild Mediators can propose formal resolution terms.');
    }

    const dispute = await this.getDisputeById(disputeId);
    if (!dispute) {
      throw new Error(`Dispute ${disputeId} not found.`);
    }

    // Must be in REVIEW or MEDIATION
    if (dispute.status !== 'REVIEW' && dispute.status !== 'MEDIATION') {
      throw new Error(`Cannot propose resolution when dispute is in ${dispute.status} status. Move to MEDIATION first.`);
    }

    const now = new Date().toISOString();
    dispute.status = 'RESOLUTION_PROPOSED';
    dispute.resolution_proposal = req.resolution_proposal;
    dispute.at_fault_party = req.at_fault_party || 'NONE';
    dispute.penalty_points = req.penalty_points ?? 0.0;
    dispute.settlement_adjustment_amount = req.settlement_adjustment_amount ?? 0.0;
    dispute.resolution_notes = req.resolution_notes || null;
    dispute.proposed_by = user.id;
    dispute.proposed_by_name = user.name;
    dispute.jeweller_accepted_at = null; // reset acceptances for new proposal
    dispute.karigar_accepted_at = null;
    dispute.updated_at = now;

    const msg: DisputeMessage = {
      id: crypto.randomUUID(),
      dispute_id: dispute.id,
      sender_id: user.id,
      sender_name: user.name,
      sender_role: 'MEDIATOR',
      message: `[Resolution Terms Proposed by Mediator ${user.name}] "${req.resolution_proposal}". At-Fault: ${dispute.at_fault_party}. Penalty: ${dispute.penalty_points} pts. Settlement Adjustment: ₹${dispute.settlement_adjustment_amount}. Awaiting acceptance by both parties.`,
      created_at: now
    };

    if (dbManager.isSqlite) {
      const db = sqliteManager.getDb();
      db.prepare(`
        UPDATE disputes
        SET status = 'RESOLUTION_PROPOSED', resolution_proposal = ?, at_fault_party = ?,
            penalty_points = ?, settlement_adjustment_amount = ?, resolution_notes = ?,
            proposed_by = ?, jeweller_accepted_at = NULL, karigar_accepted_at = NULL, updated_at = ?
        WHERE id = ?
      `).run(
        dispute.resolution_proposal,
        dispute.at_fault_party,
        dispute.penalty_points,
        dispute.settlement_adjustment_amount,
        dispute.resolution_notes,
        dispute.proposed_by,
        now,
        dispute.id
      );

      db.prepare(`
        INSERT INTO dispute_messages (id, dispute_id, sender_id, sender_name, sender_role, message, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(msg.id, msg.dispute_id, msg.sender_id, msg.sender_name, msg.sender_role, msg.message, msg.created_at);
    }

    // Alert both Jeweller and Karigar
    await notificationService.createInAppNotification({
      user_id: dispute.jeweller_id,
      user_role: 'JEWELLER',
      title: `⚖️ मध्यस्थता समाधान प्रस्तुत (Resolution Proposed): #${dispute.dispute_number}`,
      message: `मध्यस्थ ${user.name} ने समाधान शर्तें प्रस्तुत की हैं। कृपया समीक्षा कर स्वीकार या अस्वीकार करें।`,
      severity: 'high'
    });

    await notificationService.createInAppNotification({
      user_id: dispute.karigar_id,
      user_role: 'KARIGAR',
      title: `⚖️ मध्यस्थता समाधान प्रस्तुत (Resolution Proposed): #${dispute.dispute_number}`,
      message: `मध्यस्थ ${user.name} ने समाधान शर्तें प्रस्तुत की हैं। कृपया समीक्षा कर स्वीकार या अस्वीकार करें।`,
      severity: 'high'
    });

    return (await this.getDisputeById(dispute.id))!;
  }

  /**
   * Party responds to proposed resolution (ACCEPT or REJECT).
   * When both parties accept -> status transitions to RESOLVED and auto side-effects are triggered.
   */
  async respondResolution(
    disputeId: string,
    action: 'ACCEPT' | 'REJECT',
    user: User,
    rejectionReason?: string
  ): Promise<Dispute> {
    const dispute = await this.getDisputeById(disputeId, user);
    if (!dispute) {
      throw new Error(`Dispute ${disputeId} not found or access denied.`);
    }

    if (dispute.status !== 'RESOLUTION_PROPOSED') {
      throw new Error(`Cannot respond to resolution when dispute is in ${dispute.status} status.`);
    }

    const now = new Date().toISOString();

    if (action === 'REJECT') {
      // Reverts back to MEDIATION
      dispute.status = 'MEDIATION';
      dispute.jeweller_accepted_at = null;
      dispute.karigar_accepted_at = null;
      dispute.updated_at = now;

      const rejectMsg: DisputeMessage = {
        id: crypto.randomUUID(),
        dispute_id: dispute.id,
        sender_id: user.id,
        sender_name: user.name,
        sender_role: user.role,
        message: `[Proposal Rejected] ${user.name} (${user.role}) rejected the resolution terms. Reason: "${rejectionReason || 'Terms unacceptable'}". Reverted to MEDIATION for redrafting.`,
        created_at: now
      };

      if (dbManager.isSqlite) {
        const db = sqliteManager.getDb();
        db.prepare(`
          UPDATE disputes
          SET status = 'MEDIATION', jeweller_accepted_at = NULL, karigar_accepted_at = NULL, updated_at = ?
          WHERE id = ?
        `).run(now, dispute.id);

        db.prepare(`
          INSERT INTO dispute_messages (id, dispute_id, sender_id, sender_name, sender_role, message, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(rejectMsg.id, rejectMsg.dispute_id, rejectMsg.sender_id, rejectMsg.sender_name, rejectMsg.sender_role, rejectMsg.message, rejectMsg.created_at);
      }

      return (await this.getDisputeById(dispute.id))!;
    }

    // Action is ACCEPT:
    if (user.role === 'JEWELLER') {
      if (dispute.jeweller_id !== user.id) {
        throw new Error('Access denied. You can only accept for your own business.');
      }
      dispute.jeweller_accepted_at = now;
    } else if (user.role === 'KARIGAR') {
      if (dispute.karigar_id !== user.id) {
        throw new Error('Access denied. You can only accept for your artisan account.');
      }
      dispute.karigar_accepted_at = now;
    } else if (user.role === 'MEDIATOR') {
      // Mediator cannot accept on behalf of disputing parties
      throw new Error('Only the disputing parties (Jeweller & Karigar) can accept resolution terms.');
    }

    const acceptMsg: DisputeMessage = {
      id: crypto.randomUUID(),
      dispute_id: dispute.id,
      sender_id: user.id,
      sender_name: user.name,
      sender_role: user.role,
      message: `[Terms Accepted] ${user.name} (${user.role}) formally accepted proposed resolution terms.`,
      created_at: now
    };

    // Check if BOTH parties have accepted:
    const isFullyAccepted = Boolean(dispute.jeweller_accepted_at && dispute.karigar_accepted_at);

    if (isFullyAccepted) {
      dispute.status = 'RESOLVED';
      dispute.resolved_at = now;
      dispute.updated_at = now;

      // ==========================================
      // AUTOMATIC SIDE-EFFECTS EXECUTION
      // ==========================================

      // 1. If Settlement Dispute -> Adjust settlement net payable
      if (dispute.target_type === 'SETTLEMENT' && dispute.settlement_adjustment_amount !== 0) {
        try {
          await settlementRepository.adjustSettlement(
            dispute.target_id,
            dispute.settlement_adjustment_amount,
            `Dispute #${dispute.dispute_number} resolution adjustment: ${dispute.resolution_proposal}`
          );
        } catch (err) {
          console.error('[DisputeRepository] Error executing settlement adjustment side-effect:', err);
        }
      }

      // 2. Apply Trust Score Penalty to at-fault Karigar via Phase 5 engine
      if (
        (dispute.at_fault_party === 'KARIGAR' || dispute.at_fault_party === 'SPLIT') &&
        dispute.penalty_points > 0
      ) {
        try {
          await trustScoreRepository.applyPenalty(dispute.karigar_id, dispute.penalty_points);
        } catch (err) {
          console.error('[DisputeRepository] Error executing trust score penalty side-effect:', err);
        }
      }

      // 3. System resolved message
      const resolvedMsg: DisputeMessage = {
        id: crypto.randomUUID(),
        dispute_id: dispute.id,
        sender_id: 'SYSTEM',
        sender_name: 'GoldStack Mediation Engine',
        sender_role: 'SYSTEM',
        message: `[DISPUTE RESOLVED] Dual acceptance completed. Status: RESOLVED. Side effects executed: Financial adjustment = ₹${dispute.settlement_adjustment_amount}, Trust score penalty = ${dispute.penalty_points} pts to ${dispute.at_fault_party}.`,
        created_at: now
      };

      if (dbManager.isSqlite) {
        const db = sqliteManager.getDb();
        db.prepare(`
          UPDATE disputes
          SET status = 'RESOLVED', jeweller_accepted_at = ?, karigar_accepted_at = ?,
              resolved_at = ?, updated_at = ?
          WHERE id = ?
        `).run(dispute.jeweller_accepted_at, dispute.karigar_accepted_at, now, now, dispute.id);

        db.prepare(`
          INSERT INTO dispute_messages (id, dispute_id, sender_id, sender_name, sender_role, message, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(acceptMsg.id, acceptMsg.dispute_id, acceptMsg.sender_id, acceptMsg.sender_name, acceptMsg.sender_role, acceptMsg.message, acceptMsg.created_at);

        db.prepare(`
          INSERT INTO dispute_messages (id, dispute_id, sender_id, sender_name, sender_role, message, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(resolvedMsg.id, resolvedMsg.dispute_id, resolvedMsg.sender_id, resolvedMsg.sender_name, resolvedMsg.sender_role, resolvedMsg.message, resolvedMsg.created_at);
      }
    } else {
      // Only one party has accepted so far
      dispute.updated_at = now;
      if (dbManager.isSqlite) {
        const db = sqliteManager.getDb();
        db.prepare(`
          UPDATE disputes
          SET jeweller_accepted_at = ?, karigar_accepted_at = ?, updated_at = ?
          WHERE id = ?
        `).run(dispute.jeweller_accepted_at || null, dispute.karigar_accepted_at || null, now, dispute.id);

        db.prepare(`
          INSERT INTO dispute_messages (id, dispute_id, sender_id, sender_name, sender_role, message, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(acceptMsg.id, acceptMsg.dispute_id, acceptMsg.sender_id, acceptMsg.sender_name, acceptMsg.sender_role, acceptMsg.message, acceptMsg.created_at);
      }
    }

    return (await this.getDisputeById(dispute.id))!;
  }

  /**
   * Cryptographically verifies the frozen snapshot against its SHA-256 hash
   * ensuring evidence and facts cannot change under the dispute.
   */
  async verifyDisputeSnapshot(disputeId: string): Promise<{ isValid: boolean; expectedHash: string; computedHash: string }> {
    const dispute = await this.getDisputeById(disputeId);
    if (!dispute) {
      throw new Error(`Dispute ${disputeId} not found.`);
    }

    const canonicalJson = canonicalStringify(dispute.snapshot_data);
    const computedHash = crypto.createHash('sha256').update(canonicalJson).digest('hex');
    const isValid = computedHash === dispute.snapshot_hash;

    return {
      isValid,
      expectedHash: dispute.snapshot_hash,
      computedHash
    };
  }

  /**
   * Checks for expired 72-hour EVIDENCE collection windows and auto-advances to REVIEW.
   */
  async checkEvidenceTimeouts(): Promise<number> {
    if (!dbManager.isSqlite) return 0;
    const db = sqliteManager.getDb();

    const expiredRows = db.prepare(`
      SELECT id, status, evidence_deadline
      FROM disputes
      WHERE status = 'EVIDENCE' AND datetime(evidence_deadline) < datetime('now')
    `).all() as any[];

    let autoAdvancedCount = 0;
    for (const r of expiredRows) {
      try {
        await this.transitionDispute(r.id, 'REVIEW', {
          role: 'SYSTEM',
          id: 'SYSTEM',
          name: '72h Auto-Timeout Daemon'
        }, '72-hour evidence window expired; auto-advanced to REVIEW.');
        autoAdvancedCount++;
      } catch (err) {
        console.error(`[DisputeRepository] Failed to auto-advance dispute ${r.id}:`, err);
      }
    }

    return autoAdvancedCount;
  }
}

export const disputeRepository = new DisputeRepository();
