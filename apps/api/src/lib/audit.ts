import type { Request } from 'express';
import { prisma, type PrismaTx } from './prisma';
import { logger } from './logger';

export interface AuditInput {
  storeId: string;
  userId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  req?: Request;
}

/** Every sensitive write leaves an immutable audit trail. Never throws into the request. */
export async function writeAudit(input: AuditInput, tx?: PrismaTx): Promise<void> {
  try {
    const client = tx ?? prisma;
    await client.auditLog.create({
      data: {
        storeId: input.storeId,
        userId: input.userId ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        before: (input.before as object) ?? undefined,
        after: (input.after as object) ?? undefined,
        ip: input.req?.ip ?? null,
        userAgent: input.req?.get('user-agent')?.slice(0, 300) ?? null,
        requestId: input.req?.requestId ?? null,
      },
    });
  } catch (error) {
    logger.error({ err: error, action: input.action }, 'Failed to write audit log');
  }
}
