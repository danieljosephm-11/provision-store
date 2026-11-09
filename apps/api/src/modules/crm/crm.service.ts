import type { Request } from 'express';
import { Prisma, type CustomerSegment } from '@prisma/client';
import { round2 } from '@ps/shared';
import type { CampaignAudienceInput, CampaignInput } from '@ps/shared';
import { prisma } from '../../lib/prisma';
import { badRequest, conflict, notFound } from '../../lib/errors';
import { writeAudit } from '../../lib/audit';
import { renderCampaignMessage, listFollowUps, listOccasions } from '../customers/customers.service';

const n = (v: unknown) => Number(v ?? 0);

const SEGMENTS: CustomerSegment[] = ['NEW', 'REGULAR', 'LOYAL', 'HIGH_VALUE', 'INACTIVE'];

function startOfMonth() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
}

function daysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

export function parseAudienceQuery(query: Record<string, unknown>): CampaignAudienceInput {
  const segmentRaw = query.segment ? String(query.segment) : '';
  const segment = SEGMENTS.includes(segmentRaw as CustomerSegment)
    ? (segmentRaw as CustomerSegment)
    : null;
  const minSpend = Number(query.minSpend ?? 0);
  const inactiveDays = Number(query.inactiveDays ?? 0);
  return {
    segment,
    minSpend: Number.isFinite(minSpend) && minSpend > 0 ? minSpend : 0,
    inactiveDays: Number.isFinite(inactiveDays) && inactiveDays > 0 ? Math.floor(inactiveDays) : 0,
    includeInactive: query.includeInactive === 'true',
  };
}

export function audienceWhere(
  storeId: string,
  input: CampaignAudienceInput,
): Prisma.CustomerWhereInput {
  const filters: Prisma.CustomerWhereInput[] = [{ storeId, deletedAt: null }];
  if (!input.includeInactive) filters.push({ isActive: true });
  if (input.segment) filters.push({ segment: input.segment });
  if (input.minSpend > 0) filters.push({ totalSpent: { gte: input.minSpend } });
  if (input.inactiveDays > 0) {
    const cutoff = daysAgo(input.inactiveDays);
    filters.push({
      OR: [
        { lastPurchaseAt: { lt: cutoff } },
        { lastPurchaseAt: null, createdAt: { lt: cutoff } },
      ],
    });
  }
  return { AND: filters };
}

export async function previewAudience(storeId: string, query: Record<string, unknown>) {
  const input = parseAudienceQuery(query);
  const where = audienceWhere(storeId, input);
  const [count, sample] = await Promise.all([
    prisma.customer.count({ where }),
    prisma.customer.findMany({
      where,
      orderBy: { totalSpent: 'desc' },
      take: 8,
      select: {
        id: true,
        name: true,
        mobile: true,
        segment: true,
        totalSpent: true,
        loyaltyPoints: true,
        lastPurchaseAt: true,
      },
    }),
  ]);
  return {
    count,
    filters: input,
    sample: sample.map((customer) => ({ ...customer, totalSpent: n(customer.totalSpent) })),
  };
}

const campaignListInclude = {
  user: { select: { id: true, name: true } },
  _count: { select: { recipients: true } },
} satisfies Prisma.CustomerCampaignInclude;

function serializeCampaign(
  campaign: Prisma.CustomerCampaignGetPayload<{ include: typeof campaignListInclude }>,
) {
  return {
    id: campaign.id,
    name: campaign.name,
    channel: campaign.channel,
    message: campaign.message,
    segment: campaign.segment,
    minSpend: n(campaign.minSpend),
    inactiveDays: campaign.inactiveDays,
    includeInactive: campaign.includeInactive,
    status: campaign.status,
    audienceCount: campaign.audienceCount,
    sentCount: campaign.sentCount,
    recipientCount: campaign._count.recipients,
    createdAt: campaign.createdAt,
    launchedAt: campaign.launchedAt,
    completedAt: campaign.completedAt,
    author: campaign.user,
  };
}

export async function listCampaigns(storeId: string) {
  const rows = await prisma.customerCampaign.findMany({
    where: { storeId },
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: campaignListInclude,
  });
  return { items: rows.map(serializeCampaign) };
}

export async function createCampaign(
  storeId: string,
  userId: string,
  input: CampaignInput,
  req: Request,
) {
  const audienceCount = await prisma.customer.count({
    where: audienceWhere(storeId, {
      segment: input.segment ?? null,
      minSpend: input.minSpend,
      inactiveDays: input.inactiveDays,
      includeInactive: input.includeInactive,
    }),
  });

  const campaign = await prisma.customerCampaign.create({
    data: {
      storeId,
      name: input.name,
      channel: input.channel,
      message: input.message,
      segment: input.segment ?? null,
      minSpend: input.minSpend,
      inactiveDays: input.inactiveDays,
      includeInactive: input.includeInactive,
      audienceCount,
      createdBy: userId,
    },
    include: campaignListInclude,
  });

  await writeAudit({
    storeId,
    userId,
    action: 'CUSTOMER_CAMPAIGN_CREATED',
    entityType: 'CustomerCampaign',
    entityId: campaign.id,
    after: { name: campaign.name, channel: campaign.channel, audienceCount },
    req,
  });

  return serializeCampaign(campaign);
}

