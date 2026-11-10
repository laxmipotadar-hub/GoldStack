import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { orderRepository } from '../db/orderRepository.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { OrderStatus, OccasionType, OrderDesignComplexity } from '../../shared/types.js';

export const orderRouter = Router();

const CreateOrderSchema = z.object({
  order_number: z.string().optional(),
  karigar_id: z.string().min(1, 'Karigar ID is required'),
  customer_name: z.string().min(1, 'Customer name is required'),
  occasion_type: z.enum(['WEDDING', 'FESTIVAL', 'CEREMONY', 'OTHER']),
  occasion_date: z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'Occasion date must be YYYY-MM-DD format'),
  design_complexity: z.enum(['SIMPLE', 'MEDIUM', 'COMPLEX', 'INTRICATE']),
  item_description: z.string().optional(),
  target_weight_grams: z.number().positive().optional(),
  delivery_buffer_days: z.number().int().nonnegative().optional()
});

const CompleteMilestoneSchema = z.object({
  actual_date: z.string().optional(),
  notes: z.string().optional()
});

const DelayMilestoneSchema = z.object({
  delay_days: z.number().positive('Delay days must be greater than 0'),
  reason: z.string().optional()
});

/**
 * GET /api/orders
 * List orders with status & occasion_type filters.
 * Strict Data Ownership:
 * - Jewellers see all orders where they are the jeweller.
 * - Karigars see ONLY orders assigned to their artisan account.
 */
orderRouter.get('/', authenticateToken, async (req: Request, res: Response) => {
  try {
    const status = req.query.status as OrderStatus | undefined;
    const occasion_type = req.query.occasion_type as OccasionType | undefined;

    const orders = await orderRepository.getOrders({ status, occasion_type }, req.user);

    res.json({
      success: true,
      data: orders
    });
  } catch (err: any) {
    console.error('[API] /orders error:', err);
    res.status(500).json({ success: false, message: err.message || 'Failed to fetch orders' });
  }
});

/**
 * GET /api/orders/:id
 * Retrieve a single order with full milestones, critical path, and wedding date protection metrics
 */
orderRouter.get('/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const order = await orderRepository.getOrderById(id, req.user);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: `Order ${id} not found or access denied.`
      });
    }

    res.json({
      success: true,
      data: order
    });
  } catch (err: any) {
    console.error('[API] /orders/:id error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/orders
 * Create a new customer occasion order with auto-generated CPM milestones
 * Only Jewellers can create occasion orders.
 */
orderRouter.post('/', authenticateToken, requireRole('JEWELLER'), async (req: Request, res: Response) => {
  try {
    const validated = CreateOrderSchema.parse(req.body);
    const order = await orderRepository.createOrder(validated, req.user!);

    res.status(201).json({
      success: true,
      message: `Occasion order ${order.order_number} created with ${order.milestones.length} reverse-scheduled milestones.`,
      data: order
    });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ success: false, errors: err.errors });
    }
    console.error('[API] POST /orders error:', err);
    res.status(400).json({ success: false, message: err.message || 'Failed to create order' });
  }
});

/**
 * POST /api/orders/:id/milestones/:mid/complete
 * Mark a milestone completed and advance downstream stage
 */
orderRouter.post('/:id/milestones/:mid/complete', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { id, mid } = req.params;
    const validated = CompleteMilestoneSchema.parse(req.body || {});
    const updatedOrder = await orderRepository.completeMilestone(id, mid, validated, req.user);

    res.json({
      success: true,
      message: `Milestone completed successfully. Order status: ${updatedOrder.status}.`,
      data: updatedOrder
    });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ success: false, errors: err.errors });
    }
    console.error('[API] /orders/:id/milestones/:mid/complete error:', err);
    res.status(400).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/orders/:id/milestones/:mid/delay
 * Record milestone delay and trigger delay cascade recomputation.
 * Automatically flags order status to AT_RISK if delivery date exceeds occasion_date!
 */
orderRouter.post('/:id/milestones/:mid/delay', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { id, mid } = req.params;
    const validated = DelayMilestoneSchema.parse(req.body);
    const updatedOrder = await orderRepository.delayMilestone(id, mid, validated, req.user);

    res.json({
      success: true,
      message: updatedOrder.is_at_risk
        ? `⚠️ Delay recorded. Order finish exceeds occasion date! Status changed to AT_RISK.`
        : `Delay recorded and downstream schedule recomputed. Order status: ${updatedOrder.status}.`,
      data: updatedOrder
    });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ success: false, errors: err.errors });
    }
    console.error('[API] /orders/:id/milestones/:mid/delay error:', err);
    res.status(400).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/orders/:id/acknowledge-escalation
 * Jeweller acknowledges escalation for an AT_RISK or DELAYED order.
 * State machine transition: AT_RISK / DELAYED -> ESCALATED
 */
orderRouter.post(
  '/:id/acknowledge-escalation',
  authenticateToken,
  requireRole('JEWELLER'),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { notes } = req.body || {};

      const updatedOrder = await orderRepository.acknowledgeEscalation(id, req.user!, notes);

      res.json({
        success: true,
        message: `Escalation acknowledged by Jeweller for order #${updatedOrder.order_number}. Status updated to ESCALATED.`,
        data: updatedOrder
      });
    } catch (err: any) {
      console.error('[API] /orders/:id/acknowledge-escalation error:', err);
      res.status(400).json({ success: false, message: err.message || 'Failed to acknowledge escalation' });
    }
  }
);

/**
 * GET /api/orders/:id/events
 * Retrieve full escalation state transition audit trail for an order
 */
orderRouter.get('/:id/events', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const events = await orderRepository.getOrderEvents(id, req.user);

    res.json({
      success: true,
      data: events
    });
  } catch (err: any) {
    console.error('[API] /orders/:id/events error:', err);
    res.status(400).json({ success: false, message: err.message });
  }
});

