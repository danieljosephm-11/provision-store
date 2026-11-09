import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import {
  DEFAULT_CATEGORIES,
  DEFAULT_EXPENSE_CATEGORIES,
  DEFAULT_GST_SLABS,
  DEFAULT_UNITS,
  PERMISSIONS,
  ROLE_PERMISSIONS,
  SYSTEM_ROLES,
} from '@ps/shared';

const prisma = new PrismaClient();

const ADMIN_EMAIL = (process.env.SEED_ADMIN_EMAIL ?? 'admin@provisionstore.local').toLowerCase();
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD;
const ADMIN_NAME = process.env.SEED_ADMIN_NAME ?? 'Store Owner';
const STORE_NAME = process.env.SEED_STORE_NAME ?? 'Smart Provision Store';
const STORE_GSTIN = process.env.SEED_STORE_GSTIN ?? null;
const STORE_STATE = process.env.SEED_STORE_STATE_CODE ?? '33';

async function main() {
  if (!ADMIN_PASSWORD) {
    throw new Error('SEED_ADMIN_PASSWORD is required; set a unique password before seeding.');
  }

  console.log('Seeding configuration...');

  // Permissions catalog
  for (const permission of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key: permission.key },
      create: permission,
      update: { module: permission.module, description: permission.description },
    });
  }
  console.log(`  ✓ ${PERMISSIONS.length} permissions`);

  // Store
  let store = await prisma.store.findFirst();
  if (!store) {
    store = await prisma.store.create({
      data: {
        name: STORE_NAME,
        legalName: STORE_NAME,
        gstin: STORE_GSTIN,
        stateCode: STORE_STATE,
        invoicePrefix: 'INV',
        address: 'Main Road',
        city: 'Chennai',
        pincode: '600001',
        phone: '9876543210',
        email: ADMIN_EMAIL,
        billFooter: 'Thank you for shopping with us!',
      },
    });
    console.log(`  ✓ store "${store.name}"`);
  } else {
    console.log(`  • store exists: ${store.name}`);
  }

  // Roles + permissions
  for (const roleName of SYSTEM_ROLES) {
    const role = await prisma.role.upsert({
      where: { storeId_name: { storeId: store.id, name: roleName } },
      create: { storeId: store.id, name: roleName, isSystem: true },
      update: { isSystem: true },
    });
    const keys = ROLE_PERMISSIONS[roleName];
    await prisma.$transaction([
      prisma.rolePermission.deleteMany({ where: { roleId: role.id } }),
      prisma.rolePermission.createMany({
        data: keys.map((permissionId) => ({ roleId: role.id, permissionId })),
        skipDuplicates: true,
      }),
    ]);
  }
  console.log(`  ✓ ${SYSTEM_ROLES.length} roles synced`);

  // Admin
  const adminRole = await prisma.role.findUniqueOrThrow({
    where: { storeId_name: { storeId: store.id, name: 'Admin' } },
  });
  const existingAdmin = await prisma.user.findFirst({ where: { storeId: store.id, email: ADMIN_EMAIL } });
  if (!existingAdmin) {
    await prisma.user.create({
      data: {
        storeId: store.id,
        name: ADMIN_NAME,
        email: ADMIN_EMAIL,
        passwordHash: await bcrypt.hash(ADMIN_PASSWORD, 12),
        roleId: adminRole.id,
        status: 'ACTIVE',
        mustChangePassword: false,
      },
    });
    console.log(`  ✓ admin ${ADMIN_EMAIL}`);
  } else {
    await prisma.user.update({
      where: { id: existingAdmin.id },
      data: { roleId: adminRole.id, status: 'ACTIVE', deletedAt: null },
    });
    console.log(`  • admin exists: ${ADMIN_EMAIL}`);
  }

  // Units
  for (const unit of DEFAULT_UNITS) {
    await prisma.unit.upsert({
      where: { storeId_code: { storeId: store.id, code: unit.code } },
      create: { storeId: store.id, ...unit, isSystem: true },
      update: { name: unit.name, allowsDecimal: unit.allowsDecimal, isSystem: true },
    });
  }
  console.log(`  ✓ ${DEFAULT_UNITS.length} units`);

  // GST slabs (rates remain configurable, never hardcoded in billing)
  for (const rate of DEFAULT_GST_SLABS) {
    const name = rate === 0 ? 'GST 0%' : `GST ${rate}%`;
    await prisma.taxRate.upsert({
      where: { storeId_name: { storeId: store.id, name } },
      create: { storeId: store.id, name, rate, isActive: true, isDefault: rate === 5 },
      update: { rate, isActive: true },
    });
  }
  console.log(`  ✓ ${DEFAULT_GST_SLABS.length} GST slabs`);

  // Categories
  for (const name of DEFAULT_CATEGORIES) {
    const existing = await prisma.category.findFirst({ where: { storeId: store.id, name } });
    if (!existing) await prisma.category.create({ data: { storeId: store.id, name } });
  }
  console.log(`  ✓ ${DEFAULT_CATEGORIES.length} categories`);

  // Expense categories
  for (const name of DEFAULT_EXPENSE_CATEGORIES) {
    await prisma.expenseCategory.upsert({
      where: { storeId_name: { storeId: store.id, name } },
      create: { storeId: store.id, name, isSystem: true },
      update: { isSystem: true },
    });
  }
  console.log(`  ✓ ${DEFAULT_EXPENSE_CATEGORIES.length} expense categories`);

  // Default location
  const location = await prisma.location.findFirst({ where: { storeId: store.id } });
  if (!location) {
    await prisma.location.create({ data: { storeId: store.id, name: 'Main Store', isDefault: true } });
    console.log('  ✓ default location');
  }

  // Default loyalty rule
  const rule = await prisma.loyaltyRule.findFirst({ where: { storeId: store.id } });
  if (!rule) {
    await prisma.loyaltyRule.create({
      data: {
        storeId: store.id,
        name: 'Default loyalty',
        earnPerAmount: store.loyaltyEarnPerAmount,
        pointValue: store.loyaltyPointValue,
        isActive: true,
      },
    });
    console.log('  ✓ loyalty rule');
  }

  console.log('\nSeed complete.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
