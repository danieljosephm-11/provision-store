import { randomUUID } from 'node:crypto';
import type { PrismaTx } from './prisma';
import type { DocumentType } from '@prisma/client';

/**
 * Atomic, gap-free document numbering per store / document type / financial year.
 * The sequence row is locked FOR UPDATE inside the caller's transaction, so two
 * concurrent sales can never receive the same invoice number.
 */
export async function nextDocumentNumber(
  tx: PrismaTx,
  params: {
    storeId: string;
    docType: DocumentType;
    financialYear: string;
    prefix: string;
    padding?: number;
  },
): Promise<string> {
  const { storeId, docType, financialYear, prefix, padding = 5 } = params;

  await tx.$executeRaw`
    INSERT INTO "DocumentSequence" ("id","storeId","docType","financialYear","prefix","nextNumber","padding")
    VALUES (${randomUUID()}::uuid, ${storeId}::uuid, ${docType}::"DocumentType", ${financialYear}, ${prefix}, 1, ${padding})
    ON CONFLICT ("storeId","docType","financialYear") DO NOTHING
  `;

  const rows = await tx.$queryRaw<{ nextNumber: number }[]>`
    SELECT "nextNumber" FROM "DocumentSequence"
    WHERE "storeId" = ${storeId}::uuid
      AND "docType" = ${docType}::"DocumentType"
      AND "financialYear" = ${financialYear}
    FOR UPDATE
  `;

  const row = rows[0];
  if (!row) throw new Error('Failed to allocate document number');

  await tx.$executeRaw`
    UPDATE "DocumentSequence" SET "nextNumber" = "nextNumber" + 1
    WHERE "storeId" = ${storeId}::uuid
      AND "docType" = ${docType}::"DocumentType"
      AND "financialYear" = ${financialYear}
  `;

  return `${prefix}/${financialYear}/${String(row.nextNumber).padStart(padding, '0')}`;
}
