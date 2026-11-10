/**
 * Pluggable Notification Service with Multi-Channel Architecture
 * Supports Console Mock SMS (for demo and audit), with interfaces ready for
 * Twilio SMS and WhatsApp Business integration without touching call sites.
 */

import crypto from 'node:crypto';
import { dbManager } from '../db/index.js';
import { sqliteManager } from '../db/sqlite.js';
import { InAppNotification, Role } from '../../shared/types.js';

export interface NotificationPayload {
  recipientId: string;
  recipientRole: 'JEWELLER' | 'KARIGAR';
  recipientName?: string;
  recipientPhone?: string;
  orderId: string;
  orderNumber: string;
  occasionType: string;
  daysToOccasion: number;
  message: string;
  urgencyLevel: 'INFO' | 'WARNING' | 'CRITICAL';
  metadata?: Record<string, unknown>;
}

/**
 * Interface contract for external communication channels (Twilio, WhatsApp, SMS, Push)
 */
export interface INotificationChannel {
  readonly name: string;
  send(payload: NotificationPayload): Promise<boolean>;
}

/**
 * Console Mock SMS Channel
 * Formats and prints exact simulated SMS lines to stdout as required by the demo specification:
 * "[SMS→karigar] Order #X at risk, 5 days to wedding"
 */
export class ConsoleMockSmsChannel implements INotificationChannel {
  readonly name = 'CONSOLE_SMS';

  async send(payload: NotificationPayload): Promise<boolean> {
    const roleTarget = payload.recipientRole.toLowerCase();
    const occasionLabel = payload.occasionType.toLowerCase() === 'wedding' ? 'wedding' : payload.occasionType.toLowerCase();
    
    // Exact spec format: [SMS→karigar] Order #X at risk, 5 days to wedding
    const line = `[SMS→${roleTarget}] Order #${payload.orderNumber} at risk, ${payload.daysToOccasion} days to ${occasionLabel}`;
    console.log(line);
    return true;
  }
}

/**
 * Mock Twilio Channel ready for future production credentials without changing call sites
 */
export class TwilioSmsChannel implements INotificationChannel {
  readonly name = 'TWILIO_SMS';

  async send(payload: NotificationPayload): Promise<boolean> {
    if (!process.env.TWILIO_AUTH_TOKEN) {
      // Graceful fallback in demo mode
      return false;
    }
    // Production Twilio client send logic would live here
    return true;
  }
}

/**
 * Mock WhatsApp Business Channel ready for Meta Cloud API integration
 */
export class WhatsAppBusinessChannel implements INotificationChannel {
  readonly name = 'WHATSAPP_BUSINESS';

  async send(payload: NotificationPayload): Promise<boolean> {
    if (!process.env.WHATSAPP_API_TOKEN) {
      // Graceful fallback in demo mode
      return false;
    }
    // Meta WhatsApp Cloud API send logic would live here
    return true;
  }
}

export class NotificationService {
  private channels: INotificationChannel[] = [];
  private inMemoryNotifications: InAppNotification[] = [];

  constructor() {
    // Register the console mock channel by default
    this.registerChannel(new ConsoleMockSmsChannel());
    this.registerChannel(new TwilioSmsChannel());
    this.registerChannel(new WhatsAppBusinessChannel());
  }

  /**
   * Register a new delivery channel (Twilio, WhatsApp, Push, etc.)
   */
  registerChannel(channel: INotificationChannel): void {
    // Avoid duplicate channel registrations by name
    const existingIdx = this.channels.findIndex((c) => c.name === channel.name);
    if (existingIdx >= 0) {
      this.channels[existingIdx] = channel;
    } else {
      this.channels.push(channel);
    }
  }

  getChannels(): INotificationChannel[] {
    return [...this.channels];
  }

  /**
   * Dispatches order risk alerts across all registered channels and creates in-app notifications
   */
  async notifyOrderRisk(payload: NotificationPayload): Promise<void> {
    // 1. Dispatch to all active external channels
    for (const channel of this.channels) {
      try {
        await channel.send(payload);
      } catch (err) {
        console.error(`[NotificationService] Error sending via ${channel.name}:`, err);
      }
    }

    // 2. Persist in-app notification for the recipient
    const title = `⚠️ जोखिम सूचना: ऑर्डर #${payload.orderNumber} (Order at Risk)`;
    const message = `${payload.orderNumber} (${payload.occasionType}) - ${payload.daysToOccasion} दिन शेष (days left). ${payload.message}`;
    const severity = payload.urgencyLevel === 'CRITICAL' ? 'critical' : payload.urgencyLevel === 'WARNING' ? 'high' : 'medium';

    await this.createInAppNotification({
      user_id: payload.recipientId,
      user_role: payload.recipientRole,
      order_id: payload.orderId,
      order_number: payload.orderNumber,
      title,
      message,
      severity
    });
  }

