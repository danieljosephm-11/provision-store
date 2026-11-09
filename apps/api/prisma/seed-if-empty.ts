import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

/**
 * First-boot seed guard.
 *
 * The full seed is idempotent for configuration, but it also resets the system
 * roles' permissions. Running it on every deploy would silently undo role edits
 * made by the store owner. This wrapper only seeds when the database has no
 * users yet, which is exactly the first boot after `prisma migrate deploy`.
 */
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.count();
  if (users > 0) {
    console.log(`Database already seeded (${users} user(s)); skipping seed.`);
    return;
  }

  if (!process.env.SEED_ADMIN_PASSWORD) {
    throw new Error('SEED_ADMIN_PASSWORD is required for the first boot seed.');
  }

  console.log('Empty database detected; running the full seed...');
  const result = spawnSync('npx', ['tsx', 'prisma/seed.ts'], {
    stdio: 'inherit',
    env: process.env,
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) {
    throw new Error(`Seed failed with exit code ${result.status ?? 'unknown'}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
