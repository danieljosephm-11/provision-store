import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const rows = await prisma.$queryRawUnsafe(
  `SELECT tgname, tgrelid::regclass::text AS tbl, pg_get_triggerdef(oid) AS def
   FROM pg_trigger WHERE NOT tgisinternal
   AND tgrelid::regclass::text IN ('"LoyaltyTransaction"','"CustomerLedger"','"Payment"','"Invoice"','"CustomerActivity"','"CustomerCampaign"','"CampaignRecipient"')`,
);
for (const row of rows) console.log(row.tbl, '|', row.tgname, '|', row.def);
await prisma.$disconnect();