  /**
   * Dispatches escalation resolution alerts
   */
  async notifyEscalationAcknowledged(
    orderNumber: string,
    orderId: string,
    recipientId: string,
    recipientRole: 'JEWELLER' | 'KARIGAR',
    jewellerName: string,
    occasionType: string,
    daysToOccasion: number
  ): Promise<void> {
    const roleTarget = recipientRole.toLowerCase();
    const occasionLabel = occasionType.toLowerCase() === 'wedding' ? 'wedding' : occasionType.toLowerCase();
    const line = `[SMS→${roleTarget}] Order #${orderNumber} escalation acknowledged by ${jewellerName}, ${daysToOccasion} days to ${occasionLabel}`;
    console.log(line);

    await this.createInAppNotification({
      user_id: recipientId,
      user_role: recipientRole,
      order_id: orderId,
      order_number: orderNumber,
      title: `✅ संज्ञान लिया गया (Escalation Acknowledged): #${orderNumber}`,
      message: `ज्वैलर ${jewellerName} ने ऑर्डर #${orderNumber} का संज्ञान ले लिया है। कार्यशाला हस्तक्षेप सक्रिय।`,
      severity: 'info'
    });
  }

  /**
   * Persists an in-app notification
   */
  async createInAppNotification(data: {
    user_id: string;
    user_role: Role | string;
    order_id?: string;
    order_number?: string;
    title: string;
    message: string;
    severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  }): Promise<InAppNotification> {
    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();

    const notif: InAppNotification = {
      id,
      user_id: data.user_id,
      user_role: data.user_role,
      order_id: data.order_id,
      order_number: data.order_number,
      title: data.title,
      message: data.message,
      severity: data.severity,
      is_read: false,
      created_at: createdAt
    };

    if (dbManager.isSqlite) {
      try {
        const db = sqliteManager.getDb();
        db.prepare(`
          INSERT INTO in_app_notifications (id, user_id, user_role, order_id, order_number, title, message, severity, is_read, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
        `).run(
          notif.id,
          notif.user_id,
          notif.user_role,
          notif.order_id || null,
          notif.order_number || null,
          notif.title,
          notif.message,
          notif.severity,
          notif.created_at
        );
      } catch (err) {
        console.error('[NotificationService] Failed to insert notification in SQLite:', err);
      }
    }

    this.inMemoryNotifications.unshift(notif);
    return notif;
  }

  /**
   * Retrieves in-app notifications for an authenticated user
   */
  async getNotifications(userId: string, userRole?: string): Promise<InAppNotification[]> {
    if (dbManager.isSqlite) {
      try {
        const db = sqliteManager.getDb();
        const rows = db.prepare(`
          SELECT * FROM in_app_notifications
          WHERE user_id = ? OR user_role = ?
          ORDER BY created_at DESC
          LIMIT 50
        `).all(userId, userRole || '') as any[];

        return rows.map((r) => ({
          id: r.id,
          user_id: r.user_id,
          user_role: r.user_role,
          order_id: r.order_id,
          order_number: r.order_number,
          title: r.title,
          message: r.message,
          severity: r.severity,
          is_read: Boolean(r.is_read),
          created_at: r.created_at
        }));
      } catch (err) {
        console.error('[NotificationService] Failed to fetch notifications from SQLite:', err);
      }
    }

    return this.inMemoryNotifications.filter(
      (n) => n.user_id === userId || (userRole && n.user_role === userRole)
    );
  }

  /**
   * Marks a notification as read
   */
  async markAsRead(notificationId: string): Promise<boolean> {
    if (dbManager.isSqlite) {
      try {
        const db = sqliteManager.getDb();
        db.prepare('UPDATE in_app_notifications SET is_read = 1 WHERE id = ?').run(notificationId);
      } catch (err) {
        console.error('[NotificationService] Failed to update notification in SQLite:', err);
      }
    }

    const item = this.inMemoryNotifications.find((n) => n.id === notificationId);
    if (item) {
      item.is_read = true;
    }
    return true;
  }

  /**
   * Marks all notifications as read for a user
   */
  async markAllAsRead(userId: string): Promise<boolean> {
    if (dbManager.isSqlite) {
      try {
        const db = sqliteManager.getDb();
        db.prepare('UPDATE in_app_notifications SET is_read = 1 WHERE user_id = ?').run(userId);
      } catch (err) {
        console.error('[NotificationService] Failed to update all notifications in SQLite:', err);
      }
    }

    for (const item of this.inMemoryNotifications) {
      if (item.user_id === userId) {
        item.is_read = true;
      }
    }
    return true;
  }
}

export const notificationService = new NotificationService();

