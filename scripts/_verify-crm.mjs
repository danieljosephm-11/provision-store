/*
 * One-off verification of the CRM surface and demo data. Not part of the app.
 */
import { PrismaClient } from '@prisma/client';

const rawBase = (process.env.API_URL ?? 'http://localhost:4000/api/v1').replace(/\/$/, '');
const base = rawBase.endsWith('/api/v1') ? rawBase : `${rawBase}/api/v1`;
const adminPassword = process.env.SEED_ADMIN_PASSWORD;
if (!adminPassword) throw new Error('Set SEED_ADMIN_PASSWORD in this shell before verifying the CRM.');
console.log(`Verifying against ${base}`);
const prisma = new PrismaClient();
let token = '';
let failures = 0;

function check(ok, label, detail = '') {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures += 1;
}

async function req(method, path, body, raw = false) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const type = res.headers.get('content-type') ?? '';
  const data = raw ? await res.text() : type.includes('application/json') ? await res.json() : await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

const login = await req('POST', '/auth/login', {
  email: 'admin@provisionstore.local',
  password: adminPassword,
});
token = login.accessToken;

const overview = (await req('GET', '/crm/overview')).item;
check(overview.totals.customers >= 12, 'Overview totals', JSON.stringify(overview.totals));
check(overview.followUps.items.length > 0, 'Overview follow-up queue', `${overview.followUps.items.length} items`);
check(overview.occasions.length > 0, 'Overview occasions', `${overview.occasions.length} items`);
check(overview.segments.length > 0, 'Overview segments', overview.segments.map((r) => `${r.segment}:${r.count}`).join(', '));
check(overview.receivables.length > 0, 'Overview receivables', `${overview.receivables.length} customers`);

const list = await req('GET', '/customers?page=1&pageSize=100');
check(list.meta.total >= 12, 'Customer list', `${list.meta.total} total`);
const priya = list.items.find((row) => row.mobile === '9841012001');
const ganesh = list.items.find((row) => row.mobile === '9841012012');
check(!!priya && !!ganesh, 'Demo customers present');
check(Array.isArray(priya.tags) && priya.tags.includes('VIP'), 'Tags on list row', JSON.stringify(priya.tags));

const detail = (await req('GET', `/customers/${priya.id}`)).item;
check(detail.birthday && detail.anniversary, 'Birthday and anniversary', `${detail.birthday} / ${detail.anniversary}`);
check(detail.activities.length > 0, 'Customer activities', `${detail.activities.length}`);
check(Array.isArray(detail.campaigns), 'Customer campaigns included', `${detail.campaigns.length} rows`);
check(!!detail.insights, 'Buying insights', Object.keys(detail.insights).join(', '));
check(Array.isArray(detail.insights.favouriteProducts), 'Favourite products', `${detail.insights.favouriteProducts.length} rows`);
check(Array.isArray(detail.insights.monthlySpend) && detail.insights.monthlySpend.length === 6, 'Six-month spend trend');
check(detail.availableCredit >= 0, 'Available credit', String(detail.availableCredit));

const timeline = await req('GET', `/customers/${priya.id}/timeline?limit=50`);
const kinds = [...new Set(timeline.items.map((row) => row.kind))];
check(timeline.items.length > 0, 'Timeline', `${timeline.items.length} items (${kinds.join(', ')})`);

const openFollowUps = await req('GET', '/customers/follow-ups?scope=open');
const overdue = await req('GET', '/customers/follow-ups?scope=overdue');
const today = await req('GET', '/customers/follow-ups?scope=today');
check(openFollowUps.items.length > 0, 'Follow-up scopes', `open ${openFollowUps.items.length}, overdue ${overdue.items.length}, today ${today.items.length}`);

const occasions = (await req('GET', '/customers/occasions')).item.items;
check(occasions.length > 0, 'Occasions list', `${occasions.length} within 45 days`);

const csv = await req('GET', '/customers/export', undefined, true);
const csvLines = csv.trim().split(/\r?\n/);
const csvHeader = csvLines[0].toLowerCase();
check(csvHeader.includes('name') && csvHeader.includes('mobile') && csvLines.length >= 13, 'CSV export', `${csvLines.length - 1} rows, header: ${csvLines[0].slice(0, 70)}`);

const importMobile = '9841012099';
await prisma.customer.deleteMany({ where: { mobile: importMobile } });
const importCsv = [
  'name,mobile,email,tags,birthday,anniversary,creditLimit,creditDays,city,stateCode',
  `Import Check Customer,${importMobile},import.check@example.com,"import-check",1991-04-10,,5000,15,Chennai,33`,
].join('\n');
const imported = (await req('POST', '/customers/import', { csv: importCsv })).item;
check(imported.created === 1, 'CSV import', JSON.stringify(imported));
await prisma.customer.deleteMany({ where: { mobile: importMobile } });

const audience = (await req('GET', '/crm/audience?inactiveDays=60')).item;
check(audience.count > 0, 'Campaign audience preview', `${audience.count} lapsed customers`);

// Activity create → complete → delete on a real customer
const rahul = list.items.find((row) => row.mobile === '9841012010');
const activity = (await req('POST', `/customers/${rahul.id}/activities`, {
  type: 'CALL',
  subject: 'QA lifecycle call',
  body: 'Temporary verification activity.',
  dueAt: null,
  completed: false,
})).item;
const completed = (await req('PATCH', `/customers/${rahul.id}/activities/${activity.id}`, {
  completed: true,
})).item;
check(!!completed.completedAt, 'Activity create + complete', completed.subject);
await req('DELETE', `/customers/${rahul.id}/activities/${activity.id}`);
const afterDelete = (await req('GET', `/customers/${rahul.id}`)).item.activities.find((row) => row.id === activity.id);
check(!afterDelete, 'Activity delete');

// Full campaign lifecycle on a throwaway campaign
const stamp = Date.now().toString(36);
const campaignName = `QA lifecycle ${stamp}`;
const campaign = (await req('POST', '/crm/campaigns', {
  name: campaignName,
  channel: 'WHATSAPP',
  message: 'Hi {firstName}, this is a verification message from {store}.',
  segment: null,
  minSpend: 0,
  inactiveDays: 60,
  includeInactive: false,
})).item;
check(campaign.status === 'DRAFT', 'Campaign created', `${campaign.name} (${campaign.audienceCount} audience)`);
const launched = (await req('POST', `/crm/campaigns/${campaign.id}/launch`)).item;
check(launched.status === 'RUNNING' && launched.audienceCount > 0, 'Campaign launch', `${launched.audienceCount} recipients`);
const campaignDetail = (await req('GET', `/crm/campaigns/${campaign.id}`)).item;
const firstRecipient = campaignDetail.recipients[0];
const sent = (await req('POST', `/crm/campaigns/${campaign.id}/recipients/${firstRecipient.id}/sent`)).item;
check(sent.status === 'SENT', 'Campaign recipient marked sent');
const done = (await req('POST', `/crm/campaigns/${campaign.id}/complete`)).item;
check(done.status === 'COMPLETED', 'Campaign completed');
await prisma.customerCampaign.delete({ where: { id: campaign.id } });

const demoCampaigns = (await req('GET', '/crm/campaigns')).items;
check(
  demoCampaigns.some((row) => row.name === 'Diwali VIP preview' && row.status === 'DRAFT'),
  'Demo draft campaign remains launchable',
);
check(
  demoCampaigns.some((row) => row.name.startsWith('Win-back') && row.status === 'RUNNING'),
  'Demo running campaign present',
);

await prisma.$disconnect();
console.log(failures === 0 ? '\nAll CRM checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
