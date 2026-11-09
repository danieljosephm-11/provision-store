import type { Request } from 'express';
import { prisma } from '../../lib/prisma';
import { badRequest, notFound } from '../../lib/errors';
import { writeAudit } from '../../lib/audit';

// ── Categories ───────────────────────────────────────────────────────
export async function listCategories(storeId: string) {
  const items = await prisma.category.findMany({
    where: { storeId, deletedAt: null },
    orderBy: { name: 'asc' },
    include: { _count: { select: { products: { where: { deletedAt: null } } } } },
  });
  return items.map((c) => ({
    id: c.id,
    name: c.name,
    parentId: c.parentId,
    isActive: c.isActive,
    productCount: c._count.products,
  }));
}

export async function createCategory(
  storeId: string,
  userId: string,
  input: { name: string; parentId?: string | null; isActive?: boolean },
  req: Request,
) {
  if (input.parentId) {
    const parent = await prisma.category.findFirst({ where: { id: input.parentId, storeId } });
    if (!parent) throw badRequest('Parent category not found');
  }
  const category = await prisma.category.create({
    data: { storeId, name: input.name, parentId: input.parentId ?? null, isActive: input.isActive ?? true },
  });
  await writeAudit({ storeId, userId, action: 'CATEGORY_CREATED', entityType: 'Category', entityId: category.id, after: input, req });
  return { ...category, productCount: 0 };
}

export async function updateCategory(
  storeId: string,
  userId: string,
  id: string,
  input: { name?: string; parentId?: string | null; isActive?: boolean },
  req: Request,
) {
  const existing = await prisma.category.findFirst({ where: { id, storeId, deletedAt: null } });
  if (!existing) throw notFound('Category');
  if (input.parentId === id) throw badRequest('A category cannot be its own parent');
  if (input.parentId) {
    const parent = await prisma.category.findFirst({ where: { id: input.parentId, storeId } });
    if (!parent) throw badRequest('Parent category not found');
  }
  const category = await prisma.category.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
    },
    include: { _count: { select: { products: true } } },
  });
  await writeAudit({ storeId, userId, action: 'CATEGORY_UPDATED', entityType: 'Category', entityId: id, before: existing, after: input, req });
  return { ...category, productCount: category._count.products, _count: undefined };
}

export async function deleteCategory(storeId: string, userId: string, id: string, req: Request) {
  const category = await prisma.category.findFirst({
    where: { id, storeId, deletedAt: null },
    include: { _count: { select: { products: true, children: true } } },
  });
  if (!category) throw notFound('Category');
  if (category._count.products > 0) throw badRequest('Move products out of this category before deleting it');
  if (category._count.children > 0) throw badRequest('Delete or move sub-categories first');
  await prisma.category.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
  await writeAudit({ storeId, userId, action: 'CATEGORY_DELETED', entityType: 'Category', entityId: id, before: { name: category.name }, req });
  return { message: 'Category deleted' };
}

// ── Brands ───────────────────────────────────────────────────────────
export async function listBrands(storeId: string) {
  const items = await prisma.brand.findMany({
    where: { storeId },
    orderBy: { name: 'asc' },
    include: { _count: { select: { products: { where: { deletedAt: null } } } } },
  });
  return items.map((b) => ({ id: b.id, name: b.name, isActive: b.isActive, productCount: b._count.products }));
}

export async function createBrand(storeId: string, userId: string, name: string, req: Request) {
  const brand = await prisma.brand.create({ data: { storeId, name } });
  await writeAudit({ storeId, userId, action: 'BRAND_CREATED', entityType: 'Brand', entityId: brand.id, after: { name }, req });
  return { ...brand, productCount: 0 };
}

export async function updateBrand(storeId: string, userId: string, id: string, input: { name?: string; isActive?: boolean }, req: Request) {
  const existing = await prisma.brand.findFirst({ where: { id, storeId } });
  if (!existing) throw notFound('Brand');
  const brand = await prisma.brand.update({
    where: { id },
    data: { ...(input.name !== undefined ? { name: input.name } : {}), ...(input.isActive !== undefined ? { isActive: input.isActive } : {}) },
    include: { _count: { select: { products: true } } },
  });
  await writeAudit({ storeId, userId, action: 'BRAND_UPDATED', entityType: 'Brand', entityId: id, before: existing, after: input, req });
  return { id: brand.id, name: brand.name, isActive: brand.isActive, productCount: brand._count.products };
}

export async function deleteBrand(storeId: string, userId: string, id: string, req: Request) {
  const brand = await prisma.brand.findFirst({ where: { id, storeId }, include: { _count: { select: { products: true } } } });
  if (!brand) throw notFound('Brand');
  if (brand._count.products > 0) throw badRequest('Move products away from this brand before deleting it');
  await prisma.brand.delete({ where: { id } });
  await writeAudit({ storeId, userId, action: 'BRAND_DELETED', entityType: 'Brand', entityId: id, before: { name: brand.name }, req });
  return { message: 'Brand deleted' };
}

