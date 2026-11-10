import { Router, Request, Response } from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { notificationService } from '../services/notificationService.js';

export const notificationRouter = Router();

/**
 * GET /api/notifications
 * Returns recent in-app notifications for the logged in user
 */
notificationRouter.get('/', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const userRole = req.user!.role;
    const notifications = await notificationService.getNotifications(userId, userRole);

    res.json({
      success: true,
      data: notifications
    });
  } catch (err: any) {
    console.error('[API] /notifications error:', err);
    res.status(500).json({ success: false, message: err.message || 'Failed to fetch notifications' });
  }
});

/**
 * POST /api/notifications/:id/read
 * Mark an in-app notification as read
 */
notificationRouter.post('/:id/read', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await notificationService.markAsRead(id);

    res.json({
      success: true,
      message: 'Notification marked as read'
    });
  } catch (err: any) {
    console.error('[API] /notifications/:id/read error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/notifications/mark-all-read
 * Mark all notifications as read for current user
 */
notificationRouter.post('/mark-all-read', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    await notificationService.markAllAsRead(userId);

    res.json({
      success: true,
      message: 'All notifications marked as read'
    });
  } catch (err: any) {
    console.error('[API] /notifications/mark-all-read error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