export async function getCampaign(storeId: string, id: string) {
  const campaign = await prisma.customerCampaign.findFirst({
    where: { id, storeId },
    include: {
      ...campaignListInclude,
      recipients: {
        orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
        take: 500,
        include: {
          customer: {
            select: {
              id: true,
              name: true,
              mobile: true,
              segment: true,
              loyaltyPoints: true,
              totalSpent: true,
              ledger: { orderBy: { seq: 'desc' }, take: 1, select: { balanceAfter: true } },
            },
          },
        },
      },
    },
  });
  if (!campaign) throw notFound('Campaign');

  const store = await prisma.store.findUnique({ where: { id: storeId }, select: { name: true } });

  return {
    ...serializeCampaign(campaign),
    recipients: campaign.recipients.map((recipient) => ({
      id: recipient.id,
      status: recipient.status,
      sentAt: recipient.sentAt,
      customer: {
        id: recipient.customer.id,
        name: recipient.customer.name,
        mobile: recipient.customer.mobile,
        segment: recipient.customer.segment,
        loyaltyPoints: recipient.customer.loyaltyPoints,
        totalSpent: n(recipient.customer.totalSpent),
        outstanding: n(recipient.customer.ledger[0]?.balanceAfter),
      },
      message: renderCampaignMessage(campaign.message, recipient.customer, {
        storeName: store?.name,
        outstanding: n(recipient.customer.ledger[0]?.balanceAfter),
      }),
    })),
  };
}

export async function launchCampaign(
  storeId: string,
  userId: string,
  id: string,
  req: Request,
) {
  const campaign = await prisma.customerCampaign.findFirst({ where: { id, storeId } });
  if (!campaign) throw notFound('Campaign');
  if (campaign.status !== 'DRAFT') throw conflict('This campaign has already been launched');

  const audience = await prisma.customer.findMany({
    where: audienceWhere(storeId, {
      segment: campaign.segment,
      minSpend: n(campaign.minSpend),
      inactiveDays: campaign.inactiveDays,
      includeInactive: campaign.includeInactive,
    }),
    select: { id: true },
  });
  if (audience.length === 0) throw badRequest('No customers match this campaign audience');

  const updated = await prisma.$transaction(async (tx) => {
    await tx.campaignRecipient.createMany({
      data: audience.map((customer) => ({ campaignId: id, customerId: customer.id })),
      skipDuplicates: true,
    });
    return tx.customerCampaign.update({
      where: { id },
      data: {
        status: 'RUNNING',
        audienceCount: audience.length,
        launchedAt: new Date(),
      },
      include: campaignListInclude,
    });
  });

  await writeAudit({
    storeId,
    userId,
    action: 'CUSTOMER_CAMPAIGN_LAUNCHED',
    entityType: 'CustomerCampaign',
    entityId: id,
    after: { audienceCount: audience.length },
    req,
  });

  return serializeCampaign(updated);
}

export async function markRecipientSent(
  storeId: string,
  userId: string,
  campaignId: string,
  recipientId: string,
  req: Request,
) {
  const recipient = await prisma.campaignRecipient.findFirst({
    where: { id: recipientId, campaignId, campaign: { storeId } },
    include: { campaign: true },
  });
  if (!recipient) throw notFound('Campaign recipient');
  if (recipient.status === 'SENT') {
    return { id: recipient.id, status: recipient.status, sentAt: recipient.sentAt };
  }

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.campaignRecipient.update({
      where: { id: recipientId },
      data: { status: 'SENT', sentAt: new Date() },
    });
    await tx.customerCampaign.update({
      where: { id: campaignId },
      data: { sentCount: { increment: 1 } },
    });
    return row;
  });

  await writeAudit({
    storeId,
    userId,
    action: 'CUSTOMER_CAMPAIGN_MESSAGE_SENT',
    entityType: 'CampaignRecipient',
    entityId: recipientId,
    after: { campaignId, customerId: recipient.customerId },
    req,
  });

  return { id: updated.id, status: updated.status, sentAt: updated.sentAt };
}

export async function completeCampaign(
  storeId: string,
  userId: string,
  id: string,
  req: Request,
) {
  const campaign = await prisma.customerCampaign.findFirst({
    where: { id, storeId },
    include: campaignListInclude,
  });
  if (!campaign) throw notFound('Campaign');
  if (campaign.status === 'DRAFT') throw conflict('Launch the campaign before completing it');
  if (campaign.status === 'COMPLETED') return serializeCampaign(campaign);

  const updated = await prisma.customerCampaign.update({
    where: { id },
    data: { status: 'COMPLETED', completedAt: new Date() },
    include: campaignListInclude,
  });

  await writeAudit({
    storeId,
    userId,
    action: 'CUSTOMER_CAMPAIGN_COMPLETED',
    entityType: 'CustomerCampaign',
    entityId: id,
    after: { sentCount: updated.sentCount, audienceCount: updated.audienceCount },
    req,
  });

  return serializeCampaign(updated);
}

