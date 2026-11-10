import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import { dbManager } from './db/index.js';
import { ledgerRepository } from './db/ledgerRepository.js';
import { ledgerRouter } from './routes/ledgerRoutes.js';
import { uploadRouter } from './routes/uploadRoutes.js';
import { authRouter } from './routes/authRoutes.js';
import { wastageRouter } from './routes/wastageRoutes.js';
import { orderRouter } from './routes/orderRoutes.js';
import { notificationRouter } from './routes/notificationRoutes.js';
import { orderRepository } from './db/orderRepository.js';
import { settlementRouter, ratesRouter } from './routes/settlementRoutes.js';
import { settlementRepository } from './db/settlementRepository.js';
import { trustScoreRouter } from './routes/trustScoreRoutes.js';
import { disputeRouter } from './routes/disputeRoutes.js';
import { demoRouter } from './routes/demoRoutes.js';

dotenv.config();

export const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: true, credentials: true }));
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// API Routes
app.use('/api/auth', authRouter);
app.use('/api/ledger', ledgerRouter);
app.use('/api/upload', uploadRouter);
app.use('/api/wastage', wastageRouter);
app.use('/api/orders', orderRouter);
app.use('/api/notifications', notificationRouter);
app.use('/api/settlements', settlementRouter);
app.use('/api/rates', ratesRouter);
app.use('/api/trust-score', trustScoreRouter);
app.use('/api/disputes', disputeRouter);
app.use('/api/demo', demoRouter);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    isPostgres: dbManager.isPostgres,
    isSqlite: dbManager.isSqlite
  });
});

// Periodic 24-hour dual confirmation timeout checker
setInterval(async () => {
  try {
    const escalated = await ledgerRepository.escalateExpiredEntries();
    if (escalated.length > 0) {
      console.log(`[Auto-Escalation] ${escalated.length} expired entries marked as ESCALATED`);
    }
  } catch (err) {
    console.error('[Auto-Escalation] Error running escalation job:', err);
  }
}, 60 * 1000); // Check every minute

async function start() {
  try {
    await dbManager.init();
    await ledgerRepository.init();
    await orderRepository.init();
    await settlementRepository.init();

    app.listen(PORT, () => {
      console.log(`
╔══════════════════════════════════════════════════════════════╗
║         GOLDSTACK IMMUTABLE LEDGER SYSTEM READY             ║
║--------------------------------------------------------------║
║  Backend API Server: http://localhost:${PORT}                  ║
║  Auth Endpoints:     /api/auth/send-otp, /verify-otp, /me    ║
║  Ledger Endpoints:   /api/ledger/issue, /return, /confirm    ║
║  Hash Chain Audit:   /api/ledger/verify-chain                ║
║  Photo Evidence GCS: /api/upload/signed-url, /direct         ║
╚══════════════════════════════════════════════════════════════╝
      `);
    });
  } catch (err) {
    console.error('Fatal error starting server:', err);
    process.exit(1);
  }
}

// Only auto-listen if run directly or outside of Vitest unit test imports
if (!process.env.VITEST) {
  start();
}
