import { afterAll, expect, it } from 'vitest';
import { Pool } from 'pg';
import { postgresProviderLock, serializedTransport } from '../../src/lib/ai/provider-budget';
import type { Transport } from '../../src/lib/ai/client';
const pools = [0, 1].map(
  () =>
    new Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 2000 }),
);
afterAll(async () => {
  await Promise.all(pools.map((pool) => pool.end()));
});
it.skipIf(process.env.DB_POOL_MAX === '1')(
  'coordinates separate client pools and releases the PG lock after provider failure',
  async () => {
    let active = 0,
      maxActive = 0,
      calls = 0;
    const send: Transport = async () => {
      calls++;
      const call = calls;
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 15));
      active--;
      if (call === 1) throw new Error('synthetic');
      return { status: 200, body: {} };
    };
    const transports = pools.map((pool) => serializedTransport(send, postgresProviderLock(pool)));
    const config = {
      key: 'synthetic',
      scope: 'GIGACHAT_API_PERS',
      model: '',
      timeout: 10000,
      maxWords: 150,
    };
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, (_, i) => transports[i % 2]('synthetic', {}, undefined, config)),
    );
    expect(maxActive).toBe(1);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(7);
    for (const pool of pools) {
      const c = await pool.connect();
      try {
        expect((await c.query('SELECT pg_try_advisory_lock(714021,5) locked')).rows[0].locked).toBe(
          true,
        );
        await c.query('SELECT pg_advisory_unlock(714021,5)');
      } finally {
        c.release();
      }
    }
  },
);
