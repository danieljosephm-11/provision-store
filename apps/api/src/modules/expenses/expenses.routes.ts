import { Router } from 'express';
import { z } from 'zod';
import { expenseSchema } from '@ps/shared';
import { authenticate, requirePermission } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import * as controller from './expenses.controller';

const router = Router();
router.use(authenticate);

// Categories
router.get('/expense-categories', requirePermission('expense.read'), controller.listCategories);
router.post(
  '/expense-categories',
  requirePermission('expense.category.manage'),
  validate(z.object({ name: z.string().trim().min(1).max(80) })),
  controller.createCategory,
);
router.patch(
  '/expense-categories/:id',
  requirePermission('expense.category.manage'),
  validate(z.object({ name: z.string().trim().min(1).max(80).optional(), isActive: z.boolean().optional() })),
  controller.updateCategory,
);
router.delete(
  '/expense-categories/:id',
  requirePermission('expense.category.manage'),
  controller.deleteCategory,
);

// Expenses
router.get('/expenses', requirePermission('expense.read'), controller.list);
router.get('/expenses/summary', requirePermission('expense.read'), controller.summary);
router.post('/expenses', requirePermission('expense.create'), validate(expenseSchema), controller.create);
router.get('/expenses/:id', requirePermission('expense.read'), controller.get);
router.patch('/expenses/:id', requirePermission('expense.update'), validate(expenseSchema.partial()), controller.update);
router.post(
  '/expenses/:id/reverse',
  requirePermission('expense.delete'),
  validate(z.object({ reason: z.string().trim().min(3, 'Give a reason').max(500) })),
  controller.reverse,
);

export default router;