export async function deleteCampaign(
  storeId: string,
  userId: string,
  id: string,
  req: Request,
) {
  const campaign = await prisma.customerCampaign.findFirst({ where: { id, storeId } });
  if (!campaign) throw notFound('Campaign');
  if (campaign.status !== 'DRAFT') throw conflict('Only draft campaigns can be deleted');
  await prisma.customerCampaign.delete({ where: { id } });
  await writeAudit({
    storeId,
    userId,
    action: 'CUSTOMER_CAMPAIGN_DELETED',
    entityType: 'CustomerCampaign',
    entityId: id,
    before: { name: campaign.name, channel: campaign.channel },
    req,
  });
  return { message: 'Campaign deleted' };
}

export async function crmOverview(storeId: string) {
  const monthStart = startOfMonth();
  const atRiskCutoff = daysAgo(60);

  const [
    total,
    active,
    newThisMonth,
    repeat,
    atRisk,
    spendAgg,
    segments,
    topCustomers,
    recentCampaigns,
    dueRows,
    followUps,
    occasions,
  ] = await Promise.all([
    prisma.customer.count({ where: { storeId, deletedAt: null } }),
    prisma.customer.count({ where: { storeId, deletedAt: null, isActive: true } }),
    prisma.customer.count({ where: { storeId, deletedAt: null, createdAt: { gte: monthStart } } }),
    prisma.customer.count({ where: { storeId, deletedAt: null, isActive: true, totalPurchases: { gte: 2 } } }),
    prisma.customer.count({
      where: {
        storeId,
        deletedAt: null,
        isActive: true,
        OR: [
          { lastPurchaseAt: { lt: atRiskCutoff } },
          { lastPurchaseAt: null, createdAt: { lt: atRiskCutoff } },
        ],
      },
    }),
    prisma.customer.aggregate({
      where: { storeId, deletedAt: null, isActive: true },
      _avg: { totalSpent: true },
      _sum: { totalSpent: true },
    }),
    prisma.customer.groupBy({
      by: ['segment'],
      where: { storeId, deletedAt: null, isActive: true },
      _count: { _all: true },
    }),
    prisma.customer.findMany({
      where: { storeId, deletedAt: null, isActive: true },
      orderBy: { totalSpent: 'desc' },
      take: 5,
      select: {
        id: true,
        name: true,
        mobile: true,
        segment: true,
        totalSpent: true,
        totalPurchases: true,
        lastPurchaseAt: true,
      },
    }),
    prisma.customerCampaign.findMany({
      where: { storeId },
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: campaignListInclude,
    }),
    prisma.$queryRaw<
      {
        id: string;
        name: string;
        mobile: string;
        outstanding: string;
        creditLimit: string;
        creditDays: number;
      }[]
    >`
      SELECT c."id", c."name", c."mobile", l."balanceAfter"::text AS outstanding,
             c."creditLimit"::text AS "creditLimit", c."creditDays"
      FROM (
        SELECT DISTINCT ON ("customerId") "customerId", "balanceAfter"
        FROM "CustomerLedger"
        WHERE "storeId" = ${storeId}::uuid
        ORDER BY "customerId", "seq" DESC
      ) l
      JOIN "Customer" c ON c."id" = l."customerId"
      WHERE c."deletedAt" IS NULL AND c."isActive" = true AND l."balanceAfter" > 0
      ORDER BY l."balanceAfter" DESC
      LIMIT 6
    `,
    listFollowUps(storeId, { scope: 'open' }),
    listOccasions(storeId),
  ]);

  return {
    totals: {
      customers: total,
      active,
      newThisMonth,
      repeat,
      repeatRate: active > 0 ? round2((repeat / active) * 100) : 0,
      atRisk,
      averageLifetimeValue: round2(n(spendAgg._avg.totalSpent)),
      lifetimeSales: round2(n(spendAgg._sum.totalSpent)),
    },
    followUps: {
      counts: followUps.counts,
      items: followUps.items.slice(0, 12),
    },
    occasions: occasions.items.slice(0, 12),
    segments: segments.map((row) => ({ segment: row.segment, count: row._count._all })),
    topCustomers: topCustomers.map((customer) => ({
      ...customer,
      totalSpent: n(customer.totalSpent),
      totalPurchases: n(customer.totalPurchases),
    })),
    receivables: dueRows.map((row) => ({
      id: row.id,
      name: row.name,
      mobile: row.mobile,
      outstanding: Number(row.outstanding),
      creditLimit: Number(row.creditLimit),
      creditDays: row.creditDays,
    })),
    recentCampaigns: recentCampaigns.map(serializeCampaign),
  };
}
