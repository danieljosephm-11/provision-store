import { PrismaClient, Prisma } from '@prisma/client';
import { env } from '../config/env';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: { db: { url: env.DATABASE_URL } },
    log: ['warn', 'error'],
  });

if (!env.isProd) globalForPrisma.prisma = prisma;

export type PrismaTx = Prisma.TransactionClient;
export { Prisma };