// ── Units ────────────────────────────────────────────────────────────
export async function listUnits(storeId: string) {
  return prisma.unit.findMany({
    where: { storeId },
    orderBy: { name: 'asc' },
    include: { _count: { select: { products: { where: { deletedAt: null } } } } },
  }).then((units) => units.map((u) => ({ ...u, productCount: u._count.products, _count: undefined })));
}

export async function createUnit(storeId: string, userId: string, input: { name: string; code: string; allowsDecimal?: boolean }, req: Request) {
  const unit = await prisma.unit.create({
    data: { storeId, name: input.name, code: input.code.toUpperCase(), allowsDecimal: input.allowsDecimal ?? false },
  });
  await writeAudit({ storeId, userId, action: 'UNIT_CREATED', entityType: 'Unit', entityId: unit.id, after: input, req });
  return unit;
}

export async function updateUnit(storeId: string, userId: string, id: string, input: { name?: string; code?: string; allowsDecimal?: boolean }, req: Request) {
  const existing = await prisma.unit.findFirst({ where: { id, storeId } });
  if (!existing) throw notFound('Unit');
  const unit = await prisma.unit.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.code !== undefined ? { code: input.code.toUpperCase() } : {}),
      ...(input.allowsDecimal !== undefined ? { allowsDecimal: input.allowsDecimal } : {}),
    },
  });
  await writeAudit({ storeId, userId, action: 'UNIT_UPDATED', entityType: 'Unit', entityId: id, before: existing, after: input, req });
  return unit;
}

export async function deleteUnit(storeId: string, userId: string, id: string, req: Request) {
  const unit = await prisma.unit.findFirst({ where: { id, storeId }, include: { _count: { select: { products: true } } } });
  if (!unit) throw notFound('Unit');
  if (unit._count.products > 0) throw badRequest('This unit is used by products and cannot be deleted');
  if (unit.isSystem) throw badRequest('System units cannot be deleted');
  await prisma.unit.delete({ where: { id } });
  await writeAudit({ storeId, userId, action: 'UNIT_DELETED', entityType: 'Unit', entityId: id, before: { name: unit.name }, req });
  return { message: 'Unit deleted' };
}

// ── GST rates ────────────────────────────────────────────────────────
export async function listTaxRates(storeId: string) {
  return prisma.taxRate.findMany({
    where: { storeId },
    orderBy: { rate: 'asc' },
    include: { _count: { select: { products: { where: { deletedAt: null } } } } },
  }).then((rates) => rates.map((r) => ({ ...r, productCount: r._count.products, _count: undefined })));
}

export async function createTaxRate(
  storeId: string,
  userId: string,
  input: { name: string; rate: number; cessRate?: number; hsnCode?: string | null; isDefault?: boolean; isActive?: boolean },
  req: Request,
) {
  const tax = await prisma.$transaction(async (tx) => {
    if (input.isDefault) await tx.taxRate.updateMany({ where: { storeId }, data: { isDefault: false } });
    return tx.taxRate.create({
      data: {
        storeId,
        name: input.name,
        rate: input.rate,
        cessRate: input.cessRate ?? 0,
        hsnCode: input.hsnCode ?? null,
        isDefault: input.isDefault ?? false,
        isActive: input.isActive ?? true,
      },
    });
  });
  await writeAudit({ storeId, userId, action: 'TAX_RATE_CREATED', entityType: 'TaxRate', entityId: tax.id, after: input, req });
  return tax;
}

export async function updateTaxRate(
  storeId: string,
  userId: string,
  id: string,
  input: { name?: string; rate?: number; cessRate?: number; hsnCode?: string | null; isDefault?: boolean; isActive?: boolean },
  req: Request,
) {
  const existing = await prisma.taxRate.findFirst({ where: { id, storeId } });
  if (!existing) throw notFound('Tax rate');
  const tax = await prisma.$transaction(async (tx) => {
    if (input.isDefault) await tx.taxRate.updateMany({ where: { storeId, id: { not: id } }, data: { isDefault: false } });
    return tx.taxRate.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.rate !== undefined ? { rate: input.rate } : {}),
        ...(input.cessRate !== undefined ? { cessRate: input.cessRate } : {}),
        ...(input.hsnCode !== undefined ? { hsnCode: input.hsnCode } : {}),
        ...(input.isDefault !== undefined ? { isDefault: input.isDefault } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
    });
  });
  await writeAudit({ storeId, userId, action: 'TAX_RATE_UPDATED', entityType: 'TaxRate', entityId: id, before: existing, after: input, req });
  return tax;
}

export async function deleteTaxRate(storeId: string, userId: string, id: string, req: Request) {
  const tax = await prisma.taxRate.findFirst({ where: { id, storeId }, include: { _count: { select: { products: true } } } });
  if (!tax) throw notFound('Tax rate');
  if (tax._count.products > 0) throw badRequest('This GST rate is used by products. Reassign them first.');
  await prisma.taxRate.update({ where: { id }, data: { isActive: false } });
  await writeAudit({ storeId, userId, action: 'TAX_RATE_DEACTIVATED', entityType: 'TaxRate', entityId: id, before: { name: tax.name }, req });
  return { message: 'GST rate deactivated' };
}
