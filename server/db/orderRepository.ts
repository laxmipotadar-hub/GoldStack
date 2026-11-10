import crypto from 'node:crypto';
import {
  CustomerOrder,
  Milestone,
  CreateOrderRequest,
  CompleteMilestoneRequest,
  DelayMilestoneRequest,
  OrderDesignComplexity,
  OrderStatus,
  MilestoneStatus,
  OccasionType,
  User,
  Party,
  OrderEvent,
  Role
} from '../../shared/types.js';
import {
  calculateCpmSchedule,
  recomputeDelayCascade,
  getStandardMilestoneTemplates,
  diffDays,
  addDaysToDate,
  CpmMilestoneInput,
  CpmCalculatedNode
} from '../../shared/cpmEngine.js';
import { calculateOrderRiskScore, RiskScoreResult } from '../../shared/riskScoring.js';
import { notificationService } from '../services/notificationService.js';
import { dbManager } from './index.js';
import { sqliteManager } from './sqlite.js';
import { trustScoreRepository } from './trustScoreRepository.js';

const ENCRYPTION_KEY = Buffer.from(
  process.env.CUSTOMER_DATA_KEY || 'koshish-goldstack-customer-key-32b',
  'utf8'
).subarray(0, 32);

export function encryptCustomerName(name: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(name, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return `${iv.toString('hex')}:${encrypted}`;
}

export function decryptCustomerName(encryptedText: string): string {
  try {
    const [ivHex, cipherText] = encryptedText.split(':');
    if (!ivHex || !cipherText) return encryptedText;
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
    let decrypted = decipher.update(cipherText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch {
    return encryptedText;
  }
}

export class OrderRepository {
  private inMemoryOrders: CustomerOrder[] = [];
  private inMemoryMilestones: Map<string, Milestone[]> = new Map();
  private inMemoryEvents: Map<string, OrderEvent[]> = new Map();
  private initialized = false;

  async init(): Promise<void> {
    if (this.initialized) return;

    if (dbManager.isSqlite) {
      sqliteManager.getDb();
      await this.seedInitialOrdersIfEmpty();
    } else {
      this.seedInMemory();
    }

    this.initialized = true;
  }

  private async seedInitialOrdersIfEmpty(): Promise<void> {
    const db = sqliteManager.getDb();
    const countRow = db.prepare('SELECT count(*) as count FROM orders').get() as { count: number };
    if (countRow && countRow.count > 0) return;

    const jewellerId = '11111111-1111-1111-1111-111111111111'; // Lalit
    const karigar1Id = '22222222-2222-2222-2222-222222222222'; // Ramesh
    const karigar2Id = '33333333-3333-3333-3333-333333333333'; // Priya

    // Calculate dates relative to today
    const today = new Date().toISOString().split('T')[0];
    const weddingDate1 = addDaysToDate(today, 25); // Wedding in 25 days
    const weddingDate2 = addDaysToDate(today, 12); // Urgent Wedding in 12 days
    const festivalDate = addDaysToDate(today, 40); // Diwali festival in 40 days

    // Seed 1: Bridal Choker Wedding Set (ORD-2026-901) - INTRICATE, Ramesh Soni
    await this.createOrder(
      {
        order_number: 'ORD-2026-901',
        karigar_id: karigar1Id,
        customer_name: 'Ananya Sharma (Royal Rajput Wedding Haar)',
        occasion_type: 'WEDDING',
        occasion_date: weddingDate2,
        design_complexity: 'INTRICATE',
        item_description: '22K Kundan Jadau Polki Haar Set with Chasing Work',
        target_weight_grams: 150.0,
        delivery_buffer_days: 1
      },
      { id: jewellerId, role: 'JEWELLER', name: 'Lalit Soni', phone: '+91 98201 12345' }
    );

    // Seed 2: Wedding Bands (ORD-2026-881) - SIMPLE, Ramesh Soni
    await this.createOrder(
      {
        order_number: 'ORD-2026-881',
        karigar_id: karigar1Id,
        customer_name: 'Sneha & Rohan Parekh (Vivah Rings)',
        occasion_type: 'WEDDING',
        occasion_date: weddingDate1,
        design_complexity: 'SIMPLE',
        item_description: 'Matching Pair of 22K Solid Cast Wedding Bands',
        target_weight_grams: 35.0,
        delivery_buffer_days: 2
      },
      { id: jewellerId, role: 'JEWELLER', name: 'Lalit Soni', phone: '+91 98201 12345' }
    );

    // Seed 3: Antique Filigree Haar (ORD-2026-882) - COMPLEX, Priya Goldsmith
    await this.createOrder(
      {
        order_number: 'ORD-2026-882',
        karigar_id: karigar2Id,
        customer_name: 'Vikram Singhania (Aarti Festival Ornament)',
        occasion_type: 'FESTIVAL',
        occasion_date: festivalDate,
        design_complexity: 'COMPLEX',
        item_description: '22K Antique Filigree Link Choker with Pearl Drops',
        target_weight_grams: 85.0,
        delivery_buffer_days: 2
      },
      { id: jewellerId, role: 'JEWELLER', name: 'Lalit Soni', phone: '+91 98201 12345' }
    );
  }

  private seedInMemory(): void {
    // In-memory fallback if needed
  }

  /**
   * Creates a new customer occasion order with auto-generated CPM milestones
   */
  async createOrder(req: CreateOrderRequest, user: User): Promise<CustomerOrder> {
    const id = crypto.randomUUID();
    const orderNumber = req.order_number || `ORD-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`;
    const encryptedCustomer = encryptCustomerName(req.customer_name);
    const bufferDays = req.delivery_buffer_days ?? 1;
    const now = new Date().toISOString();

    // 1. Generate standard milestone templates scaled by design complexity
    const templates = getStandardMilestoneTemplates(req.design_complexity);

    // Map template milestones with IDs and dependency linking
    const rawMilestones: CpmMilestoneInput[] = [];
    const idMap = new Map<number, string>();

    templates.forEach((t, index) => {
      const mid = `m-${id.slice(0, 8)}-${index + 1}`;
      idMap.set(t.sequence, mid);
    });

    templates.forEach((t) => {
      const mid = idMap.get(t.sequence)!;
      const deps = t.sequence > 1 && idMap.has(t.sequence - 1) ? [idMap.get(t.sequence - 1)!] : [];
      rawMilestones.push({
        id: mid,
        name: t.name,
        name_hi: t.name_hi,
        sequence: t.sequence,
        duration_days: t.duration_days,
        dependencies: deps,
        status: t.sequence === 1 ? 'IN_PROGRESS' : 'PENDING'
      });
    });

    // 2. Run Critical Path Method (CPM) and Reverse Scheduling from Occasion Date
    const cpmResult = calculateCpmSchedule(rawMilestones, req.occasion_date, bufferDays);

    const todayStr = new Date().toISOString().split('T')[0];
    const daysToOccasion = diffDays(todayStr, req.occasion_date);
    const terminalNode = cpmResult.milestones[cpmResult.milestones.length - 1];
    const bufferRemaining = diffDays(terminalNode ? terminalNode.planned_date : req.occasion_date, req.occasion_date);
    const isAtRisk = bufferRemaining < 0;

    const onTimeRate = this.getKarigarOnTimeRateSync(req.karigar_id);
    const risk = calculateOrderRiskScore({
      daysRemaining: daysToOccasion,
      totalMilestones: rawMilestones.length,
      completedMilestones: 0,
      delayedMilestones: isAtRisk ? 1 : 0,
      karigarHistoricalOnTimeRate: onTimeRate
    });

    let initialStatus: OrderStatus = 'ON_TRACK';
    if (bufferRemaining < 0) {
      initialStatus = 'DELAYED';
    } else if (risk.level === 'HIGH' || isAtRisk) {
      initialStatus = 'AT_RISK';
    }

    const order: CustomerOrder = {
      id,
      order_number: orderNumber,
      jeweller_id: user.id,
      karigar_id: req.karigar_id,
      customer_name: req.customer_name,
      customer_name_encrypted: encryptedCustomer,
      occasion_type: req.occasion_type,
      occasion_date: req.occasion_date,
      design_complexity: req.design_complexity,
      status: initialStatus,
      item_description: req.item_description,
      target_weight_grams: req.target_weight_grams,
      milestones: cpmResult.milestones as Milestone[],
      critical_path: cpmResult.criticalPath,
      days_to_occasion: daysToOccasion,
      is_at_risk: isAtRisk || initialStatus === 'AT_RISK' || initialStatus === 'DELAYED',
      buffer_days_remaining: bufferRemaining,
      risk_score: risk.score,
      risk_level: risk.level,
      risk_factors: risk.factors,
      risk_summary: risk.summary,
      risk_recommendation: risk.recommendation,
      created_at: now,
      updated_at: now
    };

    // Save to SQLite
    if (dbManager.isSqlite) {
      const db = sqliteManager.getDb();
      const insertOrder = db.prepare(`
        INSERT INTO orders (
          id, order_number, jeweller_id, karigar_id, customer_name_encrypted,
          occasion_type, occasion_date, design_complexity, status,
          item_description, target_weight_grams, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const insertMilestone = db.prepare(`
        INSERT INTO milestones (
          id, order_id, name, name_hi, sequence, duration_days, dependencies,
          status, planned_start_date, planned_date, actual_date,
          earliest_start, earliest_finish, latest_start, latest_finish,
          slack, is_critical, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const tx = db.transaction(() => {
        insertOrder.run(
          order.id,
          order.order_number,
          order.jeweller_id,
          order.karigar_id,
          order.customer_name_encrypted,
          order.occasion_type,
          order.occasion_date,
          order.design_complexity,
          order.status,
          order.item_description || null,
          order.target_weight_grams || null,
          order.created_at,
          order.updated_at
        );

        for (const m of cpmResult.milestones) {
          insertMilestone.run(
            m.id,
            order.id,
            m.name,
            m.name_hi || null,
            m.sequence,
            m.duration_days,
            JSON.stringify(m.dependencies),
            m.status || 'PENDING',
            m.planned_start_date,
            m.planned_date,
            m.actual_date || null,
            m.earliest_start,
            m.earliest_finish,
            m.latest_start,
            m.latest_finish,
            m.slack,
            m.is_critical ? 1 : 0,
            now,
            now
          );
        }
      });

      tx();
    }

    this.inMemoryOrders.unshift(order);
    this.inMemoryMilestones.set(order.id, cpmResult.milestones as Milestone[]);

    // Record initial order state transition in order_events audit trail
    await this.recordOrderEvent({
      order_id: order.id,
      from_status: 'NEW',
      to_status: order.status,
      trigger_reason: 'Order created with reverse-scheduled milestone CPM',
      risk_score: risk.score,
      risk_level: risk.level,
      actor_id: user.id,
      actor_role: user.role
    });

    if (order.status === 'AT_RISK' || order.status === 'DELAYED') {
      await notificationService.notifyOrderRisk({
        recipientId: order.karigar_id,
        recipientRole: 'KARIGAR',
        orderId: order.id,
        orderNumber: order.order_number,
        occasionType: order.occasion_type,
        daysToOccasion: daysToOccasion,
        message: risk.summary,
        urgencyLevel: order.status === 'DELAYED' ? 'CRITICAL' : 'WARNING'
      });
    }

    return order;
  }

  /**
   * Records a state transition or critical milestone event into order_events
   */
  async recordOrderEvent(event: {
    order_id: string;
    from_status: string;
    to_status: string;
    trigger_reason: string;
    risk_score?: number;
    risk_level?: 'LOW' | 'MEDIUM' | 'HIGH';
    actor_id?: string;
    actor_role?: Role | 'SYSTEM';
    metadata?: Record<string, unknown>;
  }): Promise<OrderEvent> {
    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const orderEvent: OrderEvent = {
      id,
      order_id: event.order_id,
      from_status: event.from_status,
      to_status: event.to_status,
      trigger_reason: event.trigger_reason,
      risk_score: event.risk_score,
      risk_level: event.risk_level,
      actor_id: event.actor_id,
      actor_role: event.actor_role,
      metadata: event.metadata,
      created_at: createdAt
    };

    if (dbManager.isSqlite) {
      try {
        const db = sqliteManager.getDb();
        db.prepare(`
          INSERT INTO order_events (
            id, order_id, from_status, to_status, trigger_reason,
            risk_score, risk_level, actor_id, actor_role, metadata, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          orderEvent.id,
          orderEvent.order_id,
          orderEvent.from_status,
          orderEvent.to_status,
          orderEvent.trigger_reason,
          orderEvent.risk_score ?? null,
          orderEvent.risk_level ?? null,
          orderEvent.actor_id ?? null,
          orderEvent.actor_role ?? null,
          orderEvent.metadata ? JSON.stringify(orderEvent.metadata) : null,
          orderEvent.created_at
        );
      } catch (err) {
        console.error('[OrderRepository] Failed to insert into order_events:', err);
      }
    }

    if (!this.inMemoryEvents.has(event.order_id)) {
      this.inMemoryEvents.set(event.order_id, []);
    }
    this.inMemoryEvents.get(event.order_id)!.unshift(orderEvent);

    return orderEvent;
  }

  /**
   * Retrieves escalation events audit trail for an order
   */
  async getOrderEvents(orderId: string, user?: User): Promise<OrderEvent[]> {
    if (dbManager.isSqlite) {
      try {
        const db = sqliteManager.getDb();
        const rows = db.prepare(`
          SELECT * FROM order_events WHERE order_id = ? ORDER BY created_at DESC
        `).all(orderId) as any[];

        return rows.map((r) => ({
          id: r.id,
          order_id: r.order_id,
          from_status: r.from_status,
          to_status: r.to_status,
          trigger_reason: r.trigger_reason,
          risk_score: r.risk_score !== null ? Number(r.risk_score) : undefined,
          risk_level: r.risk_level,
          actor_id: r.actor_id,
          actor_role: r.actor_role,
          metadata: r.metadata ? JSON.parse(r.metadata) : undefined,
          created_at: r.created_at
        }));
      } catch (err) {
        console.error('[OrderRepository] Failed to fetch events from SQLite:', err);
      }
    }

    return this.inMemoryEvents.get(orderId) || [];
  }

  /**
   * Computes karigar historical on-time delivery rate from delivered orders
   */
  getKarigarOnTimeRateSync(karigarId: string): number {
    if (dbManager.isSqlite) {
      try {
        const db = sqliteManager.getDb();
        const rows = db.prepare(`
          SELECT o.occasion_date, m.actual_date
          FROM orders o
          JOIN milestones m ON m.order_id = o.id
          WHERE o.karigar_id = ? AND o.status = 'DELIVERED'
            AND m.sequence = (SELECT MAX(sequence) FROM milestones WHERE order_id = o.id)
        `).all(karigarId) as any[];

        if (rows.length === 0) return 0.85;

        let onTime = 0;
        for (const r of rows) {
          if (!r.actual_date || r.actual_date <= r.occasion_date) {
            onTime++;
          }
        }
        return Number((onTime / rows.length).toFixed(4));
      } catch {
        return 0.85;
      }
    }
    return 0.85;
  }

  /**
   * Directly updates order status in storage
   */
  private updateOrderStatusDirect(orderId: string, status: OrderStatus): void {
    const now = new Date().toISOString();
    if (dbManager.isSqlite) {
      try {
        const db = sqliteManager.getDb();
        db.prepare('UPDATE orders SET status = ?, updated_at = ? WHERE id = ?').run(status, now, orderId);
      } catch (err) {
        console.error('[OrderRepository] Failed to update order status:', err);
      }
    }
    const inMem = this.inMemoryOrders.find((o) => o.id === orderId);
    if (inMem) {
      inMem.status = status;
      inMem.updated_at = now;
    }
  }

  /**
   * Retrieves all orders accessible to the user (Data Ownership: Jewellers see theirs; Karigars see only theirs)
   */
  async getOrders(
    filters: { status?: OrderStatus; occasion_type?: OccasionType },
    user?: User
  ): Promise<CustomerOrder[]> {
    let orders: CustomerOrder[] = [];

    if (dbManager.isSqlite) {
      const db = sqliteManager.getDb();
      let query = `
        SELECT o.*,
               jp.full_name as jeweller_name,
               kp.full_name as karigar_name
        FROM orders o
        LEFT JOIN platform_parties jp ON jp.id = o.jeweller_id
        LEFT JOIN platform_parties kp ON kp.id = o.karigar_id
        WHERE 1=1
      `;
      const params: any[] = [];

      // Data ownership enforcement
      if (user?.role === 'KARIGAR') {
        query += ` AND o.karigar_id = ?`;
        params.push(user.id);
      } else if (user?.role === 'JEWELLER') {
        query += ` AND o.jeweller_id = ?`;
        params.push(user.id);
      }

      if (filters.status) {
        query += ` AND o.status = ?`;
        params.push(filters.status);
      }
      if (filters.occasion_type) {
        query += ` AND o.occasion_type = ?`;
        params.push(filters.occasion_type);
      }

      query += ` ORDER BY o.occasion_date ASC, o.created_at DESC`;

      const rows = db.prepare(query).all(...params) as any[];

      const selectMilestones = db.prepare(`
        SELECT * FROM milestones WHERE order_id = ? ORDER BY sequence ASC
      `);

      orders = rows.map((r) => {
        const msRows = selectMilestones.all(r.id) as any[];
        const milestones: Milestone[] = msRows.map((m) => ({
          ...m,
          dependencies: typeof m.dependencies === 'string' ? JSON.parse(m.dependencies || '[]') : m.dependencies || [],
          is_critical: Boolean(m.is_critical)
        }));

        const todayStr = new Date().toISOString().split('T')[0];
        const daysToOccasion = diffDays(todayStr, r.occasion_date);
        const criticalPath = milestones.filter((m) => m.is_critical).map((m) => m.id);
        const terminalNode = milestones[milestones.length - 1];
        const bufferRemaining = diffDays(terminalNode ? terminalNode.planned_date : r.occasion_date, r.occasion_date);

        const completedCount = milestones.filter((m) => m.status === 'COMPLETED').length;
        const delayedCount = milestones.filter((m) => m.status === 'DELAYED' || (m.slack !== undefined && m.slack < 0)).length;
        const onTimeRate = this.getKarigarOnTimeRateSync(r.karigar_id);

        const risk = calculateOrderRiskScore({
          daysRemaining: daysToOccasion,
          totalMilestones: milestones.length,
          completedMilestones: completedCount,
          delayedMilestones: delayedCount,
          karigarHistoricalOnTimeRate: onTimeRate
        });

        let currentStatus = r.status as OrderStatus;

        // Auto-transition state machine if status change detected
        if (currentStatus === 'ON_TRACK' || currentStatus === 'ACTIVE') {
          if (bufferRemaining < 0) {
            currentStatus = 'DELAYED';
            this.updateOrderStatusDirect(r.id, 'DELAYED');
            this.recordOrderEvent({
              order_id: r.id,
              from_status: r.status,
              to_status: 'DELAYED',
              trigger_reason: `Buffer breach (${bufferRemaining} days). Occasion delivery date compromised.`,
              risk_score: risk.score,
              risk_level: 'HIGH',
              actor_role: 'SYSTEM'
            });
            notificationService.notifyOrderRisk({
              recipientId: r.karigar_id,
              recipientRole: 'KARIGAR',
              orderId: r.id,
              orderNumber: r.order_number,
              occasionType: r.occasion_type,
              daysToOccasion: daysToOccasion,
              message: risk.summary,
              urgencyLevel: 'CRITICAL'
            });
          } else if (risk.level === 'HIGH' || delayedCount > 0) {
            currentStatus = 'AT_RISK';
            this.updateOrderStatusDirect(r.id, 'AT_RISK');
            this.recordOrderEvent({
              order_id: r.id,
              from_status: r.status,
              to_status: 'AT_RISK',
              trigger_reason: `Elevated risk probability (${risk.percentage}%) or milestone overdue`,
              risk_score: risk.score,
              risk_level: risk.level,
              actor_role: 'SYSTEM'
            });
            notificationService.notifyOrderRisk({
              recipientId: r.karigar_id,
              recipientRole: 'KARIGAR',
              orderId: r.id,
              orderNumber: r.order_number,
              occasionType: r.occasion_type,
              daysToOccasion: daysToOccasion,
              message: risk.summary,
              urgencyLevel: 'WARNING'
            });
          }
        } else if (currentStatus === 'AT_RISK' && bufferRemaining < 0) {
          currentStatus = 'DELAYED';
          this.updateOrderStatusDirect(r.id, 'DELAYED');
          this.recordOrderEvent({
            order_id: r.id,
            from_status: 'AT_RISK',
            to_status: 'DELAYED',
            trigger_reason: `Critical path delay breached occasion date buffer (${bufferRemaining} days)`,
            risk_score: risk.score,
            risk_level: 'HIGH',
            actor_role: 'SYSTEM'
          });
          notificationService.notifyOrderRisk({
            recipientId: r.karigar_id,
            recipientRole: 'KARIGAR',
            orderId: r.id,
            orderNumber: r.order_number,
            occasionType: r.occasion_type,
            daysToOccasion: daysToOccasion,
            message: risk.summary,
            urgencyLevel: 'CRITICAL'
          });
        }

        return {
          id: r.id,
          order_number: r.order_number,
          jeweller_id: r.jeweller_id,
          karigar_id: r.karigar_id,
          jeweller_name: r.jeweller_name,
          karigar_name: r.karigar_name,
          customer_name: decryptCustomerName(r.customer_name_encrypted),
          customer_name_encrypted: r.customer_name_encrypted,
          occasion_type: r.occasion_type as OccasionType,
          occasion_date: r.occasion_date,
          design_complexity: r.design_complexity as OrderDesignComplexity,
          status: currentStatus,
          item_description: r.item_description,
          target_weight_grams: r.target_weight_grams,
          milestones,
          critical_path: criticalPath,
          days_to_occasion: daysToOccasion,
          is_at_risk: currentStatus === 'AT_RISK' || currentStatus === 'DELAYED' || bufferRemaining < 0,
          buffer_days_remaining: bufferRemaining,
          risk_score: risk.score,
          risk_level: risk.level,
          risk_factors: risk.factors,
          risk_summary: risk.summary,
          risk_recommendation: risk.recommendation,
          created_at: r.created_at,
          updated_at: r.updated_at
        };
      });
    } else {
      orders = this.inMemoryOrders.filter((o) => {
        if (user?.role === 'KARIGAR' && o.karigar_id !== user.id) return false;
        if (user?.role === 'JEWELLER' && o.jeweller_id !== user.id) return false;
        if (filters.status && o.status !== filters.status) return false;
        if (filters.occasion_type && o.occasion_type !== filters.occasion_type) return false;
        return true;
      });
    }

    return orders;
  }

  /**
   * Retrieves single order by ID with role-based data ownership verification and event history
   */
  async getOrderById(orderId: string, user?: User): Promise<CustomerOrder | null> {
    const list = await this.getOrders({}, user);
    const order = list.find((o) => o.id === orderId || o.order_number.toUpperCase() === orderId.toUpperCase()) || null;
    if (order) {
      order.events = await this.getOrderEvents(order.id, user);
    }
    return order;
  }

  /**
   * Marks a milestone completed and advances downstream status
   */
  async completeMilestone(orderId: string, milestoneId: string, req: CompleteMilestoneRequest, user?: User): Promise<CustomerOrder> {
    const order = await this.getOrderById(orderId, user);
    if (!order) {
      throw new Error(`Order ${orderId} not found or access denied.`);
    }

    const milestone = order.milestones.find((m) => m.id === milestoneId);
    if (!milestone) {
      throw new Error(`Milestone ${milestoneId} not found on order ${order.order_number}`);
    }

    const oldStatus = order.status;
    const actualDate = req.actual_date || new Date().toISOString().split('T')[0];
    milestone.status = 'COMPLETED';
    milestone.actual_date = actualDate;
    if (req.notes) milestone.notes = req.notes;

    // Check if subsequent milestone can start
    const nextMilestone = order.milestones.find((m) => m.sequence === milestone.sequence + 1);
    if (nextMilestone && nextMilestone.status === 'PENDING') {
      nextMilestone.status = 'IN_PROGRESS';
    }

    // If final milestone is completed, set order status to READY
    const allCompleted = order.milestones.every((m) => m.status === 'COMPLETED');
    if (allCompleted) {
      order.status = 'READY';
    } else if (order.status === 'ACTIVE' || order.status === 'ON_TRACK') {
      order.status = 'IN_PROGRESS';
    }

    const now = new Date().toISOString();
    order.updated_at = now;

    if (dbManager.isSqlite) {
      const db = sqliteManager.getDb();
      db.prepare(`
        UPDATE milestones
        SET status = ?, actual_date = ?, notes = ?, updated_at = ?
        WHERE id = ?
      `).run(milestone.status, milestone.actual_date, milestone.notes || null, now, milestone.id);

      if (nextMilestone) {
        db.prepare(`
          UPDATE milestones SET status = ?, updated_at = ? WHERE id = ?
        `).run(nextMilestone.status, now, nextMilestone.id);
      }

      db.prepare(`
        UPDATE orders SET status = ?, updated_at = ? WHERE id = ?
      `).run(order.status, now, order.id);
    }

    // Record milestone completion event
    await this.recordOrderEvent({
      order_id: order.id,
      from_status: oldStatus,
      to_status: order.status,
      trigger_reason: `Milestone completed: ${milestone.name} (${milestone.name_hi || ''})`,
      risk_score: allCompleted ? 0.0 : order.risk_score,
      risk_level: allCompleted ? 'LOW' : order.risk_level,
      actor_id: user?.id,
      actor_role: user?.role || 'SYSTEM',
      metadata: { milestone_id: milestone.id, milestone_name: milestone.name, actual_date: actualDate }
    });

    order.events = await this.getOrderEvents(order.id, user);

    // Auto-recalculate Karigar trust score on milestone completion
    trustScoreRepository.recalculateForKarigar(order.karigar_id).catch(() => {});

    return order;
  }

  /**
   * Records a delay on a milestone and automatically runs delay cascade recomputation.
   * Sets order status to AT_RISK or DELAYED and fires multi-channel notifications.
   */
  async delayMilestone(
    orderId: string,
    milestoneId: string,
    req: DelayMilestoneRequest,
    user?: User
  ): Promise<CustomerOrder> {
    const order = await this.getOrderById(orderId, user);
    if (!order) {
      throw new Error(`Order ${orderId} not found or access denied.`);
    }

    const oldStatus = order.status;

    // Run Delay Cascade Algorithm
    const cascade = recomputeDelayCascade(
      order.milestones as CpmCalculatedNode[],
      milestoneId,
      req.delay_days,
      order.occasion_date
    );

    let newStatus: OrderStatus = 'AT_RISK';
    if (cascade.bufferDaysRemaining < 0) {
      newStatus = 'DELAYED';
    }

    order.status = newStatus;
    order.is_at_risk = cascade.isAtRisk || newStatus === 'DELAYED';
    order.buffer_days_remaining = cascade.bufferDaysRemaining;
    order.milestones = cascade.milestones as Milestone[];
    order.updated_at = new Date().toISOString();

    // Recompute risk score
    const delayedCount = order.milestones.filter((m) => m.status === 'DELAYED' || (m.slack !== undefined && m.slack < 0)).length;
    const completedCount = order.milestones.filter((m) => m.status === 'COMPLETED').length;
    const onTimeRate = this.getKarigarOnTimeRateSync(order.karigar_id);
    const risk = calculateOrderRiskScore({
      daysRemaining: order.days_to_occasion,
      totalMilestones: order.milestones.length,
      completedMilestones: completedCount,
      delayedMilestones: delayedCount,
      karigarHistoricalOnTimeRate: onTimeRate
    });

    order.risk_score = risk.score;
    order.risk_level = risk.level;
    order.risk_factors = risk.factors;
    order.risk_summary = risk.summary;
    order.risk_recommendation = risk.recommendation;

    if (dbManager.isSqlite) {
      const db = sqliteManager.getDb();
      const updateMilestone = db.prepare(`
        UPDATE milestones
        SET status = ?, planned_start_date = ?, planned_date = ?, updated_at = ?
        WHERE id = ?
      `);

      const tx = db.transaction(() => {
        for (const m of cascade.milestones) {
          updateMilestone.run(m.status, m.planned_start_date, m.planned_date, order.updated_at, m.id);
        }
        db.prepare(`UPDATE orders SET status = ?, updated_at = ? WHERE id = ?`).run(
          order.status,
          order.updated_at,
          order.id
        );
      });

      tx();
    }

    // Record escalation state transition in order_events
    await this.recordOrderEvent({
      order_id: order.id,
      from_status: oldStatus,
      to_status: newStatus,
      trigger_reason: req.reason || `Milestone delayed by ${req.delay_days} day(s)`,
      risk_score: risk.score,
      risk_level: risk.level,
      actor_id: user?.id,
      actor_role: user?.role || 'SYSTEM',
      metadata: { delay_days: req.delay_days, milestone_id: milestoneId, reason: req.reason }
    });

    // Fire simulated SMS alert to Karigar: "[SMS→karigar] Order #X at risk, 5 days to wedding"
    await notificationService.notifyOrderRisk({
      recipientId: order.karigar_id,
      recipientRole: 'KARIGAR',
      orderId: order.id,
      orderNumber: order.order_number,
      occasionType: order.occasion_type,
      daysToOccasion: order.days_to_occasion,
      message: `Delay reported: ${req.delay_days} day(s). Buffer remaining: ${cascade.bufferDaysRemaining} days.`,
      urgencyLevel: cascade.bufferDaysRemaining < 0 ? 'CRITICAL' : 'WARNING'
    });

    // If wedding occasion date itself is breached, alert Jeweller as well
    if (cascade.bufferDaysRemaining < 0) {
      await notificationService.notifyOrderRisk({
        recipientId: order.jeweller_id,
        recipientRole: 'JEWELLER',
        orderId: order.id,
        orderNumber: order.order_number,
        occasionType: order.occasion_type,
        daysToOccasion: order.days_to_occasion,
        message: `Auspicious occasion deadline breached! Delay overflow: ${Math.abs(cascade.bufferDaysRemaining)} days.`,
        urgencyLevel: 'CRITICAL'
      });
    }

    order.events = await this.getOrderEvents(order.id, user);

    // Auto-recalculate Karigar trust score on milestone completion
    trustScoreRepository.recalculateForKarigar(order.karigar_id).catch(() => {});

    return order;
  }

  /**
   * Jeweller acknowledges escalation, resolving or stabilizing the alert state:
   * State Machine transition: AT_RISK / DELAYED -> ESCALATED
   */
  async acknowledgeEscalation(
    orderId: string,
    user: User,
    notes?: string
  ): Promise<CustomerOrder> {
    if (user.role !== 'JEWELLER') {
      throw new Error('Access denied. Only Jewellers can acknowledge and intervene in escalations.');
    }

    const order = await this.getOrderById(orderId, user);
    if (!order) {
      throw new Error(`Order ${orderId} not found or access denied.`);
    }

    if (order.jeweller_id !== user.id) {
      throw new Error('Access denied. You can only acknowledge escalations for your own orders.');
    }

    const oldStatus = order.status;
    const newStatus: OrderStatus = 'ESCALATED';
    const now = new Date().toISOString();

    order.status = newStatus;
    order.updated_at = now;
    this.updateOrderStatusDirect(order.id, newStatus);

    await this.recordOrderEvent({
      order_id: order.id,
      from_status: oldStatus,
      to_status: newStatus,
      trigger_reason: notes || 'Jeweller acknowledged risk escalation and coordinated bench intervention',
      risk_score: order.risk_score,
      risk_level: order.risk_level,
      actor_id: user.id,
      actor_role: 'JEWELLER',
      metadata: { notes: notes || null }
    });

    await notificationService.notifyEscalationAcknowledged(
      order.order_number,
      order.id,
      order.karigar_id,
      'KARIGAR',
      user.name || 'Lalit Soni',
      order.occasion_type,
      order.days_to_occasion
    );

    order.events = await this.getOrderEvents(order.id, user);

    // Auto-recalculate Karigar trust score on milestone completion
    trustScoreRepository.recalculateForKarigar(order.karigar_id).catch(() => {});

    return order;
  }
}

export const orderRepository = new OrderRepository();

