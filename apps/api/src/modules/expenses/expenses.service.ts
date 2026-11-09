import type { Request } from 'express';
import { Prisma } from '@prisma/client';
import { expenseSchema, financialYear, round2 } from '@ps/shared';
import type { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { badRequest, conflict, notFound } from '../../lib/errors';
import { pageMeta, parsePagination } from '../../lib/pagination';
import { parseDateRange } from '../../lib/date-range';
import { writeAudit } from '../../lib/audit';
import { nextDocumentNumber } from '../../lib/sequence';

const n = (v: unknown) => Number(v ?? 0);
type ExpenseInput = z.infer<typeof expenseSchema>;

export async function listExpenseCategories(storeId: string) {
  const rows = await prisma.expenseCategory.findMany({
    where: { storeId },
    orderBy: { name: 'asc' },
    include: { _count: { select: { expenses: { where: { status: 'ACTIVE' } } } } },
  });
  return rows.map((c) => ({
    id: c.id,
    name: c.name,
    isSystem: c.isSystem,
    isActive: c.isActive,
    expenseCount: c._count.expenses,
  }));
}

export async function createExpenseCategory(
  storeId: string,
  userId: string,
  name: string,
  req: Request,
) {
  const existing = await prisma.expenseCategory.findFirst({ where: { storeId, name } });
  if (existing) throw conflict('An expense category with this name already exists');
  const category = await prisma.expenseCategory.create({ data: { storeId, name } });
  await writeAudit({
    storeId,
    userId,
    action: 'EXPENSE_CATEGORY_CREATED',
    entityType: 'ExpenseCategory',
    entityId: category.id,
    after: { name },
    req,
  });
  return { ...category, expenseCount: 0 };
}

export async function updateExpenseCategory(
  storeId: string,
  userId: string,
  id: string,
  input: { name?: string; isActive?: boolean },
  req: Request,
) {
  const existing = await prisma.expenseCategory.findFirst({ where: { id, storeId } });
  if (!existing) throw notFound('Expense category');
  if (input.name && input.name !== existing.name) {
    const duplicate = await prisma.expenseCategory.findFirst({
      where: { storeId, name: input.name, id: { not: id } },
    });
    if (duplicate) throw conflict('An expense category with this name already exists');
  }
  const category = await prisma.expenseCategory.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
    include: { _count: { select: { expenses: { where: { status: 'ACTIVE' } } } } },
  });
  await writeAudit({
    storeId,
    userId,
    action: 'EXPENSE_CATEGORY_UPDATED',
    entityType: 'ExpenseCategory',
    entityId: id,
    before: existing,
    after: input,
    req,
  });
  return {
    id: category.id,
    name: category.name,
    isSystem: category.isSystem,
    isActive: category.isActive,
    expenseCount: category._count.expenses,
  };
}

export async function deleteExpenseCategory(
  storeId: string,
  userId: string,
  id: string,
  req: Request,
) {
  const category = await prisma.expenseCategory.findFirst({
    where: { id, storeId },
    include: { _count: { select: { expenses: true } } },
  });
  if (!category) throw notFound('Expense category');
  if (category.isSystem) throw badRequest('System categories cannot be deleted');
  if (category._count.expenses > 0) {
    throw badRequest('This category has expenses. Deactivate it instead.');
  }
  await prisma.expenseCategory.delete({ where: { id } });
  await writeAudit({
    storeId,
    userId,
    action: 'EXPENSE_CATEGORY_DELETED',
    entityType: 'ExpenseCategory',
    entityId: id,
    before: { name: category.name },
    req,
  });
  return { message: 'Expense category deleted' };
}

