// Prisma client singleton.
//
// Node's module cache makes this a true singleton in production. The
// globalThis guard exists for `node --watch` and vitest, which reload
// modules and would otherwise open a new connection pool per reload
// until Postgres refuses connections.

import { PrismaClient } from '@prisma/client';
import { env, isProduction } from './env.js';

const createClient = () =>
  new PrismaClient({
    log: isProduction ? ['error'] : ['error', 'warn'],
    datasources: { db: { url: env.DATABASE_URL } },
  });

const globalForPrisma = globalThis;

export const prisma = globalForPrisma.__rednexusPrisma ?? createClient();

if (!isProduction) {
  globalForPrisma.__rednexusPrisma = prisma;
}

export default prisma;
