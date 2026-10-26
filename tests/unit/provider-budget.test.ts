import { afterEach, expect, it, vi } from 'vitest';
import { serializedTransport, ProviderQueueTimeout } from '../../src/lib/ai/provider-budget';
import type { Transport } from '../../src/lib/ai/client';
const config = {
  key: 'synthetic',
  scope: 'GIGACHAT_API_PERS',
  model: '',
  timeout: 1000,
  maxWords: 150,
};
afterEach(() => vi.useRealTimers());
it('serializes independent answers and frees the queue after failed transport', async () => {
  let active = 0,
    maxActive = 0,
    calls = 0;
  const send: Transport = async () => {
    calls++;
    active++;
    maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => setTimeout(resolve, 2));
    active--;
    if (calls === 1) throw new Error('synthetic');
    return { status: 200, body: {} };
  };
  const queued = serializedTransport(send);
  const result = await Promise.allSettled(
    Array.from({ length: 10 }, () => queued('synthetic', {}, undefined, config)),
  );
  expect(maxActive).toBe(1);
  expect(result.filter((r) => r.status === 'fulfilled')).toHaveLength(9);
});
it('expired waiters never jump the queue or leak the distributed lock', async () => {
  vi.useFakeTimers();
  let active = 0,
    maxActive = 0,
    locks = 0,
    releases = 0;
  const send: Transport = async () => {
    active++;
    maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => setTimeout(resolve, 50));
    active--;
    return { status: 200, body: {} };
  };
  const queued = serializedTransport(send, async () => {
    locks++;
    return async () => {
      releases++;
    };
  });
  const first = queued('first', {}, undefined, config);
  const expired = expect(
    queued('expired', {}, undefined, { ...config, timeout: 10 }),
  ).rejects.toBeInstanceOf(ProviderQueueTimeout);
  const third = queued('third', {}, undefined, config);
  await vi.runAllTimersAsync();
  await Promise.all([first, expired, third]);
  expect(maxActive).toBe(1);
  expect(locks).toBe(2);
  expect(releases).toBe(2);
});