export async function listExpenses(storeId: string, query: Record<string, unknown>) {
  const { page, pageSize, skip, take } = parsePagination(query);
  const search = String(query.search ?? '').trim();
  const categoryId = query.categoryId ? String(query.categoryId) : undefined;
  const status = query.status ? String(query.status) : undefined;
  const { from, to } = parseDateRange(query);

  const conditions: Prisma.ExpenseWhereInput[] = [];
  if (search) {
    conditions.push({
      OR: [
        { expenseNumber: { contains: search, mode: 'insensitive' } },
        { vendor: { contains: search, mode: 'insensitive' } },
        { reference: { contains: search, mode: 'insensitive' } },
        { notes: { contains: search, mode: 'insensitive' } },
        { category: { name: { contains: search, mode: 'insensitive' } } },
      ],
    });
  }
  const where: Prisma.ExpenseWhereInput = {
    storeId,
    ...(categoryId ? { categoryId } : {}),
    ...(status ? { status: status as never } : {}),
    ...(from || to
      ? { expenseDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
      : {}),
    ...(conditions.length ? { AND: conditions } : {}),
  };

  const [rows, total, sum] = await Promise.all([
    prisma.expense.findMany({
      where,
      orderBy: { expenseDate: 'desc' },
      skip,
      take,
      include: {
        category: { select: { id: true, name: true } },
        user: { select: { id: true, name: true } },
      },
    }),
    prisma.expense.count({ where }),
    prisma.expense.aggregate({ where: { ...where, status: 'ACTIVE' }, _sum: { amount: true } }),
  ]);

  return {
    items: rows.map((expense) => ({
      id: expense.id,
      expenseNumber: expense.expenseNumber,
      categoryId: expense.categoryId,
      category: expense.category,
      expenseDate: expense.expenseDate,
      amount: n(expense.amount),
      paymentMethod: expense.paymentMethod,
      vendor: expense.vendor,
      reference: expense.reference,
      notes: expense.notes,
      receiptUrl: expense.receiptUrl,
      status: expense.status,
      createdByUser: expense.user,
      createdAt: expense.createdAt,
    })),
    meta: pageMeta(total, page, pageSize),
    summary: { activeTotal: n(sum._sum.amount) },
  };
}

export async function getExpense(storeId: string, id: string) {
  const expense = await prisma.expense.findFirst({
    where: { id, storeId },
    include: {
      category: { select: { id: true, name: true } },
      user: { select: { id: true, name: true } },
    },
  });
  if (!expense) throw notFound('Expense');
  return { ...expense, amount: n(expense.amount) };
}

export async function createExpense(
  storeId: string,
  userId: string,
  input: ExpenseInput,
  req: Request,
) {
  const category = await prisma.expenseCategory.findFirst({
    where: { id: input.categoryId, storeId },
  });
  if (!category) throw badRequest('Select a valid expense category');
  if (!category.isActive) throw badRequest('This expense category is inactive');

  const expense = await prisma.$transaction(async (tx) => {
    const store = await tx.store.findUnique({ where: { id: storeId } });
    if (!store) throw notFound('Store');
    const fy = financialYear(new Date(), store.financialYearStartMonth);
    const expenseNumber = await nextDocumentNumber(tx, {
      storeId,
      docType: 'EXPENSE',
      financialYear: fy,
      prefix: 'EXP',
    });
    return tx.expense.create({
      data: {
        storeId,
        expenseNumber,
        categoryId: input.categoryId,
        expenseDate: new Date(input.expenseDate),
        amount: round2(input.amount),
        paymentMethod: input.paymentMethod,
        vendor: input.vendor ?? null,
        reference: input.reference ?? null,
        notes: input.notes ?? null,
        receiptUrl: input.receiptUrl ?? null,
        createdBy: userId,
      },
      include: { category: { select: { id: true, name: true } } },
    });
  });

  await writeAudit({
    storeId,
    userId,
    action: 'EXPENSE_CREATED',
    entityType: 'Expense',
    entityId: expense.id,
    after: {
      expenseNumber: expense.expenseNumber,
      amount: n(expense.amount),
      category: expense.category.name,
    },
    req,
  });

  return { ...expense, amount: n(expense.amount) };
}

export async function updateExpense(
  storeId: string,
  userId: string,
  id: string,
  input: Partial<ExpenseInput>,
  req: Request,
) {
  const before = await prisma.expense.findFirst({ where: { id, storeId } });
  if (!before) throw notFound('Expense');
  if (before.status === 'REVERSED') throw conflict('Reversed expenses cannot be edited');
  if (input.categoryId) {
    const category = await prisma.expenseCategory.findFirst({
      where: { id: input.categoryId, storeId, isActive: true },
    });
    if (!category) throw badRequest('Select a valid expense category');
  }
  const updated = await prisma.expense.update({
    where: { id },
    data: {
      ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
      ...(input.expenseDate !== undefined ? { expenseDate: new Date(input.expenseDate) } : {}),
      ...(input.amount !== undefined ? { amount: round2(input.amount) } : {}),
      ...(input.paymentMethod !== undefined ? { paymentMethod: input.paymentMethod } : {}),
      ...(input.vendor !== undefined ? { vendor: input.vendor ?? null } : {}),
      ...(input.reference !== undefined ? { reference: input.reference ?? null } : {}),
      ...(input.notes !== undefined ? { notes: input.notes ?? null } : {}),
      ...(input.receiptUrl !== undefined ? { receiptUrl: input.receiptUrl ?? null } : {}),
    },
    include: { category: { select: { id: true, name: true } } },
  });
  await writeAudit({
    storeId,
    userId,
    action: 'EXPENSE_UPDATED',
    entityType: 'Expense',
    entityId: id,
    before: { amount: n(before.amount), categoryId: before.categoryId, expenseDate: before.expenseDate },
    after: { amount: n(updated.amount), categoryId: updated.categoryId, expenseDate: updated.expenseDate },
    req,
  });
  return { ...updated, amount: n(updated.amount) };
}

export async function reverseExpense(
  storeId: string,
  userId: string,
  id: string,
  reason: string,
  req: Request,
) {
  const expense = await prisma.expense.findFirst({ where: { id, storeId } });
  if (!expense) throw notFound('Expense');
  if (expense.status === 'REVERSED') throw conflict('This expense is already reversed');
  const updated = await prisma.expense.update({
    where: { id },
    data: { status: 'REVERSED', notes: `${expense.notes ? `${expense.notes}\n` : ''}Reversed: ${reason}` },
  });
  await writeAudit({
    storeId,
    userId,
    action: 'EXPENSE_REVERSED',
    entityType: 'Expense',
    entityId: id,
    before: { status: 'ACTIVE', amount: n(expense.amount) },
    after: { status: 'REVERSED', reason },
    req,
  });
  return { ...updated, amount: n(updated.amount) };
}

export async function expenseSummary(
  storeId: string,
  query: Record<string, unknown>,
) {
  const range = parseDateRange(query);
  const now = new Date();
  const from = range.from ?? new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const to = range.to ?? new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  const rows = await prisma.$queryRaw<{ category: string; total: string; count: bigint }[]>`
    SELECT c."name" AS category,
           COALESCE(SUM(e."amount"), 0)::text AS total,
           COUNT(e."id")::bigint AS count
    FROM "Expense" e
    JOIN "ExpenseCategory" c ON c."id" = e."categoryId"
    WHERE e."storeId" = ${storeId}::uuid
      AND e."status" = 'ACTIVE'
      AND e."expenseDate" >= ${from} AND e."expenseDate" <= ${to}
    GROUP BY c."name"
    ORDER BY total DESC
  `;
  const items = rows.map((r) => ({ category: r.category, total: Number(r.total), count: Number(r.count) }));
  return {
    from,
    to,
    total: round2(items.reduce((s, r) => s + r.total, 0)),
    items,
  };
}
