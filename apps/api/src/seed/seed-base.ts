/**
 * Production-safe seed: inserts missing reference data (catalog, prices, plans, rules, campaign,
 * CMS, notification templates, zones, centres) and never modifies or deletes existing documents.
 *
 * Run: `pnpm --filter api seed:base` (builds first) or `node dist/seed/seed-base.js` in a container.
 */
import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { getConnectionToken } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import { SeedModule, seedBase } from './base.js';

const log = new Logger('Seed:base');

async function main() {
  const app = await NestFactory.createApplicationContext(SeedModule, { logger: ['error', 'warn', 'log'] });
  try {
    const conn = app.get<Connection>(getConnectionToken());
    // make sure unique indexes exist before upserting on their keys
    await Promise.all(Object.values(conn.models).map((m) => m.createIndexes()));
    await seedBase(app, log);
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  log.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
  process.exit(1);
});
