import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';
import path from 'node:path';
import fs from 'node:fs';
import { env } from './config/env';
import { logger } from './lib/logger';
import { requestId } from './middleware/request-id';
import { apiLimiter } from './middleware/rate-limit';
import { errorHandler, notFoundHandler } from './middleware/error';
import { prisma } from './lib/prisma';

import authRoutes from './modules/auth/auth.routes';
import userRoutes from './modules/users/users.routes';
import roleRoutes from './modules/roles/roles.routes';
import storeRoutes from './modules/store/store.routes';
import auditRoutes from './modules/audit/audit.routes';
import productRoutes from './modules/products/products.routes';
import catalogRoutes from './modules/catalog/catalog.routes';
import inventoryRoutes from './modules/inventory/inventory.routes';
import salesRoutes from './modules/sales/sales.routes';
import customerRoutes from './modules/customers/customers.routes';
import crmRoutes from './modules/crm/crm.routes';
import supplierRoutes from './modules/suppliers/suppliers.routes';
import purchaseRoutes from './modules/purchases/purchases.routes';
import expenseRoutes from './modules/expenses/expenses.routes';
import dashboardRoutes from './modules/dashboard/dashboard.routes';
import reportRoutes from './modules/reports/reports.routes';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: env.isProd ? undefined : false,
    }),
  );
  app.use(cors({ origin: env.corsOrigins, credentials: true }));
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use(requestId);
  app.use(pinoHttp({ logger, quietReqLogger: true, genReqId: (req) => (req as express.Request).requestId }));

  // Friendly entry points so the bare host never shows a raw 404.
  app.get('/', (_req, res) => {
    res.redirect(302, env.APP_URL);
  });

  app.get('/api/v1', (_req, res) => {
    res.json({
      name: 'Provision Store API',
      version: 'v1',
      health: '/api/v1/health',
      docs: '/api/v1/health',
      web: env.APP_URL,
    });
  });

  app.get('/api/v1/health', async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() });
    } catch {
      res.status(503).json({ status: 'degraded', database: 'unreachable' });
    }
  });

  const uploadDir = path.resolve(process.cwd(), env.UPLOAD_DIR);
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
  app.use('/uploads', express.static(uploadDir, { maxAge: '1d' }));

  app.use('/api/v1', apiLimiter);

  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1/users', userRoutes);
  app.use('/api/v1/roles', roleRoutes);
  app.use('/api/v1/store', storeRoutes);
  app.use('/api/v1/audit-logs', auditRoutes);
  app.use('/api/v1/products', productRoutes);
  app.use('/api/v1/catalog', catalogRoutes);
  app.use('/api/v1/inventory', inventoryRoutes);
  app.use('/api/v1', salesRoutes);
  app.use('/api/v1/customers', customerRoutes);
  app.use('/api/v1/crm', crmRoutes);
  app.use('/api/v1/suppliers', supplierRoutes);
  app.use('/api/v1', purchaseRoutes);
  app.use('/api/v1', expenseRoutes);
  app.use('/api/v1/dashboard', dashboardRoutes);
  app.use('/api/v1/reports', reportRoutes);

  // Module routers are appended here as each phase lands.

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
