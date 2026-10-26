import { Pool, type PoolClient } from 'pg';
import type { Transport } from './client';
export type ProviderLock = (deadline: number) => Promise<() => Promise<void>>;
export class ProviderQueueTimeout extends Error {
  constructor() {
    super('Provider queue deadline exceeded');
  }
}
const remaining = (deadline: number) => {
  const ms = deadline - Date.now();
  if (ms <= 0) throw new ProviderQueueTimeout();
  return ms;
};
async function beforeDeadline<T>(promise: Promise<T>, deadline: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new ProviderQueueTimeout()), remaining(deadline));
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
// A session advisory lock coordinates app, background jobs and acceptance tools.
// It never locks questions/submissions or keeps a SQL transaction open over HTTP.
export function postgresProviderLock(pool: Pick<Pool, 'connect'>): ProviderLock {
  return async (deadline) => {
    let client: PoolClient | undefined;
    let acquired = false;
    try {
      const opening = pool.connect();
      try {
        client = await beforeDeadline(opening, deadline);
      } catch (error) {
        void opening.then(
          (late) => late.release(true),
          () => {},
        );
        throw error;
      }
      while (remaining(deadline) > 0) {
        acquired = (
          await beforeDeadline(
            client.query('SELECT pg_try_advisory_lock(714021,5) locked'),
            deadline,
          )
        ).rows[0].locked;
        if (acquired) break;
        await new Promise((resolve) => setTimeout(resolve, Math.min(50, remaining(deadline))));
      }
      const held = client;
      return async () => {
        try {
          await held.query('SELECT pg_advisory_unlock(714021,5)');
        } catch {
          held.release(true);
          return;
        }
        held.release();
      };
    } catch (error) {
      // Destroying the session also releases any lock if an acquisition reply was lost.
      client?.release(true);
      throw error;
    }
  };
}
let pool: Pool | undefined;
export function configuredProviderLock(): ProviderLock | undefined {
  if (!process.env.DATABASE_URL) return undefined;
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 1,
      connectionTimeoutMillis: 2000,
      idleTimeoutMillis: 1000,
      statement_timeout: 2000,
      allowExitOnIdle: true,
    });
    pool.on('error', ignoreIdleError);
  }
  return postgresProviderLock(pool);
}
function ignoreIdleError() {
  /* Connection errors are reported by the request, never log payloads. */
}
// FIFO within each process; only the current local request reserves a PG session.
export function serializedTransport(send: Transport, lock?: ProviderLock): Transport {
  let tail = Promise.resolve();
  return async (url, headers, body, config) => {
    const deadline = Date.now() + config.timeout;
    const previous = tail;
    let done!: () => void;
    const current = new Promise<void>((resolve) => {
      done = resolve;
    });
    tail = previous.catch(() => {}).then(() => current);
    let release: (() => Promise<void>) | undefined;
    try {
      await beforeDeadline(previous, deadline);
      if (lock) release = await lock(deadline);
      return await send(url, headers, body, { ...config, timeout: remaining(deadline) });
    } finally {
      try {
        await release?.();
      } finally {
        done();
      }
    }
  };
}
